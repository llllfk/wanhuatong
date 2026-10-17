/**
 * 音效 + 运行背景音乐。
 * AudioContext / Audio 播放须在用户点击「运行」的手势里启动。
 */

let audioContext: AudioContext | null = null;
let muted = false;
let bgm: HTMLAudioElement | null = null;
let bgmWanted = false;

const BGM_SRC = '/audio/zhake-xingxing.mp3';

type AudioContextCtor = typeof AudioContext;

function getAudioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  return (
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioContextCtor })
      .webkitAudioContext ??
    null
  );
}

export function initSound(): void {
  const Ctor = getAudioContextCtor();
  if (!Ctor) return;
  if (!audioContext) {
    audioContext = new Ctor();
  }
  if (audioContext.state === 'suspended') {
    void audioContext.resume();
  }
}

export function setSoundMuted(value: boolean): void {
  muted = value;
  if (bgm) {
    bgm.muted = value;
    if (!value && bgmWanted && bgm.paused) {
      void bgm.play().catch(() => undefined);
    }
  }
}

export function isSoundMuted(): boolean {
  return muted;
}

/** 运行阶段循环播放背景音乐（须在用户点击调用栈内尽早调用） */
export function startBgm(): void {
  if (typeof window === 'undefined') return;
  bgmWanted = true;
  if (!bgm) {
    bgm = new Audio(BGM_SRC);
    bgm.loop = true;
    bgm.preload = 'auto';
    bgm.volume = 0.55;
    // iPad Safari 上 loop 偶发失效，播完再手动重开
    bgm.addEventListener('ended', () => {
      if (!bgmWanted || !bgm) return;
      bgm.currentTime = 0;
      void bgm.play().catch(() => undefined);
    });
  }
  bgm.loop = true;
  bgm.muted = muted;
  void bgm.play().catch(() => undefined);
}

export function stopBgm(): void {
  bgmWanted = false;
  if (!bgm) return;
  bgm.pause();
  bgm.currentTime = 0;
}

/** 切换图案时的「啵」一声：音高快速下滑的正弦短音 */
export function playPop(): void {
  if (muted || !audioContext) return;
  const ctx = audioContext;
  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(620, now);
  osc.frequency.exponentialRampToValueAtTime(260, now + 0.18);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.24);
}
