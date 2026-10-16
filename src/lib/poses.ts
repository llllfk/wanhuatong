import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { AssignableGesture } from './design-config';
import type { GestureKind } from './gestures';

/** 身体姿势（可分配） */
export type BodyPose = Extract<
  AssignableGesture,
  | 'armsUp'
  | 'armsOut'
  | 'handsOnHips'
  | 'clap'
  | 'handsOnHead'
>;

const NOSE = 0;
const L_EAR = 7;
const R_EAR = 8;
const L_SHOULDER = 11;
const R_SHOULDER = 12;
const L_ELBOW = 13;
const R_ELBOW = 14;
const L_WRIST = 15;
const R_WRIST = 16;

function visible(p: NormalizedLandmark | undefined, min = 0.35): boolean {
  if (!p) return false;
  const v = (p as NormalizedLandmark & { visibility?: number }).visibility;
  return v === undefined || v >= min;
}

function dist(a: NormalizedLandmark, b: NormalizedLandmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * 互斥分区判定（按优先级）：
 * 1. 双手抱头 — 腕贴耳侧且肘外撑（不是直臂高举）
 * 2. 双手举起 — 双腕明显高于肩/头且张开
 * 3. 拍手 — 双腕胸前合拢
 * 4. 双手叉腰 — 手在腰侧、肘外撑
 * 5. 双臂平举 — T 字水平
 */
export function classifyPoseRaw(
  lm: NormalizedLandmark[] | undefined,
): GestureKind {
  if (!lm || lm.length < 17) return 'none';

  const ls = lm[L_SHOULDER];
  const rs = lm[R_SHOULDER];
  const lw = lm[L_WRIST];
  const rw = lm[R_WRIST];
  if (!visible(ls, 0.4) || !visible(rs, 0.4) || !visible(lw, 0.25) || !visible(rw, 0.25)) {
    return 'none';
  }

  const shoulderWidth = Math.max(0.08, Math.abs(rs.x - ls.x));
  const midShoulderY = (ls.y + rs.y) / 2;
  const midShoulderX = (ls.x + rs.x) / 2;

  if (isHandsOnHead(lm, lw, rw, midShoulderY, shoulderWidth)) {
    return 'handsOnHead';
  }

  if (isArmsUp(lm, ls, rs, lw, rw, midShoulderY, shoulderWidth)) {
    return 'armsUp';
  }

  // 拍手：胸前合拢
  const wristsClose = dist(lw, rw) < shoulderWidth * 0.5;
  const clapHeight =
    lw.y > midShoulderY - 0.05 &&
    rw.y > midShoulderY - 0.05 &&
    lw.y < midShoulderY + 0.28 &&
    rw.y < midShoulderY + 0.28;
  if (wristsClose && clapHeight) return 'clap';

  if (isHandsOnHips(lm, ls, rs, lw, rw, midShoulderX, midShoulderY, shoulderWidth)) {
    return 'handsOnHips';
  }

  const leftLevel = Math.abs(lw.y - midShoulderY) < 0.14;
  const rightLevel = Math.abs(rw.y - midShoulderY) < 0.14;
  const leftOut = Math.abs(lw.x - midShoulderX) > shoulderWidth * 0.9;
  const rightOut = Math.abs(rw.x - midShoulderX) > shoulderWidth * 0.9;
  const notRaised = lw.y > midShoulderY - 0.05 && rw.y > midShoulderY - 0.05;
  if (leftLevel && rightLevel && leftOut && rightOut && notRaised) {
    return 'armsOut';
  }

  return 'none';
}

/** 双手举起：双腕明显高于肩，彼此张开；直臂高举不算抱头 */
function isArmsUp(
  lm: NormalizedLandmark[],
  ls: NormalizedLandmark,
  rs: NormalizedLandmark,
  lw: NormalizedLandmark,
  rw: NormalizedLandmark,
  midShoulderY: number,
  shoulderWidth: number,
): boolean {
  const leftUp = lw.y < ls.y - 0.06;
  const rightUp = rw.y < rs.y - 0.06;
  if (!leftUp || !rightUp) return false;

  // 双腕要张开（抱头时双手会更靠近头侧）
  if (dist(lw, rw) < shoulderWidth * 0.55) return false;

  const nose = lm[NOSE];
  // 腕明显高于鼻/肩线 → 高举，优先认举手
  const bothHigh =
    (visible(nose, 0.2) && lw.y < nose.y + 0.02 && rw.y < nose.y + 0.02) ||
    (lw.y < midShoulderY - 0.14 && rw.y < midShoulderY - 0.14);
  if (bothHigh) return true;

  // 略高过肩也可以，只要不贴耳朵
  return !wristsClampedToEars(lm, lw, rw, shoulderWidth);
}

/**
 * 双手抱头：腕贴近耳侧，且不是直臂举过头顶。
 * 用「肘在腕外侧/下方、腕不过分高于鼻」与举手区分。
 */
function isHandsOnHead(
  lm: NormalizedLandmark[],
  lw: NormalizedLandmark,
  rw: NormalizedLandmark,
  midShoulderY: number,
  shoulderWidth: number,
): boolean {
  const nose = lm[NOSE];
  const le = lm[L_EAR];
  const re = lm[R_EAR];
  if (!visible(nose, 0.2) && !visible(le, 0.2) && !visible(re, 0.2)) {
    return false;
  }

  // 抱头：腕在肩线附近或略上，不会远在头顶上方
  if (lw.y > midShoulderY + 0.08 || rw.y > midShoulderY + 0.08) return false;
  if (visible(nose, 0.2) && lw.y < nose.y - 0.1 && rw.y < nose.y - 0.1) {
    return false; // 双手举过头顶 → 举手
  }

  if (!wristsClampedToEars(lm, lw, rw, shoulderWidth)) return false;

  // 肘外撑（抱头典型）：肘比腕更靠外，或肘明显低于腕
  const elbL = lm[L_ELBOW];
  const elbR = lm[R_ELBOW];
  if (visible(elbL, 0.2) && visible(elbR, 0.2)) {
    const midX = ((lm[L_SHOULDER]?.x ?? 0.5) + (lm[R_SHOULDER]?.x ?? 0.5)) / 2;
    const elbowsOut =
      Math.abs(elbL.x - midX) > Math.abs(lw.x - midX) - 0.02 &&
      Math.abs(elbR.x - midX) > Math.abs(rw.x - midX) - 0.02;
    const elbowsBent = elbL.y > lw.y - 0.02 && elbR.y > rw.y - 0.02;
    if (!elbowsOut && !elbowsBent) return false;
  }

  return true;
}

function wristsClampedToEars(
  lm: NormalizedLandmark[],
  lw: NormalizedLandmark,
  rw: NormalizedLandmark,
  shoulderWidth: number,
): boolean {
  const thr = shoulderWidth * 0.55;
  const nose = lm[NOSE];
  const le = lm[L_EAR];
  const re = lm[R_EAR];
  const nearL =
    (visible(le, 0.15) && dist(lw, le) < thr) ||
    (visible(nose, 0.15) && dist(lw, nose) < thr * 0.95);
  const nearR =
    (visible(re, 0.15) && dist(rw, re) < thr) ||
    (visible(nose, 0.15) && dist(rw, nose) < thr * 0.95);
  return nearL && nearR;
}

function isHandsOnHips(
  lm: NormalizedLandmark[],
  ls: NormalizedLandmark,
  rs: NormalizedLandmark,
  lw: NormalizedLandmark,
  rw: NormalizedLandmark,
  midShoulderX: number,
  midShoulderY: number,
  shoulderWidth: number,
): boolean {
  // 腰际带宽一点：iPad 半身取景时髋点常出框，只靠肩腕肘
  const waistBandTop = midShoulderY + 0.01;
  const waistBandBottom = midShoulderY + Math.max(0.28, shoulderWidth * 1.6);
  const leftDown =
    lw.y > ls.y + 0.02 && lw.y >= waistBandTop && lw.y <= waistBandBottom;
  const rightDown =
    rw.y > rs.y + 0.02 && rw.y >= waistBandTop && rw.y <= waistBandBottom;
  if (!leftDown || !rightDown) return false;

  const leftNear =
    Math.abs(lw.x - midShoulderX) > shoulderWidth * 0.22 &&
    Math.abs(lw.x - midShoulderX) < shoulderWidth * 1.4;
  const rightNear =
    Math.abs(rw.x - midShoulderX) > shoulderWidth * 0.22 &&
    Math.abs(rw.x - midShoulderX) < shoulderWidth * 1.4;
  if (!leftNear || !rightNear) return false;
  if (dist(lw, rw) < shoulderWidth * 0.45) return false;

  const elbL = lm[L_ELBOW];
  const elbR = lm[R_ELBOW];
  if (visible(elbL, 0.2) && visible(elbR, 0.2)) {
    // 肘外撑：肘至少不比腕更贴身体中线太多
    const leftElbowOut =
      Math.abs(elbL.x - midShoulderX) >= Math.abs(lw.x - midShoulderX) - 0.06;
    const rightElbowOut =
      Math.abs(elbR.x - midShoulderX) >= Math.abs(rw.x - midShoulderX) - 0.06;
    if (!leftElbowOut || !rightElbowOut) return false;
  }

  return true;
}

export function isBodyPose(kind: GestureKind): kind is BodyPose {
  return (
    kind === 'armsUp' ||
    kind === 'armsOut' ||
    kind === 'handsOnHips' ||
    kind === 'clap' ||
    kind === 'handsOnHead'
  );
}

/** 上半身骨架连线（镜像坐标绘制用） */
export const POSE_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 7],
  [0, 4],
  [4, 5],
  [5, 6],
  [6, 8],
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [11, 23],
  [12, 24],
  [23, 24],
];
