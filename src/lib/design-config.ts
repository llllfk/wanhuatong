import type { KaleidoscopePattern } from './patterns';

/** 孩子可选用的手势 / 简单身体姿势（写进设计页选项） */
export type AssignableGesture =
  | 'fist'
  | 'palm'
  | 'peace'
  | 'point'
  | 'armsUp'
  | 'armsOut'
  | 'armUpLeft'
  | 'armUpRight'
  | 'handsOnHips';

/** 全部图片共用的效果 */
export type PatternAction = 'rotate' | 'zoomIn' | 'zoomOut' | 'next';

/** 全场共用的一套手势映射（所有上传图同一套） */
export interface PatternGestureMap {
  rotate: AssignableGesture;
  zoomIn: AssignableGesture;
  zoomOut: AssignableGesture;
  next: AssignableGesture;
}

/** @deprecated 旧版按图配置；现为单套映射 */
export type DesignConfig = PatternGestureMap;

export type GestureOptionGroup = 'hand' | 'body';

export const GESTURE_OPTIONS: ReadonlyArray<{
  id: AssignableGesture;
  label: string;
  emoji: string;
  group: GestureOptionGroup;
}> = [
  { id: 'fist', label: '握拳', emoji: '✊', group: 'hand' },
  { id: 'palm', label: '张开手掌', emoji: '🖐️', group: 'hand' },
  { id: 'peace', label: '比耶', emoji: '✌️', group: 'hand' },
  { id: 'point', label: '伸出一根手指', emoji: '☝️', group: 'hand' },
  { id: 'armsUp', label: '双手举起', emoji: '🙌', group: 'body' },
  { id: 'armsOut', label: '双臂平举', emoji: '🤸', group: 'body' },
  { id: 'armUpLeft', label: '举起左手', emoji: '👈', group: 'body' },
  { id: 'armUpRight', label: '举起右手', emoji: '👉', group: 'body' },
  { id: 'handsOnHips', label: '双手叉腰', emoji: '🧍', group: 'body' },
];

export const HAND_GESTURE_OPTIONS = GESTURE_OPTIONS.filter(
  (item) => item.group === 'hand',
);

export const BODY_POSE_OPTIONS = GESTURE_OPTIONS.filter(
  (item) => item.group === 'body',
);

const ASSIGNABLE_SET = new Set<AssignableGesture>(
  GESTURE_OPTIONS.map((item) => item.id),
);

export function gestureGroupOf(id: AssignableGesture): GestureOptionGroup {
  return GESTURE_OPTIONS.find((item) => item.id === id)?.group ?? 'hand';
}

/** 整场只能选一类：手势 或 身体姿势 */
export function createGesturesForMode(
  mode: GestureOptionGroup,
): PatternGestureMap {
  if (mode === 'body') {
    return {
      rotate: 'armsOut',
      zoomIn: 'armsUp',
      zoomOut: 'armUpLeft',
      next: 'handsOnHips',
    };
  }
  return {
    rotate: 'palm',
    zoomIn: 'peace',
    zoomOut: 'point',
    next: 'fist',
  };
}

export function inferGestureMode(map: PatternGestureMap): GestureOptionGroup {
  const groups = ACTION_OPTIONS.map((action) => gestureGroupOf(map[action.id]));
  const bodyCount = groups.filter((g) => g === 'body').length;
  return bodyCount >= 2 ? 'body' : 'hand';
}

/** 若手势与身体姿势混用，整套纠正为同一类 */
export function ensureSingleGestureMode(
  map: PatternGestureMap,
): PatternGestureMap {
  const mode = inferGestureMode(map);
  const mixed = ACTION_OPTIONS.some(
    (action) => gestureGroupOf(map[action.id]) !== mode,
  );
  if (!mixed) return map;
  return createGesturesForMode(mode);
}

export const ACTION_OPTIONS: ReadonlyArray<{
  id: PatternAction;
  label: string;
  hint: string;
}> = [
  { id: 'rotate', label: '翻转 / 旋转', hint: '所有图片共用：图案转起来' },
  { id: 'zoomIn', label: '放大', hint: '所有图片共用：图案渐渐变大' },
  { id: 'zoomOut', label: '缩小', hint: '所有图片共用：图案渐渐变小' },
  { id: 'next', label: '换下一张', hint: '所有图片共用：换成下一张照片' },
];

const STORAGE_KEY = 'kaleido-design-v2';
const LEGACY_STORAGE_KEY = 'kaleido-design-v1';

