'use client';

import {
  CameraOff,
  Hand,
  RotateCcw,
  SkipForward,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DesignStudio } from './design-studio';
import {
  KaleidoscopeStage,
  type KaleidoMotion,
} from './kaleidoscope-stage';
import {
  createDefaultDesign,
  defaultMapForIndex,
  gestureLabel,
  loadDesign,
  resizeDesign,
  saveDesign,
  type AssignableGesture,
  type DesignConfig,
  type PatternAction,
} from '@/lib/design-config';
import { GestureEngine, type EngineGesture } from '@/lib/gesture-engine';
import {
  BUILTIN_PATTERNS,
  compressImageFile,
  type KaleidoscopePattern,
} from '@/lib/patterns';
import {
  initSound,
  isSoundMuted,
  playPop,
  setSoundMuted,
} from '@/lib/sound';

type AppMode = 'design' | 'run';
type RunPhase = 'starting' | 'running' | 'error';

const WAVE_GAIN = 1100;
const MAX_SPIN_SPEED = 1400;
const IDLE_SPIN_SPEED = 12;
const HOLD_SPIN_SPEED = 220;
const MIN_SCALE = 0.55;
const MAX_SCALE = 1.85;
const SCALE_STEP = 0.18;

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
  const [mode, setMode] = useState<AppMode>('design');
  const [patterns, setPatterns] = useState<KaleidoscopePattern[]>(() => [
    ...BUILTIN_PATTERNS,
  ]);
  const [design, setDesign] = useState<DesignConfig>(() =>
    createDefaultDesign(BUILTIN_PATTERNS.length),
  );
  const [designPatternIndex, setDesignPatternIndex] = useState(0);
  const [hydrated, setHydrated] = useState(false);

  const [runPhase, setRunPhase] = useState<RunPhase>('starting');
  const [errorMessage, setErrorMessage] = useState('');
  const [patternIndex, setPatternIndex] = useState(0);
  const [scale, setScale] = useState(1);
  const [muted, setMuted] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [hintVisible, setHintVisible] = useState(true);
  const [badgeText, setBadgeText] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const motionRef = useRef<KaleidoMotion>({ spin: 0, zoom: 1 });
  const engineRef = useRef<GestureEngine | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const spinRafRef = useRef<number | null>(null);
  const angleRef = useRef(0);
  const velocityRef = useRef(IDLE_SPIN_SPEED);
  const targetVelocityRef = useRef(IDLE_SPIN_SPEED);
  const rotatingRef = useRef(false);
  const lastGestureRef = useRef<EngineGesture>('none');
  const runPhaseRef = useRef<RunPhase>('starting');
  const designRef = useRef(design);
  const patternIndexRef = useRef(patternIndex);
  const patternsLenRef = useRef(patterns.length);

  const patternSrc =
    patterns[patternIndex]?.src ?? patterns[0]?.src ?? BUILTIN_PATTERNS[0].src;
  const currentMap = design[patternIndex] ?? design[0];

  useEffect(() => {
    designRef.current = design;
  }, [design]);

  useEffect(() => {
    patternIndexRef.current = patternIndex;
  }, [patternIndex]);

  useEffect(() => {
    patternsLenRef.current = patterns.length;
  }, [patterns.length]);

  useEffect(() => {
    setDesign(loadDesign(BUILTIN_PATTERNS.length));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveDesign(design);
  }, [design, hydrated]);

  const nextPattern = useCallback(() => {
    const len = Math.max(1, patternsLenRef.current);
    setPatternIndex((index) => (index + 1) % len);
    setScale(1);
    playPop();
    velocityRef.current += 180;
  }, []);

  const bumpScale = useCallback((delta: number) => {
    setScale((value) =>
      Math.max(MIN_SCALE, Math.min(MAX_SCALE, Number((value + delta).toFixed(2)))),
    );
    playPop();
  }, []);

  const handleFrame = useCallback(
    (frame: {
      gesture: EngineGesture;
      waveSpeed: number;
      triggered: AssignableGesture | null;
    }) => {
      const map =
        designRef.current[patternIndexRef.current] ?? designRef.current[0];
      if (!map) return;

      const isRotateGesture = frame.gesture === map.rotate;
      rotatingRef.current = isRotateGesture;
      if (isRotateGesture) {
        if (map.rotate === 'palm') {
          targetVelocityRef.current = Math.max(
            -MAX_SPIN_SPEED,
            Math.min(MAX_SPIN_SPEED, frame.waveSpeed * WAVE_GAIN),
          );
        } else {
          targetVelocityRef.current =
            Math.abs(frame.waveSpeed) > 0.15
              ? Math.max(
                  -MAX_SPIN_SPEED,
                  Math.min(MAX_SPIN_SPEED, frame.waveSpeed * WAVE_GAIN),
                )
              : HOLD_SPIN_SPEED;
        }
      }

      if (frame.triggered) {
        if (frame.triggered === map.zoomIn) {
          bumpScale(SCALE_STEP);
          setBadgeText(`${gestureLabel(frame.triggered)} · 放大`);
        } else if (frame.triggered === map.zoomOut) {
          bumpScale(-SCALE_STEP);
          setBadgeText(`${gestureLabel(frame.triggered)} · 缩小`);
        } else if (frame.triggered === map.next) {
          nextPattern();
          setBadgeText(`${gestureLabel(frame.triggered)} · 换图`);
        } else if (frame.triggered === map.rotate && map.rotate !== 'palm') {
          // 离散触发时也给一点甩动感
          velocityRef.current += 160;
          setBadgeText(`${gestureLabel(frame.triggered)} · 翻转`);
        }
      }

      if (frame.gesture !== lastGestureRef.current) {
        lastGestureRef.current = frame.gesture;
        if (isRotateGesture && frame.gesture !== 'none') {
          setBadgeText(`${gestureLabel(map.rotate)} · 旋转中`);
        }
      }
    },
    [bumpScale, nextPattern],
  );

  useEffect(() => {
    if (mode !== 'run' || runPhase !== 'running') return;
    let last = performance.now();

    const loop = (now: number): void => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const ease = rotatingRef.current ? 8 : 1.4;
      const goal = rotatingRef.current
        ? targetVelocityRef.current
        : IDLE_SPIN_SPEED;
      velocityRef.current +=
        (goal - velocityRef.current) * Math.min(1, dt * ease);
      angleRef.current =
        (angleRef.current + velocityRef.current * dt) % 360;
      motionRef.current.spin = angleRef.current;
      motionRef.current.zoom = scale;
      spinRafRef.current = requestAnimationFrame(loop);
    };
    spinRafRef.current = requestAnimationFrame(loop);
    return () => {
      if (spinRafRef.current !== null) {
        cancelAnimationFrame(spinRafRef.current);
        spinRafRef.current = null;
      }
    };
  }, [mode, runPhase, scale]);

  useEffect(() => {
    motionRef.current.zoom = scale;
  }, [scale]);

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

  const startRun = useCallback(async () => {
    runPhaseRef.current = 'starting';
    setMode('run');
    setRunPhase('starting');
    setErrorMessage('');
    setPatternIndex(0);
    setScale(1);
    setHintVisible(true);
    setBadgeText(null);
    initSound();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      streamRef.current = stream;

      // 等 React 挂载 run 模式的 video/canvas
      let video: HTMLVideoElement | null = null;
      let overlay: HTMLCanvasElement | null = null;
      for (let attempt = 0; attempt < 30; attempt += 1) {
        video = videoRef.current;
        overlay = overlayRef.current;
        if (video && overlay) break;
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, 50);
        });
      }
      if (!video || !overlay) throw new Error('视频元素未就绪');
      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        await new Promise<void>((resolve, reject) => {
          video.addEventListener('loadeddata', () => resolve(), { once: true });
          video.addEventListener('error', () => reject(new Error('视频加载失败')), {
            once: true,
          });
        });
        await video.play();
      }

      const engine = new GestureEngine(video, overlay, {
        onFrame: handleFrame,
      });
      await engine.init();
      engineRef.current = engine;
      engine.start();

      runPhaseRef.current = 'running';
      setRunPhase('running');
    } catch (error) {
      console.error('[Kaleidoscope] 启动失败：', error);
      cleanupCamera();
      runPhaseRef.current = 'error';
      setErrorMessage(friendlyError(error));
      setRunPhase('error');
    }
  }, [cleanupCamera, handleFrame]);

  const backToDesign = useCallback(() => {
    cleanupCamera();
    rotatingRef.current = false;
    targetVelocityRef.current = IDLE_SPIN_SPEED;
    velocityRef.current = IDLE_SPIN_SPEED;
    runPhaseRef.current = 'starting';
    setMode('design');
    lastGestureRef.current = 'none';
    setBadgeText(null);
  }, [cleanupCamera]);

  const toggleMute = useCallback(() => {
    setMuted((value) => {
      const next = !value;
      setSoundMuted(next);
      if (!next) initSound();
      return next;
    });
  }, []);

  const updateMapping = useCallback(
    (patternIdx: number, action: PatternAction, gestureId: AssignableGesture) => {
      setDesign((prev) =>
        prev.map((item, index) => {
          if (index !== patternIdx) return item;
          if (item[action] === gestureId) return item;
          const occupiedBy = (
            ['rotate', 'zoomIn', 'zoomOut', 'next'] as PatternAction[]
          ).find((key) => key !== action && item[key] === gestureId);
          const next = { ...item, [action]: gestureId };
          if (occupiedBy) {
            next[occupiedBy] = item[action];
          }
          return next;
        }),
      );
    },
    [],
  );

  const handleAddPatterns = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files).filter((file) =>
      file.type.startsWith('image/'),
    );
    if (list.length === 0) return;
    const startIndex = patternsLenRef.current;
    const added: KaleidoscopePattern[] = [];
    for (let i = 0; i < list.length; i += 1) {
      try {
        added.push(await compressImageFile(list[i], startIndex + i + 1));
      } catch (error) {
        console.warn('[Kaleidoscope] 图片处理失败：', error);
      }
    }
    if (added.length === 0) return;
    setPatterns((prev) => [...prev, ...added]);
    setDesign((prev) => {
      const next = [...prev];
      for (let i = 0; i < added.length; i += 1) {
        next.push(defaultMapForIndex(prev.length + i));
      }
      return next;
    });
    setDesignPatternIndex(startIndex);
  }, []);

  const handleRemovePattern = useCallback((index: number) => {
    setPatterns((prev) => {
      const target = prev[index];
      if (!target?.custom || prev.length <= 1) return prev;
      const nextPatterns = prev.filter((_, i) => i !== index);
      setDesign((maps) => {
        if (maps.length !== prev.length) return maps;
        return maps.filter((_, i) => i !== index);
      });
      setDesignPatternIndex((current) => {
        if (current === index) return Math.max(0, index - 1);
        if (current > index) return current - 1;
        return current;
      });
      setPatternIndex((current) => {
        if (current === index) return Math.max(0, index - 1);
        if (current > index) return current - 1;
        return current;
      });
      return nextPatterns;
    });
  }, []);

  const handleResetDesign = useCallback(() => {
    setPatterns([...BUILTIN_PATTERNS]);
    setDesign(createDefaultDesign(BUILTIN_PATTERNS.length));
    setDesignPatternIndex(0);
  }, []);

  useEffect(() => {
    setSoundMuted(isSoundMuted());
    return () => {
      cleanupCamera();
    };
  }, [cleanupCamera]);

  useEffect(() => {
    if (mode !== 'run' || runPhase !== 'running') return;
    const timer = window.setTimeout(() => setHintVisible(false), 8000);
    return () => window.clearTimeout(timer);
  }, [mode, runPhase]);

  useEffect(() => {
    if (!badgeText) return;
    const timer = window.setTimeout(() => setBadgeText(null), 1600);
    return () => window.clearTimeout(timer);
  }, [badgeText]);

  if (mode === 'design') {
    return (
      <main className="kaleido-root">
        <DesignStudio
          patterns={patterns}
          config={design}
          selectedIndex={designPatternIndex}
          onSelectPattern={setDesignPatternIndex}
          onChangeMapping={updateMapping}
          onAddPatterns={handleAddPatterns}
          onRemovePattern={handleRemovePattern}
          onReset={handleResetDesign}
          onRun={() => {
            void startRun();
          }}
        />
        <div className="rotate-hint">
          <RotateCcw className="size-20 text-white/90 [animation:rotate-hint-spin_1.8s_ease-in-out_infinite]" />
          <p className="mt-6 font-kid text-3xl text-white">把 iPad 横过来玩</p>
        </div>
      </main>
    );
  }

  return (
    <main className="kaleido-root">
      <KaleidoscopeStage patternSrc={patternSrc} motionRef={motionRef} />

      {(runPhase === 'running' || runPhase === 'starting') && (
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
            {badgeText && (
              <span className="absolute -bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-amber-300 px-4 py-1 text-base font-bold text-amber-950 shadow-lg">
                {badgeText}
              </span>
            )}
          </div>
        </div>
      )}

      {runPhase === 'running' && currentMap && (
        <>
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between p-4 sm:p-6">
            <div className="pointer-events-auto flex gap-3">
              <button
                type="button"
                onClick={backToDesign}
                aria-label="返回设计"
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

          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-3 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            {hintVisible && (
              <div className="gesture-hint max-w-3xl text-center">
                <Hand className="size-6 shrink-0" />
                <span>
                  本张：{gestureLabel(currentMap.rotate)}转 ·{' '}
                  {gestureLabel(currentMap.zoomIn)}放大 ·{' '}
                  {gestureLabel(currentMap.zoomOut)}缩小 ·{' '}
                  {gestureLabel(currentMap.next)}换图
                </span>
              </div>
            )}
            <div className="flex items-center gap-2.5">
              {patterns.map((pattern, index) => (
                <span
                  key={`${pattern.src.slice(0, 48)}-${index}`}
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
              className="pointer-events-auto flex h-14 items-center gap-3 rounded-full bg-gradient-to-r from-amber-300 via-orange-400 to-pink-500 px-8 font-kid text-xl font-bold text-white shadow-[0_10px_30px_rgba(255,138,92,0.45)] transition-transform duration-300 [transition-timing-function:cubic-bezier(0.34,1.56,0.64,1)] hover:scale-105 active:scale-95"
            >
              <SkipForward className="size-7 fill-current" />
              换一张
            </button>
          </div>
        </>
      )}

      {(runPhase === 'starting' || runPhase === 'error') && (
        <div className="start-screen">
          <div className="start-blob start-blob-pink" />
          <div className="start-blob start-blob-cyan" />
          <div className="start-blob start-blob-amber" />
          <div className="relative z-10 flex w-full max-w-2xl flex-col items-center px-8 text-center">
            {runPhase === 'starting' && (
              <div className="mt-14 flex flex-col items-center gap-5">
                <div className="flex gap-3">
                  <span className="loading-dot loading-dot-1" />
                  <span className="loading-dot loading-dot-2" />
                  <span className="loading-dot loading-dot-3" />
                </div>
                <p className="font-kid text-2xl text-white/80">
                  正在打开摄像头，准备表演…
                </p>
              </div>
            )}
            {runPhase === 'error' && (
              <div className="mt-10 flex w-full flex-col items-center gap-6 rounded-3xl bg-white/10 p-7 ring-1 ring-amber-300/40 backdrop-blur-sm">
                <p className="font-kid text-2xl leading-relaxed text-amber-200">
                  {errorMessage}
                </p>
                <div className="flex flex-wrap justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      void startRun();
                    }}
                    className="flex h-16 items-center gap-3 rounded-full bg-gradient-to-r from-amber-300 to-orange-500 px-10 font-kid text-2xl font-bold text-white shadow-lg"
                  >
                    <RotateCcw className="size-7" />
                    再试一次
                  </button>
                  <button
                    type="button"
                    onClick={backToDesign}
                    className="flex h-16 items-center gap-3 rounded-full bg-white/15 px-10 font-kid text-2xl font-bold text-white ring-1 ring-white/25"
                  >
                    返回设计
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="rotate-hint">
        <RotateCcw className="size-20 text-white/90 [animation:rotate-hint-spin_1.8s_ease-in-out_infinite]" />
        <p className="mt-6 font-kid text-3xl text-white">把 iPad 横过来玩</p>
      </div>
    </main>
  );
}
