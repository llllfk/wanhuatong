import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { AssignableGesture } from './design-config';
import type { GestureKind } from './gestures';

/** 身体姿势（可分配） */
export type BodyPose = Extract<
  AssignableGesture,
  'armsUp' | 'armsOut' | 'handsOnHips' | 'clap'
>;

const L_SHOULDER = 11;
const R_SHOULDER = 12;
const L_ELBOW = 13;
const R_ELBOW = 14;
const L_WRIST = 15;
const R_WRIST = 16;
const L_HIP = 23;
const R_HIP = 24;

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
 * 简单身体姿势（不分左右手）：
 * - armsUp：双手举起
 * - armsOut：双臂平举
 * - handsOnHips：双手叉腰
 * - clap：双手在胸前合拢（拍手）——比摇头更稳、更不易误触
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

  // 拍手：双腕靠得很近，高度在胸腹之间（优先于其它姿势）
  const wristsClose = dist(lw, rw) < shoulderWidth * 0.55;
  const clapHeight =
    lw.y > midShoulderY - 0.08 &&
    rw.y > midShoulderY - 0.08 &&
    lw.y < midShoulderY + 0.28 &&
    rw.y < midShoulderY + 0.28;
  if (wristsClose && clapHeight) return 'clap';

  const leftUp = lw.y < ls.y - 0.06;
  const rightUp = rw.y < rs.y - 0.06;
  if (leftUp && rightUp) return 'armsUp';

  const leftLevel = Math.abs(lw.y - midShoulderY) < 0.14;
  const rightLevel = Math.abs(rw.y - midShoulderY) < 0.14;
  const leftOut = Math.abs(lw.x - midShoulderX) > shoulderWidth * 0.85;
  const rightOut = Math.abs(rw.x - midShoulderX) > shoulderWidth * 0.85;
  const notRaised = lw.y > midShoulderY - 0.05 && rw.y > midShoulderY - 0.05;
  if (leftLevel && rightLevel && leftOut && rightOut && notRaised) {
    return 'armsOut';
  }

  // 叉腰：双腕靠近双髋，且低于肩
  const lh = lm[L_HIP];
  const rh = lm[R_HIP];
  if (visible(lh, 0.35) && visible(rh, 0.35)) {
    const nearHip = (wrist: NormalizedLandmark, hip: NormalizedLandmark) =>
      dist(wrist, hip) < shoulderWidth * 0.65;
    const leftOnHip = nearHip(lw, lh) && lw.y > ls.y + 0.02;
    const rightOnHip = nearHip(rw, rh) && rw.y > rs.y + 0.02;
    if (leftOnHip && rightOnHip) {
      const le = lm[L_ELBOW];
      const re = lm[R_ELBOW];
      const elbowsOk =
        !visible(le, 0.3) ||
        !visible(re, 0.3) ||
        (Math.abs(le.x - midShoulderX) > shoulderWidth * 0.25 &&
          Math.abs(re.x - midShoulderX) > shoulderWidth * 0.25);
      if (elbowsOk) return 'handsOnHips';
    }
  }

  return 'none';
}

export function isBodyPose(kind: GestureKind): kind is BodyPose {
  return (
    kind === 'armsUp' ||
    kind === 'armsOut' ||
    kind === 'handsOnHips' ||
    kind === 'clap'
  );
}

/** 上半身骨架连线（镜像坐标绘制用） */
export const POSE_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [11, 23],
  [12, 24],
  [23, 24],
];
