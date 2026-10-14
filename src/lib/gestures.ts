import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

/**
 * 手势类型
 * - fist: 握拳（切换图案）
 * - palm: 张开手掌（配合挥动控制旋转）
 * - partial: 介于两者之间（半握 / 关键点不稳定），不触发任何动作
 * - none: 画面中没有手
 */
export type GestureKind = 'fist' | 'palm' | 'partial' | 'none';

interface Point {
  x: number;
  y: number;
}

function dist(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// MediaPipe Hands 21 关键点：
// 0 手腕 | 食指 5,6,7,8 | 中指 9,10,11,12 | 无名指 13,14,15,16 | 小指 17,18,19,20
const FINGER_PIPS = [6, 10, 14, 18];
const FINGER_TIPS = [8, 12, 16, 20];

/**
 * 判定手指是否伸直：指尖到手腕的距离明显大于指根(PIP)到手腕的距离。
 * 使用相对距离而非 y 坐标，保证手任意朝向都能识别。
 */
function isFingerExtended(lm: NormalizedLandmark[], tip: number, pip: number): boolean {
  const wrist = lm[0];
  if (!wrist) return false;
  const tipPoint = lm[tip];
  const pipPoint = lm[pip];
  if (!tipPoint || !pipPoint) return false;
  return dist(tipPoint, wrist) > dist(pipPoint, wrist) * 1.08;
}

/**
 * 根据 21 个手部关键点判定整体手势。
 */
export function classifyHand(lm: NormalizedLandmark[] | undefined): GestureKind {
  if (!lm || lm.length < 21) return 'none';

  let extended = 0;
  for (let i = 0; i < FINGER_TIPS.length; i += 1) {
    if (isFingerExtended(lm, FINGER_TIPS[i], FINGER_PIPS[i])) {
      extended += 1;
    }
  }

  // 拇指：拇指尖远离食指指根即视为张开（握拳时拇指会收在手掌旁）
  const thumbSpread = dist(lm[4], lm[5]) > dist(lm[2], lm[5]) * 1.15;

  if (extended >= 3 && thumbSpread) return 'palm';
  if (extended <= 1) return 'fist';
  return 'partial';
}

/**
 * 手势时序跟踪器：
 * - 握拳需要稳定保持 FIST_HOLD_MS 才触发一次，避免误触；
 * - 触发后进入冷却，手掌重新张开或冷却结束后才能再次触发；
 * - 张开手掌时，用最近 200ms 内掌心横坐标的线性变化估算挥动速度。
 * 所有坐标使用镜像后的横坐标（和摄像头预览画面方向一致）。
 */
export class GestureTracker {
  private static readonly FIST_HOLD_MS = 280;
  private static readonly FIST_COOLDOWN_MS = 900;
  private static readonly WAVE_WINDOW_MS = 220;
  private static readonly MAX_WAVE_SPEED = 2.6;

  private fistHoldStart: number | null = null;
  private lastFistFireAt = 0;
  private palmTrail: Array<{ t: number; x: number }> = [];

  /**
   * @returns onFist 为 true 的帧表示“完成一次握拳切换”；
   *          waveSpeed 为镜像视角下的水平挥动速度（屏幕坐标/秒），
   *          正数表示向右挥、负数表示向左挥。
   */
  update(
    kind: GestureKind,
    palmX: number | null,
    nowMs: number,
  ): { onFist: boolean; waveSpeed: number; kind: GestureKind } {
    let onFist = false;

    if (kind === 'fist') {
      if (this.fistHoldStart === null) {
        this.fistHoldStart = nowMs;
      }
      const heldLongEnough = nowMs - this.fistHoldStart >= GestureTracker.FIST_HOLD_MS;
      const cooledDown = nowMs - this.lastFistFireAt >= GestureTracker.FIST_COOLDOWN_MS;
      if (heldLongEnough && cooledDown) {
        onFist = true;
        this.lastFistFireAt = nowMs;
      }
    } else {
      this.fistHoldStart = null;
    }

    let waveSpeed = 0;
    if (kind === 'palm' && palmX !== null) {
      this.palmTrail.push({ t: nowMs, x: palmX });
      const cutoff = nowMs - GestureTracker.WAVE_WINDOW_MS;
      while (this.palmTrail.length > 2 && (this.palmTrail[0]?.t ?? 0) < cutoff) {
        this.palmTrail.shift();
      }
      const first = this.palmTrail[0];
      const last = this.palmTrail[this.palmTrail.length - 1];
      if (first && last && last.t - first.t > 40) {
        const dtSeconds = (last.t - first.t) / 1000;
        waveSpeed = (last.x - first.x) / dtSeconds;
        waveSpeed = Math.max(
          -GestureTracker.MAX_WAVE_SPEED,
          Math.min(GestureTracker.MAX_WAVE_SPEED, waveSpeed),
        );
      }
    } else {
      this.palmTrail = [];
    }

    return { onFist, waveSpeed, kind };
  }

  reset(): void {
    this.fistHoldStart = null;
    this.lastFistFireAt = 0;
    this.palmTrail = [];
  }
}
