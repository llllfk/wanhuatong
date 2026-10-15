import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { AssignableGesture } from './design-config';
import { classifyHand, GestureTracker, type GestureKind } from './gestures';

export type EngineGesture = GestureKind;

export interface GestureFrame {
  /** 当前稳定手势 */
  gesture: EngineGesture;
  /** 镜像视角下的水平挥动速度（屏幕宽度/秒），正为向右 */
  waveSpeed: number;
  /** 本帧是否完成一次离散触发（握拳/比耶等保持后触发） */
  triggered: AssignableGesture | null;
  /** 镜像后的关键点，用于绘制骨架 */
  landmarks: NormalizedLandmark[] | null;
}

export interface GestureEngineOptions {
  onFrame: (frame: GestureFrame) => void;
}

const WASM_PATH = '/vendor/mediapipe/wasm';
const MODEL_PATH = '/vendor/mediapipe/hand_landmarker.task';
const DETECT_INTERVAL_MS = 40;

/**
 * MediaPipe HandLandmarker 封装：
 * - 模型与 WASM 均从本站 /vendor/mediapipe 加载，摄像头画面不出设备；
 * - GPU 委托失败时自动回退 CPU；
 * - 输出坐标统一做镜像翻转，与自拍预览画面方向一致。
 */
export class GestureEngine {
  private readonly video: HTMLVideoElement;
  private readonly overlay: HTMLCanvasElement;
  private readonly options: GestureEngineOptions;
  private readonly tracker = new GestureTracker();

  private landmarker: HandLandmarker | null = null;
  private rafId: number | null = null;
  private lastDetectAt = 0;
  private stopped = false;

  constructor(
    video: HTMLVideoElement,
    overlay: HTMLCanvasElement,
    options: GestureEngineOptions,
  ) {
    this.video = video;
    this.overlay = overlay;
    this.options = options;
  }

  async init(): Promise<void> {
    const vision = await FilesetResolver.forVisionTasks(WASM_PATH);

    const createOptions = {
      baseOptions: {
        modelAssetPath: MODEL_PATH,
        delegate: 'GPU' as const,
      },
      runningMode: 'VIDEO' as const,
      numHands: 1,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    };

    try {
      this.landmarker = await HandLandmarker.createFromOptions(vision, createOptions);
    } catch (gpuError) {
      console.warn('[GestureEngine] GPU 委托初始化失败，回退 CPU：', gpuError);
      this.landmarker = await HandLandmarker.createFromOptions(vision, {
        ...createOptions,
        baseOptions: { ...createOptions.baseOptions, delegate: 'CPU' },
      });
    }
  }

  start(): void {
    if (this.landmarker === null) {
      throw new Error('GestureEngine 尚未初始化');
    }
    this.stopped = false;
    this.tracker.reset();
    const loop = (): void => {
      if (this.stopped) return;
      this.tick();
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stop(): void {
    this.stopped = true;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.landmarker?.close();
    this.landmarker = null;
    this.tracker.reset();
    this.clearOverlay();
  }

  private tick(): void {
    const landmarker = this.landmarker;
    if (!landmarker || this.video.readyState < 2) {
      this.emitIdle();
      return;
    }

    const nowMs = performance.now();
    if (nowMs - this.lastDetectAt < DETECT_INTERVAL_MS) {
      return;
    }
    this.lastDetectAt = nowMs;

    let result;
    try {
      result = landmarker.detectForVideo(this.video, nowMs);
    } catch (error) {
      console.warn('[GestureEngine] 检测失败：', error);
      this.emitIdle();
      return;
    }

    const rawLandmarks = result.landmarks[0];
    if (!rawLandmarks) {
      this.tracker.update('none', null, nowMs);
      this.clearOverlay();
      this.emit('none', 0, null, null);
      return;
    }

    const landmarks: NormalizedLandmark[] = rawLandmarks.map((p) => ({
      ...p,
      x: 1 - p.x,
    }));

    const kind = classifyHand(rawLandmarks);
    const palmX = 1 - (rawLandmarks[9]?.x ?? 0.5);
    const tracked = this.tracker.update(kind, palmX, nowMs);

    this.drawOverlay(landmarks, kind);
    this.emit(tracked.kind, tracked.waveSpeed, tracked.triggered, landmarks);
  }

  private emit(
    gesture: EngineGesture,
    waveSpeed: number,
    triggered: AssignableGesture | null,
    landmarks: NormalizedLandmark[] | null,
  ): void {
    this.options.onFrame({ gesture, waveSpeed, triggered, landmarks });
  }

  private emitIdle(): void {
    this.emit('none', 0, null, null);
  }

  private clearOverlay(): void {
    const ctx = this.overlay.getContext('2d');
    ctx?.clearRect(0, 0, this.overlay.width, this.overlay.height);
  }

  private drawOverlay(landmarks: NormalizedLandmark[], kind: EngineGesture): void {
    const canvas = this.overlay;
    const videoWidth = this.video.videoWidth;
    const videoHeight = this.video.videoHeight;
    if (videoWidth === 0 || videoHeight === 0) return;
    if (canvas.width !== videoWidth || canvas.height !== videoHeight) {
      canvas.width = videoWidth;
      canvas.height = videoHeight;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const color =
      kind === 'fist'
        ? '#ffc23f'
        : kind === 'palm'
          ? '#43e7e0'
          : kind === 'peace'
            ? '#a78bfa'
            : kind === 'point'
              ? '#fb7185'
              : '#ff8fb3';

    ctx.lineWidth = 4;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;

    for (const pair of HAND_CONNECTIONS) {
      const [a, b] = pair;
      const pa = landmarks[a];
      const pb = landmarks[b];
      if (!pa || !pb) continue;
      ctx.beginPath();
      ctx.moveTo(pa.x * canvas.width, pa.y * canvas.height);
      ctx.lineTo(pb.x * canvas.width, pb.y * canvas.height);
      ctx.stroke();
    }
    for (const p of landmarks) {
      ctx.beginPath();
      ctx.arc(p.x * canvas.width, p.y * canvas.height, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

const HAND_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];
