import type { KaleidoscopePattern } from './patterns';

/** 孩子可选用的手势 / 简单身体姿势（写进设计页选项） */
export type AssignableGesture =
  | 'fist'
  | 'palm'
  | 'peace'
  | 'point'
  | 'palmZoom'
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
  {
    id: 'palmZoom',
    label: '手掌推近/拉远',
    emoji: '👐',
    group: 'hand',
  },
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
  {
    id: 'zoomIn',
    label: '放大',
    hint: '渐渐变大；可选「手掌推近/拉远」：推近放大',
  },
  {
    id: 'zoomOut',
    label: '缩小',
    hint: '渐渐变小；选「手掌推近/拉远」时与放大成对：拉远缩小',
  },
  { id: 'next', label: '换下一张', hint: '所有图片共用：换成下一张照片' },
];

const STORAGE_KEY = 'kaleido-design-v2';
const LEGACY_STORAGE_KEY = 'kaleido-design-v1';

export interface PersistedStudio {
  version: 2;
  gestures: PatternGestureMap;
  /** 上传图仅会话内有效，不落盘；字段保留兼容旧数据 */
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
      // 上传图不跨人复用：只恢复手势，图案始终为空
      return {
        version: 2,
        gestures: normalizeGestures(parsed.gestures),
        patterns: [],
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
  _patterns?: KaleidoscopePattern[],
): void {
  if (typeof window === 'undefined') return;
  // 只持久化手势；上传图仅本次会话内存，避免下一位用户看到上一人的照片
  const payload: PersistedStudio = {
    version: 2,
    gestures: normalizeGestures(gestures),
    patterns: [],
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

/** 张开手掌 与 手掌推近/拉远 都需要张手，不能同时占用 */
export function gesturesPhysicallyConflict(
  a: AssignableGesture,
  b: AssignableGesture,
): boolean {
  if (a === b) return true;
  return (
    (a === 'palm' && b === 'palmZoom') || (a === 'palmZoom' && b === 'palm')
  );
}

/** 手掌推近/拉远：放大+缩小成对共用，不算冲突 */
export function isPalmZoomPair(map: PatternGestureMap): boolean {
  return map.zoomIn === 'palmZoom' && map.zoomOut === 'palmZoom';
}

/** 同一套映射里，同一手势不能绑两个效果（palmZoom 放大缩小成对除外） */
export function findGestureConflict(
  map: PatternGestureMap,
): PatternAction[] | null {
  const entries = ACTION_OPTIONS.map((action) => ({
    action: action.id,
    gesture: map[action.id],
  }));
  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      const a = entries[i];
      const b = entries[j];
      if (
        a.gesture === 'palmZoom' &&
        b.gesture === 'palmZoom' &&
        ((a.action === 'zoomIn' && b.action === 'zoomOut') ||
          (a.action === 'zoomOut' && b.action === 'zoomIn'))
      ) {
        continue;
      }
      if (gesturesPhysicallyConflict(a.gesture, b.gesture)) {
        return [a.action, b.action];
      }
    }
  }
  return null;
}

/** 某个动作可选的手势列表（palmZoom 仅用于放大/缩小） */
export function optionsForAction(
  action: PatternAction,
  mode: GestureOptionGroup,
): typeof GESTURE_OPTIONS {
  const base = mode === 'body' ? BODY_POSE_OPTIONS : HAND_GESTURE_OPTIONS;
  if (mode === 'hand' && (action === 'zoomIn' || action === 'zoomOut')) {
    return base;
  }
  return base.filter((item) => item.id !== 'palmZoom');
}

export function gestureLabel(id: AssignableGesture): string {
  return GESTURE_OPTIONS.find((item) => item.id === id)?.label ?? id;
}

export function actionLabel(id: PatternAction): string {
  return ACTION_OPTIONS.find((item) => item.id === id)?.label ?? id;
}
