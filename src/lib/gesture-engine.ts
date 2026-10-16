import {
  FilesetResolver,
  HandLandmarker,
  PoseLandmarker,
} from '@mediapipe/tasks-vision';
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { AssignableGesture, GestureOptionGroup } from './design-config';
import {
  classifyHand,
  GestureTracker,
  measurePalmSize,
  type GestureKind,
} from './gestures';
import { classifyPoseRaw, isBodyPose, POSE_CONNECTIONS } from './poses';

export type EngineGesture = GestureKind;

export interface GestureFrame {
  /** 当前稳定手势 / 姿势 */
  gesture: EngineGesture;
  /** 镜像视角下的水平挥动速度（屏幕宽度/秒），正为向右 */
  waveSpeed: number;
  /** 手靠近镜头为正（掌心变大），用于推近放大 / 拉远缩小 */
  approachSpeed: number;
  /** 本帧是否完成一次离散触发（握拳/举手等保持后触发） */
  triggered: AssignableGesture | null;
  /** 镜像后的手部关键点，用于绘制骨架 */
  landmarks: NormalizedLandmark[] | null;
}

export interface GestureEngineOptions {
  onFrame: (frame: GestureFrame) => void;
  /** hand=只识别手势；body=只识别身体姿势（互不干扰） */
  detectMode?: GestureOptionGroup;
}

const WASM_PATH = '/vendor/mediapipe/wasm';
const HAND_MODEL_PATH = '/vendor/mediapipe/hand_landmarker.task';
const POSE_MODEL_PATH = '/vendor/mediapipe/pose_landmarker_lite.task';
const DETECT_INTERVAL_MS = 40;

/**
 * MediaPipe 手部 / 姿态封装（二选一，按设计模式只开一种）：
 * - 模型与 WASM 均从本站 /vendor/mediapipe 加载，摄像头画面不出设备；
 * - GPU 委托失败时自动回退 CPU；
 * - 输出坐标统一做镜像翻转，与自拍预览画面方向一致。
 */
export class GestureEngine {
  private readonly video: HTMLVideoElement;
  private readonly overlay: HTMLCanvasElement;
  private readonly options: GestureEngineOptions;
  private readonly detectMode: GestureOptionGroup;
  private readonly tracker = new GestureTracker();

