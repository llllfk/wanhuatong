'use client';

import {
  CameraOff,
  Hand,
  RotateCcw,
  SkipForward,
  Sparkles,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { KaleidoscopeStage } from './kaleidoscope-stage';
import { GestureEngine, type EngineGesture } from '@/lib/gesture-engine';
import { PATTERNS } from '@/lib/patterns';
import {
  initSound,
  isSoundMuted,
  playPop,
  setSoundMuted,
} from '@/lib/sound';

type Phase = 'idle' | 'starting' | 'running' | 'error';

const WAVE_GAIN = 1100; // 挥动速度 -> 旋转角速度(deg/s) 的映射
const MAX_SPIN_SPEED = 1400;
const IDLE_SPIN_SPEED = 12;

function friendlyError(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
      return '摄像头权限没有打开，请在 Safari 地址栏的「设置」里允许使用摄像头后再试一次。';
    }
    if (error.name === 'NotFoundError' || error.name === 'OverconstrainedError') {
      return '没有找到可用的摄像头，请确认 iPad 摄像头正常后再试一次。';
    }
    if (error.name === 'NotReadableError') {
      return '摄像头被其他 App 占用了，请先关闭其他正在使用摄像头的应用。';
    }
  }
  return '准备过程中遇到了一点小问题，检查网络后再试一次吧。';
}

