import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { AssignableGesture } from './design-config';

/**
 * 手势类型
 * - fist / palm / peace / point：可分配给孩子设计的动作
 * - partial：半握或不稳定，不触发
 * - none：画面中没有手
 */
export type GestureKind = AssignableGesture | 'partial' | 'none';

interface Point {
  x: number;
  y: number;
}

function dist(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

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

export function isAssignableGesture(kind: GestureKind): kind is AssignableGesture {
  return (
    kind === 'fist' ||
    kind === 'palm' ||
    kind === 'peace' ||
    kind === 'point'
  );
}

/**
 * 根据 21 个手部关键点判定整体手势。
 */
export function classifyHand(lm: NormalizedLandmark[] | undefined): GestureKind {
  if (!lm || lm.length < 21) return 'none';

  const indexExt = isFingerExtended(lm, 8, 6);
  const middleExt = isFingerExtended(lm, 12, 10);
  const ringExt = isFingerExtended(lm, 16, 14);
  const pinkyExt = isFingerExtended(lm, 20, 18);
  const extended = [indexExt, middleExt, ringExt, pinkyExt].filter(Boolean).length;

  // 拇指：拇指尖远离食指指根即视为张开
  const thumbSpread = dist(lm[4], lm[5]) > dist(lm[2], lm[5]) * 1.15;

  if (extended >= 3 && thumbSpread) return 'palm';
  if (indexExt && middleExt && !ringExt && !pinkyExt) return 'peace';
  if (indexExt && !middleExt && !ringExt && !pinkyExt) return 'point';
  if (extended <= 1) return 'fist';
  return 'partial';
}

/**
 * 手势时序跟踪器：
 * - 可分配手势需稳定保持 TRIGGER_HOLD_MS 才触发一次离散动作；
 * - 触发后进入冷却；
 * - 张开手掌时估算挥动速度（用于旋转）。
 */
export class GestureTracker {
  private static readonly TRIGGER_HOLD_MS = 280;
  private static readonly TRIGGER_COOLDOWN_MS = 900;
  private static readonly WAVE_WINDOW_MS = 220;
  private static readonly MAX_WAVE_SPEED = 2.6;

  private holdStart: number | null = null;
  private holdKind: AssignableGesture | null = null;
  private lastTriggerAt = 0;
  private palmTrail: Array<{ t: number; x: number }> = [];

  /**
   * @returns triggered 为刚完成一次「按下式」触发的手势；
   *          waveSpeed 为镜像视角水平挥动速度。
   */
  update(
    kind: GestureKind,
    palmX: number | null,
    nowMs: number,
  ): {
    triggered: AssignableGesture | null;
    waveSpeed: number;
    kind: GestureKind;
  } {
    let triggered: AssignableGesture | null = null;

    if (isAssignableGesture(kind)) {
      if (this.holdKind !== kind) {
        this.holdKind = kind;
        this.holdStart = nowMs;
      }
      const heldLongEnough =
        this.holdStart !== null &&
        nowMs - this.holdStart >= GestureTracker.TRIGGER_HOLD_MS;
      const cooledDown =
        nowMs - this.lastTriggerAt >= GestureTracker.TRIGGER_COOLDOWN_MS;
      if (heldLongEnough && cooledDown) {
        triggered = kind;
        this.lastTriggerAt = nowMs;
      }
    } else {
      this.holdKind = null;
      this.holdStart = null;
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

    return { triggered, waveSpeed, kind };
  }

  reset(): void {
    this.holdStart = null;
    this.holdKind = null;
    this.lastTriggerAt = 0;
    this.palmTrail = [];
  }
}
