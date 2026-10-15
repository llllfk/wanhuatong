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
function isFingerExtended(
  lm: NormalizedLandmark[],
  tip: number,
  pip: number,
  ratio = 1.08,
): boolean {
  const wrist = lm[0];
  if (!wrist) return false;
  const tipPoint = lm[tip];
  const pipPoint = lm[pip];
  if (!tipPoint || !pipPoint) return false;
  return dist(tipPoint, wrist) > dist(pipPoint, wrist) * ratio;
}

export function isAssignableGesture(kind: GestureKind): kind is AssignableGesture {
  return (
    kind === 'fist' ||
    kind === 'palm' ||
    kind === 'peace' ||
    kind === 'point'
  );
}

/** 比耶 ↔ 一指 特别容易抖，切换时需要更长确认 */
function isAdjacentFlicker(a: GestureKind, b: GestureKind): boolean {
  return (
    (a === 'peace' && b === 'point') ||
    (a === 'point' && b === 'peace')
  );
}

/**
 * 根据 21 个手部关键点做瞬时判定（无粘滞）。
 */
export function classifyHandRaw(lm: NormalizedLandmark[] | undefined): GestureKind {
  if (!lm || lm.length < 21) return 'none';

  // 中指用更严阈值，减少「比耶」被误判成「一指」
  const indexExt = isFingerExtended(lm, 8, 6, 1.08);
  const middleExt = isFingerExtended(lm, 12, 10, 1.05);
  const middleClearlyBent = !isFingerExtended(lm, 12, 10, 1.02);
  const ringExt = isFingerExtended(lm, 16, 14, 1.08);
  const pinkyExt = isFingerExtended(lm, 20, 18, 1.08);
  const extended = [indexExt, middleExt, ringExt, pinkyExt].filter(Boolean).length;

  const thumbSpread = dist(lm[4], lm[5]) > dist(lm[2], lm[5]) * 1.15;

  if (extended >= 3 && thumbSpread) return 'palm';
  if (indexExt && middleExt && !ringExt && !pinkyExt) return 'peace';
  // 一指：中指要明显弯曲，避免比耶抖动时掉进一指
  if (indexExt && middleClearlyBent && !ringExt && !pinkyExt) return 'point';
  if (extended <= 1) return 'fist';
  return 'partial';
}

/**
 * 带粘滞的手势分类：短时抖动不立刻改判，尤其比耶/一指。
 */
export class GestureClassifier {
  private static readonly CONFIRM_MS = 120;
  private static readonly ADJACENT_CONFIRM_MS = 320;

  private stable: GestureKind = 'none';
  private candidate: GestureKind = 'none';
  private candidateSince = 0;

  update(raw: GestureKind, nowMs: number): GestureKind {
    if (raw === this.stable) {
      this.candidate = raw;
      this.candidateSince = nowMs;
      return this.stable;
    }

    if (raw !== this.candidate) {
      this.candidate = raw;
      this.candidateSince = nowMs;
      return this.stable;
    }

    const need = isAdjacentFlicker(this.stable, raw)
      ? GestureClassifier.ADJACENT_CONFIRM_MS
      : GestureClassifier.CONFIRM_MS;

    if (nowMs - this.candidateSince >= need) {
      this.stable = raw;
    }
    return this.stable;
  }

  reset(): void {
    this.stable = 'none';
    this.candidate = 'none';
    this.candidateSince = 0;
  }
}

/** @deprecated 保留旧名，内部走瞬时判定；时序粘滞请用 GestureTracker */
export function classifyHand(lm: NormalizedLandmark[] | undefined): GestureKind {
  return classifyHandRaw(lm);
}

/**
 * 手势时序跟踪器：
 * - 粘滞分类，抑制比耶/一指抖动；
 * - 离散动作：同一次举起只触发一次，需放下（none/partial）后再触发；
 * - 张开手掌时估算挥动速度（用于旋转）。
 */
export class GestureTracker {
  private static readonly TRIGGER_HOLD_MS = 320;
  private static readonly RELEASE_MS = 180;
  private static readonly WAVE_WINDOW_MS = 220;
  private static readonly MAX_WAVE_SPEED = 2.6;

  private readonly classifier = new GestureClassifier();
  private holdStart: number | null = null;
  private holdKind: AssignableGesture | null = null;
  private firedThisHold = false;
  private releaseStart: number | null = null;
  private palmTrail: Array<{ t: number; x: number }> = [];

  /**
   * @returns triggered 为刚完成一次「按下式」触发的手势；
   *          waveSpeed 为镜像视角水平挥动速度。
   */
  update(
    rawKind: GestureKind,
    palmX: number | null,
    nowMs: number,
  ): {
    triggered: AssignableGesture | null;
    waveSpeed: number;
    kind: GestureKind;
  } {
    const kind = this.classifier.update(rawKind, nowMs);
    let triggered: AssignableGesture | null = null;

    if (isAssignableGesture(kind)) {
      this.releaseStart = null;

      if (this.holdKind !== kind) {
        // 从一种可分配手势抖到另一种：不立刻当作新一次按下
        // （避免比耶→一指连触发放大又缩小）
        if (
          this.holdKind !== null &&
          isAdjacentFlicker(this.holdKind, kind) &&
          this.firedThisHold
        ) {
          this.holdKind = kind;
          // 保持 firedThisHold=true，本次举起不再触发相反动作
        } else {
          this.holdKind = kind;
          this.holdStart = nowMs;
          this.firedThisHold = false;
        }
      }

      const heldLongEnough =
        this.holdStart !== null &&
        nowMs - this.holdStart >= GestureTracker.TRIGGER_HOLD_MS;

      if (heldLongEnough && !this.firedThisHold) {
        triggered = kind;
        this.firedThisHold = true;
      }
    } else {
      if (this.releaseStart === null) {
        this.releaseStart = nowMs;
      }
      if (nowMs - this.releaseStart >= GestureTracker.RELEASE_MS) {
        this.holdKind = null;
        this.holdStart = null;
        this.firedThisHold = false;
      }
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
    this.classifier.reset();
    this.holdStart = null;
    this.holdKind = null;
    this.firedThisHold = false;
    this.releaseStart = null;
    this.palmTrail = [];
  }
}