export interface PersistedStudio {
  version: 2;
  gestures: PatternGestureMap;
  patterns: KaleidoscopePattern[];
}

export function createDefaultGestures(): PatternGestureMap {
  return createGesturesForMode('hand');
}

/** @deprecated 使用 createDefaultGestures */
export function createDefaultDesign(_count?: number): PatternGestureMap {
  return createDefaultGestures();
}

/** @deprecated 单套映射后不再按数量对齐 */
export function resizeDesign(
  config: PatternGestureMap,
  _count?: number,
): PatternGestureMap {
  return normalizeGestures(config);
}

export function defaultMapForIndex(_index?: number): PatternGestureMap {
  return createDefaultGestures();
}

function normalizeGestures(
  raw: Partial<PatternGestureMap> | null | undefined,
): PatternGestureMap {
  const base = createDefaultGestures();
  const next = {
    rotate: isAssignable(raw?.rotate) ? raw.rotate : base.rotate,
    zoomIn: isAssignable(raw?.zoomIn) ? raw.zoomIn : base.zoomIn,
    zoomOut: isAssignable(raw?.zoomOut) ? raw.zoomOut : base.zoomOut,
    next: isAssignable(raw?.next) ? raw.next : base.next,
  };
  return ensureSingleGestureMode(next);
}

function isPatternList(value: unknown): value is KaleidoscopePattern[] {
  if (!Array.isArray(value)) return false;
  return value.every(
    (item) =>
      item &&
      typeof item === 'object' &&
      typeof (item as KaleidoscopePattern).src === 'string' &&
      typeof (item as KaleidoscopePattern).label === 'string',
  );
}

export function loadStudio(): PersistedStudio {
  const empty: PersistedStudio = {
    version: 2,
    gestures: createDefaultGestures(),
    patterns: [],
  };
  if (typeof window === 'undefined') return empty;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PersistedStudio>;
      return {
        version: 2,
        gestures: normalizeGestures(parsed.gestures),
        patterns: isPatternList(parsed.patterns)
          ? parsed.patterns.map((item) => ({
              src: item.src,
              label: item.label,
              custom: true,
            }))
          : [],
      };
    }

    // 兼容旧版：只恢复第一套手势，图案需重新上传
    const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy) as unknown;
      if (Array.isArray(parsed) && parsed[0]) {
        return {
          version: 2,
          gestures: normalizeGestures(
            parsed[0] as Partial<PatternGestureMap>,
          ),
          patterns: [],
        };
      }
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return {
          version: 2,
          gestures: normalizeGestures(parsed as Partial<PatternGestureMap>),
          patterns: [],
        };
      }
    }
  } catch {
    // ignore
  }
  return empty;
}

/** @deprecated 使用 loadStudio */
export function loadDesign(_count?: number): PatternGestureMap {
  return loadStudio().gestures;
}

export function saveStudio(
  gestures: PatternGestureMap,
  patterns: KaleidoscopePattern[],
): void {
  if (typeof window === 'undefined') return;
  const payload: PersistedStudio = {
    version: 2,
    gestures: normalizeGestures(gestures),
    patterns: patterns.map((item) => ({
      src: item.src,
      label: item.label,
      custom: true,
    })),
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn('[design-config] 保存失败（可能超出容量）：', error);
  }
}

/** @deprecated 使用 saveStudio */
export function saveDesign(config: PatternGestureMap): void {
  if (typeof window === 'undefined') return;
  const prev = loadStudio();
  saveStudio(config, prev.patterns);
}

function isAssignable(value: unknown): value is AssignableGesture {
  return (
    typeof value === 'string' && ASSIGNABLE_SET.has(value as AssignableGesture)
  );
}

/** 同一套映射里，同一手势不能绑两个效果 */
export function findGestureConflict(
  map: PatternGestureMap,
): PatternAction[] | null {
  const entries = ACTION_OPTIONS.map((action) => ({
    action: action.id,
    gesture: map[action.id],
  }));
  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      if (entries[i].gesture === entries[j].gesture) {
        return [entries[i].action, entries[j].action];
      }
    }
  }
  return null;
}

export function gestureLabel(id: AssignableGesture): string {
  return GESTURE_OPTIONS.find((item) => item.id === id)?.label ?? id;
}

export function actionLabel(id: PatternAction): string {
  return ACTION_OPTIONS.find((item) => item.id === id)?.label ?? id;
}
