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
  | 'nod'
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

function visible(p: NormalizedLandmark | undefined, min = 0.45): boolean {
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
 * 互斥分区判定（按优先级，后项不会吃掉前项）：
 * 1. 双手抱头 — 腕靠近耳朵/头顶
 * 2. 双手举起 — 腕高举且离开头部
 * 3. 拍手 — 双腕在胸前合拢
 * 4. 双手叉腰 — 手在腰侧、肘外撑
 * 5. 双臂平举 — T 字水平伸直
 * 6. 点头 — 低头（且手臂不在以上姿势）
 */
export function classifyPoseRaw(
  lm: NormalizedLandmark[] | undefined,
): GestureKind {
  if (!lm || lm.length < 17) return 'none';

  const ls = lm[L_SHOULDER];
  const rs = lm[R_SHOULDER];
  const lw = lm[L_WRIST];
  const rw = lm[R_WRIST];
  if (!visible(ls) || !visible(rs) || !visible(lw) || !visible(rw)) {
    return 'none';
  }

  const shoulderWidth = Math.max(0.08, Math.abs(rs.x - ls.x));
  const midShoulderY = (ls.y + rs.y) / 2;
  const midShoulderX = (ls.x + rs.x) / 2;

  if (isHandsOnHead(lm, lw, rw, midShoulderY, shoulderWidth)) {
    return 'handsOnHead';
  }

  // 举手：双手明显高于肩，且手腕离头够远（避免和抱头混）
  const leftUp = lw.y < ls.y - 0.08;
  const rightUp = rw.y < rs.y - 0.08;
  const wristsApart = dist(lw, rw) > shoulderWidth * 0.75;
  if (leftUp && rightUp && wristsApart && !wristsNearHead(lm, lw, rw, shoulderWidth)) {
    return 'armsUp';
  }

  // 拍手：胸前合拢，且明显高于腰、明显低于头顶举手区
  const wristsClose = dist(lw, rw) < shoulderWidth * 0.5;
  const clapHeight =
    lw.y > midShoulderY - 0.05 &&
    rw.y > midShoulderY - 0.05 &&
    lw.y < midShoulderY + 0.26 &&
    rw.y < midShoulderY + 0.26;
  if (wristsClose && clapHeight) return 'clap';

  if (isHandsOnHips(lm, ls, rs, lw, rw, midShoulderX, midShoulderY, shoulderWidth)) {
    return 'handsOnHips';
  }

  const leftLevel = Math.abs(lw.y - midShoulderY) < 0.12;
  const rightLevel = Math.abs(rw.y - midShoulderY) < 0.12;
  const leftOut = Math.abs(lw.x - midShoulderX) > shoulderWidth * 0.95;
  const rightOut = Math.abs(rw.x - midShoulderX) > shoulderWidth * 0.95;
  const notRaised = lw.y > midShoulderY - 0.04 && rw.y > midShoulderY - 0.04;
  if (leftLevel && rightLevel && leftOut && rightOut && notRaised) {
    return 'armsOut';
  }

  // 点头：低头姿态；手臂已排除其它姿势后才判定
  if (isHeadNodDown(lm, midShoulderY, shoulderWidth)) {
    return 'nod';
  }

  return 'none';
}

function wristsNearHead(
  lm: NormalizedLandmark[],
  lw: NormalizedLandmark,
  rw: NormalizedLandmark,
  shoulderWidth: number,
): boolean {
  const thr = shoulderWidth * 0.65;
  const nose = lm[NOSE];
  const le = lm[L_EAR];
  const re = lm[R_EAR];
  const nearL =
    (visible(le, 0.2) && dist(lw, le) < thr) ||
    (visible(nose, 0.2) && dist(lw, nose) < thr * 1.1);
  const nearR =
    (visible(re, 0.2) && dist(rw, re) < thr) ||
    (visible(nose, 0.2) && dist(rw, nose) < thr * 1.1);
  return nearL && nearR;
}

/** 双手抱头：双腕贴近两侧耳朵（或头顶），与「高举离开头部」互斥 */
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

  // 手腕至少到肩线附近或以上（抱头不会在腰际）
  if (lw.y > midShoulderY + 0.06 || rw.y > midShoulderY + 0.06) return false;

  const thr = shoulderWidth * 0.7;
  const leftAtEar =
    (visible(le, 0.2) && dist(lw, le) < thr) ||
    (visible(re, 0.2) && dist(lw, re) < thr) ||
    (visible(nose, 0.2) && dist(lw, nose) < thr * 1.15);
  const rightAtEar =
    (visible(re, 0.2) && dist(rw, re) < thr) ||
    (visible(le, 0.2) && dist(rw, le) < thr) ||
    (visible(nose, 0.2) && dist(rw, nose) < thr * 1.15);

  if (!(leftAtEar && rightAtEar)) return false;

  // 双手都在头侧，比直臂高举时双腕更靠近头、彼此也不会张得特别开
  // （高举时双腕往往分得很开且远离耳朵）
  return true;
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
  const waistBandTop = midShoulderY + 0.02;
  const waistBandBottom = midShoulderY + Math.max(0.22, shoulderWidth * 1.35);
  const leftDown =
    lw.y > ls.y + 0.03 && lw.y >= waistBandTop && lw.y <= waistBandBottom;
  const rightDown =
    rw.y > rs.y + 0.03 && rw.y >= waistBandTop && rw.y <= waistBandBottom;
  if (!leftDown || !rightDown) return false;

  const leftNear =
    Math.abs(lw.x - midShoulderX) > shoulderWidth * 0.28 &&
    Math.abs(lw.x - midShoulderX) < shoulderWidth * 1.25;
  const rightNear =
    Math.abs(rw.x - midShoulderX) > shoulderWidth * 0.28 &&
    Math.abs(rw.x - midShoulderX) < shoulderWidth * 1.25;
  if (!leftNear || !rightNear) return false;
  if (dist(lw, rw) < shoulderWidth * 0.55) return false;

  const le = lm[L_ELBOW];
  const re = lm[R_ELBOW];
  if (visible(le, 0.25) && visible(re, 0.25)) {
    const leftElbowOut =
      Math.abs(le.x - midShoulderX) >= Math.abs(lw.x - midShoulderX) - 0.03;
    const rightElbowOut =
      Math.abs(re.x - midShoulderX) >= Math.abs(rw.x - midShoulderX) - 0.03;
    if (!leftElbowOut || !rightElbowOut) return false;
  }

  return true;
}

/** 点头/低头：鼻子相对肩线明显下压；要求手臂未呈其它明确姿势 */
function isHeadNodDown(
  lm: NormalizedLandmark[],
  midShoulderY: number,
  shoulderWidth: number,
): boolean {
  const nose = lm[NOSE];
  if (!visible(nose, 0.35)) return false;

  // 站立看镜头时鼻在肩线上方；低头后鼻肩垂直间距变小
  const noseAbove = midShoulderY - nose.y;
  const ratio = noseAbove / shoulderWidth;
  // 正常约 0.7+；低头约 < 0.4
  return ratio < 0.42 && noseAbove < 0.14;
}

export function isBodyPose(kind: GestureKind): kind is BodyPose {
  return (
    kind === 'armsUp' ||
    kind === 'armsOut' ||
    kind === 'handsOnHips' ||
    kind === 'clap' ||
    kind === 'handsOnHead' ||
    kind === 'nod'
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