export function KaleidoscopeApp() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [patternIndex, setPatternIndex] = useState(0);
  const [gesture, setGesture] = useState<EngineGesture>('none');
  const [muted, setMuted] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [hintVisible, setHintVisible] = useState(true);

  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const rotorRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GestureEngine | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const spinRafRef = useRef<number | null>(null);
  const angleRef = useRef(0);
  const velocityRef = useRef(IDLE_SPIN_SPEED);
  const targetVelocityRef = useRef(IDLE_SPIN_SPEED);
  const isPalmRef = useRef(false);
  const lastGestureRef = useRef<EngineGesture>('none');
  const phaseRef = useRef<Phase>('idle');

  const patternSrc = PATTERNS[patternIndex]?.src ?? PATTERNS[0].src;

  const nextPattern = useCallback(() => {
    setPatternIndex((index) => (index + 1) % PATTERNS.length);
    playPop();
    // 切换瞬间给一个顺势加速的「甩出去」手感
    velocityRef.current += 180;
  }, []);

  const handleFrame = useCallback(
    (frame: {
      gesture: EngineGesture;
      waveSpeed: number;
      firedFist: boolean;
    }) => {
      isPalmRef.current = frame.gesture === 'palm';
      if (frame.gesture === 'palm') {
        const target = Math.max(
          -MAX_SPIN_SPEED,
          Math.min(MAX_SPIN_SPEED, frame.waveSpeed * WAVE_GAIN),
        );
        targetVelocityRef.current = target;
      }
      if (frame.firedFist) {
        nextPattern();
      }
      if (frame.gesture !== lastGestureRef.current) {
        lastGestureRef.current = frame.gesture;
        setGesture(frame.gesture);
      }
    },
    [nextPattern],
  );

  // 旋转主循环：挥手时跟随目标速度，手离开后惯性衰减回缓慢自转
  useEffect(() => {
    if (phase !== 'running') return;
    let last = performance.now();

    const loop = (now: number): void => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const ease = isPalmRef.current ? 8 : 1.4;
      const goal = isPalmRef.current
        ? targetVelocityRef.current
        : IDLE_SPIN_SPEED;
      velocityRef.current +=
        (goal - velocityRef.current) * Math.min(1, dt * ease);
      angleRef.current =
        (angleRef.current + velocityRef.current * dt) % 360;
      if (rotorRef.current) {
        rotorRef.current.style.transform = `rotate(${angleRef.current.toFixed(2)}deg)`;
      }
      spinRafRef.current = requestAnimationFrame(loop);
    };
    spinRafRef.current = requestAnimationFrame(loop);
    return () => {
      if (spinRafRef.current !== null) {
        cancelAnimationFrame(spinRafRef.current);
        spinRafRef.current = null;
      }
    };
  }, [phase]);

  const cleanupCamera = useCallback(() => {
    engineRef.current?.stop();
    engineRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    const video = videoRef.current;
    if (video) {
      video.srcObject = null;
    }
  }, []);

  const handleStart = useCallback(async () => {
    if (phaseRef.current === 'starting' || phaseRef.current === 'running') {
      return;
    }
    phaseRef.current = 'starting';
    setPhase('starting');
    setErrorMessage('');
    initSound();

    try {
      // 必须在用户手势调用栈内申请摄像头权限（iPad Safari 要求）
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) throw new Error('视频元素未就绪');
      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        // 个别 Safari 版本首次 play() 会被中断；等待 loadeddata 后再试一次
        await new Promise<void>((resolve, reject) => {
          video.addEventListener('loadeddata', () => resolve(), { once: true });
          video.addEventListener('error', () => reject(new Error('视频加载失败')), {
            once: true,
          });
        });
        await video.play();
      }

      const overlay = overlayRef.current;
      if (!overlay) throw new Error('画布元素未就绪');
      const engine = new GestureEngine(video, overlay, {
        onFrame: handleFrame,
      });
      await engine.init();
      engineRef.current = engine;
      engine.start();

      phaseRef.current = 'running';
      setPhase('running');
    } catch (error) {
      console.error('[Kaleidoscope] 启动失败：', error);
      cleanupCamera();
      phaseRef.current = 'error';
      setErrorMessage(friendlyError(error));
      setPhase('error');
    }
  }, [cleanupCamera, handleFrame]);

  const handleStop = useCallback(() => {
    cleanupCamera();
    isPalmRef.current = false;
    targetVelocityRef.current = IDLE_SPIN_SPEED;
    velocityRef.current = IDLE_SPIN_SPEED;
    phaseRef.current = 'idle';
    setPhase('idle');
    setGesture('none');
    lastGestureRef.current = 'none';
  }, [cleanupCamera]);

  const toggleMute = useCallback(() => {
    setMuted((value) => {
      const next = !value;
      setSoundMuted(next);
      if (!next) initSound();
      return next;
    });
  }, []);

  useEffect(() => {
    setSoundMuted(isSoundMuted());
    return () => {
      cleanupCamera();
    };
  }, [cleanupCamera]);

  // 进入玩耍 6 秒后、或首次识别到手势时，自动收起操作提示，避免遮挡画面
  useEffect(() => {
    if (phase !== 'running') return;
    const timer = window.setTimeout(() => setHintVisible(false), 6000);
    return () => window.clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (gesture === 'palm' || gesture === 'fist') {
      setHintVisible(false);
    }
  }, [gesture]);

  const gestureBadge =
    gesture === 'fist'
      ? { text: '拳头！换一张', className: 'bg-amber-400 text-amber-950' }
      : gesture === 'palm'
        ? { text: '挥手转起来', className: 'bg-teal-300 text-teal-950' }
        : null;

  return (
    <main className="kaleido-root">
      {/* 万花筒画面 */}
      <KaleidoscopeStage patternSrc={patternSrc} ref={rotorRef} />

      {/* 摄像头预览：starting 阶段即需挂载（引擎依赖 video/canvas），开始页会盖住它 */}
      {(phase === 'running' || phase === 'starting') && (
        <div
          className={`camera-preview-wrap ${
            showPreview ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
        >
          <div className="camera-preview">
            <video
              ref={videoRef}
              className="camera-preview-video"
              muted
              playsInline
              autoPlay
            />
            <canvas ref={overlayRef} className="camera-preview-overlay" />
            {gestureBadge && (
              <span
                className={`absolute -bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-4 py-1 text-base font-bold shadow-lg ${gestureBadge.className}`}
              >
                {gestureBadge.text}
              </span>
            )}
          </div>
        </div>
      )}

      {/* ===== 玩耍中的悬浮 UI ===== */}
      {phase === 'running' && (
        <>
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between p-4 sm:p-6">
            <div className="pointer-events-auto flex gap-3">
              <button
                type="button"
                onClick={handleStop}
                aria-label="退出玩耍"
                className="glass-button"
              >
                <X className="size-7" />
              </button>
              <button
                type="button"
                onClick={toggleMute}
                aria-label={muted ? '打开声音' : '关闭声音'}
                className="glass-button"
              >
                {muted ? (
                  <VolumeX className="size-7" />
                ) : (
                  <Volume2 className="size-7" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setShowPreview((value) => !value)}
                aria-label={showPreview ? '隐藏摄像头小窗' : '显示摄像头小窗'}
                aria-pressed={showPreview}
                className="glass-button"
              >
                {showPreview ? (
                  <CameraOff className="size-7" />
                ) : (
                  <Hand className="size-7" />
                )}
              </button>
            </div>
          </div>

          {/* 底部：图案指示点 + 手动换图兜底按钮 + 手势提示 */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-3 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            {hintVisible && (
              <div className="gesture-hint">
                <Hand className="size-6 shrink-0" />
                <span>握紧拳头换图案 · 张开手掌左右挥，转起来！</span>
              </div>
            )}
            <div className="flex items-center gap-2.5">
              {PATTERNS.map((pattern, index) => (
                <span
                  key={pattern.src}
                  aria-label={`第 ${index + 1} 张图案`}
                  className={`h-3 rounded-full transition-all duration-300 ${
                    index === patternIndex
                      ? 'w-8 bg-amber-300'
                      : 'w-3 bg-white/35'
                  }`}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={nextPattern}
              className="pointer-events-auto flex h-16 items-center gap-3 rounded-full bg-gradient-to-r from-amber-300 via-orange-400 to-pink-500 px-9 font-kid text-2xl font-bold text-white shadow-[0_10px_30px_rgba(255,138,92,0.45)] transition-transform duration-300 [transition-timing-function:cubic-bezier(0.34,1.56,0.64,1)] hover:scale-105 active:scale-95"
            >
              <SkipForward className="size-8 fill-current" />
              换一张
            </button>
          </div>
        </>
      )}

      {/* ===== 开始 / 加载 / 错误 覆盖层 ===== */}
      {phase !== 'running' && (
        <div className="start-screen">
          <div className="start-blob start-blob-pink" />
          <div className="start-blob start-blob-cyan" />
          <div className="start-blob start-blob-amber" />

          <div className="relative z-10 flex w-full max-w-2xl flex-col items-center px-8 text-center">
            <div className="mb-6 flex h-28 w-28 items-center justify-center rounded-full bg-white/10 shadow-[0_0_60px_rgba(255,194,63,0.45)] ring-1 ring-white/25 backdrop-blur-sm">
              <Sparkles className="size-14 text-amber-300" />
            </div>
            <h1 className="font-kid text-6xl text-[#fff7e8] drop-shadow-[0_4px_18px_rgba(155,107,255,0.55)] sm:text-7xl">
              手势万花筒
            </h1>
            <p className="mt-5 max-w-md font-kid text-2xl leading-relaxed text-white/75">
              握紧拳头换图案
              <br />
              张开小手挥一挥，世界就转起来
            </p>

            {phase === 'idle' && (
              <button
                type="button"
                onClick={handleStart}
                className="start-button mt-12"
              >
                <span className="start-button-shine" />
                开始玩耍
              </button>
            )}

            {phase === 'starting' && (
              <div className="mt-14 flex flex-col items-center gap-5">
                <div className="flex gap-3">
                  <span className="loading-dot loading-dot-1" />
                  <span className="loading-dot loading-dot-2" />
                  <span className="loading-dot loading-dot-3" />
                </div>
                <p className="font-kid text-2xl text-white/80">
                  正在准备魔法…
                </p>
              </div>
            )}

            {phase === 'error' && (
              <div className="mt-10 flex w-full flex-col items-center gap-6 rounded-3xl bg-white/10 p-7 ring-1 ring-amber-300/40 backdrop-blur-sm">
                <p className="font-kid text-2xl leading-relaxed text-amber-200">
                  {errorMessage}
                </p>
                <button
                  type="button"
                  onClick={handleStart}
                  className="flex h-16 items-center gap-3 rounded-full bg-gradient-to-r from-amber-300 to-orange-500 px-10 font-kid text-2xl font-bold text-white shadow-lg transition-transform duration-300 [transition-timing-function:cubic-bezier(0.34,1.56,0.64,1)] hover:scale-105 active:scale-95"
                >
                  <RotateCcw className="size-7" />
                  再试一次
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== 竖屏软提示（横屏自动消失） ===== */}
      <div className="rotate-hint">
        <RotateCcw className="size-20 text-white/90 [animation:rotate-hint-spin_1.8s_ease-in-out_infinite]" />
        <p className="mt-6 font-kid text-3xl text-white">把 iPad 横过来玩</p>
      </div>
    </main>
  );
}