  private handLandmarker: HandLandmarker | null = null;
  private poseLandmarker: PoseLandmarker | null = null;
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
    this.detectMode = options.detectMode ?? 'hand';
  }

  async init(): Promise<void> {
    const vision = await FilesetResolver.forVisionTasks(WASM_PATH);

    if (this.detectMode === 'hand') {
      const handOptions = {
        baseOptions: {
          modelAssetPath: HAND_MODEL_PATH,
          delegate: 'GPU' as const,
        },
        runningMode: 'VIDEO' as const,
        numHands: 1,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      };

      try {
        this.handLandmarker = await HandLandmarker.createFromOptions(
          vision,
          handOptions,
        );
      } catch (gpuError) {
        console.warn('[GestureEngine] 手部 GPU 失败，回退 CPU：', gpuError);
        this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
          ...handOptions,
          baseOptions: { ...handOptions.baseOptions, delegate: 'CPU' },
        });
      }
      return;
    }

    const poseOptions = {
      baseOptions: {
        modelAssetPath: POSE_MODEL_PATH,
        delegate: 'GPU' as const,
      },
      runningMode: 'VIDEO' as const,
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    };

    try {
      this.poseLandmarker = await PoseLandmarker.createFromOptions(
        vision,
        poseOptions,
      );
    } catch (gpuError) {
      console.warn('[GestureEngine] 姿态 GPU 失败，回退 CPU：', gpuError);
      this.poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
        ...poseOptions,
        baseOptions: { ...poseOptions.baseOptions, delegate: 'CPU' },
      });
    }
  }

  start(): void {
    if (this.detectMode === 'hand' && this.handLandmarker === null) {
      throw new Error('GestureEngine 手势模型尚未初始化');
    }
    if (this.detectMode === 'body' && this.poseLandmarker === null) {
      throw new Error('GestureEngine 姿势模型尚未初始化');
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
    this.handLandmarker?.close();
    this.handLandmarker = null;
    this.poseLandmarker?.close();
    this.poseLandmarker = null;
    this.tracker.reset();
    this.clearOverlay();
  }

  private tick(): void {
    if (this.video.readyState < 2) {
      this.emitIdle();
      return;
    }

    const nowMs = performance.now();
    if (nowMs - this.lastDetectAt < DETECT_INTERVAL_MS) {
      return;
    }
    this.lastDetectAt = nowMs;

    if (this.detectMode === 'body') {
      this.tickBody(nowMs);
      return;
    }
    this.tickHand(nowMs);
  }

  private tickHand(nowMs: number): void {
    const hand = this.handLandmarker;
    if (!hand) {
      this.emitIdle();
      return;
    }

    let handResult;
    try {
      handResult = hand.detectForVideo(this.video, nowMs);
    } catch (error) {
      console.warn('[GestureEngine] 手部检测失败：', error);
      this.emitIdle();
      return;
    }

    const rawHand = handResult.landmarks[0];
    let handKind: GestureKind = 'none';
    let handLandmarks: NormalizedLandmark[] | null = null;
    let palmX: number | null = null;
    let palmSize: number | null = null;

    if (rawHand) {
      handKind = classifyHand(rawHand);
      handLandmarks = rawHand.map((p) => ({
        ...p,
        x: 1 - p.x,
      }));
      palmX = 1 - (rawHand[9]?.x ?? 0.5);
      palmSize = measurePalmSize(rawHand);
    }

    const tracked = this.tracker.update(handKind, palmX, nowMs, palmSize);
    this.drawOverlay(handLandmarks, null, tracked.kind);
    this.emit(
      tracked.kind,
      tracked.waveSpeed,
      tracked.approachSpeed,
      tracked.triggered,
      handLandmarks,
    );
  }

  private tickBody(nowMs: number): void {
    const pose = this.poseLandmarker;
    if (!pose) {
      this.emitIdle();
      return;
    }

    let poseLandmarks: NormalizedLandmark[] | null = null;
    let poseKind: GestureKind = 'none';
    try {
      const poseResult = pose.detectForVideo(this.video, nowMs);
      const rawPose = poseResult.landmarks[0];
      if (rawPose) {
        const classified = classifyPoseRaw(rawPose);
        poseKind = isBodyPose(classified) ? classified : 'none';
        poseLandmarks = rawPose.map((p) => ({
          ...p,
          x: 1 - p.x,
        }));
      }
    } catch (error) {
      console.warn('[GestureEngine] 姿态检测失败：', error);
      this.emitIdle();
      return;
    }

    const tracked = this.tracker.update(poseKind, null, nowMs, null);
    this.drawOverlay(null, poseLandmarks, tracked.kind);
    this.emit(
      tracked.kind,
      tracked.waveSpeed,
      tracked.approachSpeed,
      tracked.triggered,
      null,
    );
  }

  private emit(
    gesture: EngineGesture,
    waveSpeed: number,
    approachSpeed: number,
    triggered: AssignableGesture | null,
    landmarks: NormalizedLandmark[] | null,
  ): void {
    this.options.onFrame({
      gesture,
      waveSpeed,
      approachSpeed,
      triggered,
      landmarks,
    });
  }

  private emitIdle(): void {
    this.emit('none', 0, 0, null, null);
  }

  private clearOverlay(): void {
    const ctx = this.overlay.getContext('2d');
    ctx?.clearRect(0, 0, this.overlay.width, this.overlay.height);
  }

  private drawOverlay(
    handLandmarks: NormalizedLandmark[] | null,
    poseLandmarks: NormalizedLandmark[] | null,
    kind: EngineGesture,
  ): void {
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

    if (poseLandmarks && this.detectMode === 'body') {
      const poseColor =
        kind === 'armsUp'
          ? '#fbbf24'
          : kind === 'armsOut'
            ? '#34d399'
            : kind === 'handsOnHips'
              ? '#fb923c'
              : kind === 'clap'
                ? '#f472b6'
                : kind === 'handsOnHead'
                  ? '#a78bfa'
                  : '#94a3b8';
      ctx.lineWidth = 5;
      ctx.strokeStyle = poseColor;
      ctx.fillStyle = poseColor;
      ctx.shadowColor = poseColor;
      ctx.shadowBlur = 6;
      for (const [a, b] of POSE_CONNECTIONS) {
        const pa = poseLandmarks[a];
        const pb = poseLandmarks[b];
        if (!pa || !pb) continue;
        ctx.beginPath();
        ctx.moveTo(pa.x * canvas.width, pa.y * canvas.height);
        ctx.lineTo(pb.x * canvas.width, pb.y * canvas.height);
        ctx.stroke();
      }
      for (const idx of [11, 12, 13, 14, 15, 16, 23, 24]) {
        const p = poseLandmarks[idx];
        if (!p) continue;
        ctx.beginPath();
        ctx.arc(p.x * canvas.width, p.y * canvas.height, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (!handLandmarks) return;

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
      const pa = handLandmarks[a];
      const pb = handLandmarks[b];
      if (!pa || !pb) continue;
      ctx.beginPath();
      ctx.moveTo(pa.x * canvas.width, pa.y * canvas.height);
      ctx.lineTo(pb.x * canvas.width, pb.y * canvas.height);
      ctx.stroke();
    }
    for (const p of handLandmarks) {
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
