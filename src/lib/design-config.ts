import { BUILTIN_PATTERNS } from './patterns';

/** 孩子可选用的手势（写进设计页选项） */
export type AssignableGesture = 'fist' | 'palm' | 'peace' | 'point';

/** 每张图案可绑定的效果 */
export type PatternAction = 'rotate' | 'zoomIn' | 'zoomOut' | 'next';

export interface PatternGestureMap {
  rotate: AssignableGesture;
  zoomIn: AssignableGesture;
  zoomOut: AssignableGesture;
  next: AssignableGesture;
}

export type DesignConfig = PatternGestureMap[];

export const GESTURE_OPTIONS: ReadonlyArray<{
  id: AssignableGesture;
  label: string;
  emoji: string;
}> = [
  { id: 'fist', label: '握拳', emoji: '✊' },
  { id: 'palm', label: '张开手掌', emoji: '🖐️' },
  { id: 'peace', label: '比耶', emoji: '✌️' },
  { id: 'point', label: '伸出一根手指', emoji: '☝️' },
];

export const ACTION_OPTIONS: ReadonlyArray<{
  id: PatternAction;
  label: string;
  hint: string;
}> = [
  { id: 'rotate', label: '翻转 / 旋转', hint: '做这个手势，图案转起来' },
  { id: 'zoomIn', label: '放大', hint: '做这个手势，图案变大' },
  { id: 'zoomOut', label: '缩小', hint: '做这个手势，图案变小' },
  { id: 'next', label: '换下一张', hint: '做这个手势，换下一张图案' },
];

const STORAGE_KEY = 'kaleido-design-v1';

const DEFAULT_PRESETS: PatternGestureMap[] = [
  { rotate: 'palm', zoomIn: 'peace', zoomOut: 'point', next: 'fist' },
  { rotate: 'fist', zoomIn: 'palm', zoomOut: 'peace', next: 'point' },
  { rotate: 'peace', zoomIn: 'fist', zoomOut: 'palm', next: 'point' },
  { rotate: 'point', zoomIn: 'peace', zoomOut: 'fist', next: 'palm' },
  { rotate: 'palm', zoomIn: 'fist', zoomOut: 'point', next: 'peace' },
  { rotate: 'fist', zoomIn: 'point', zoomOut: 'palm', next: 'peace' },
];

function cloneMap(map: PatternGestureMap): PatternGestureMap {
  return { ...map };
}

export function defaultMapForIndex(index: number): PatternGestureMap {
  return cloneMap(DEFAULT_PRESETS[index % DEFAULT_PRESETS.length]);
}

/** 为指定数量的图案生成默认可编辑配置 */
export function createDefaultDesign(
  count: number = BUILTIN_PATTERNS.length,
): DesignConfig {
  return Array.from({ length: Math.max(1, count) }, (_, index) =>
    defaultMapForIndex(index),
  );
}

/** 把配置长度对齐到图案数量（多裁少补） */
export function resizeDesign(
  config: DesignConfig,
  count: number,
): DesignConfig {
  if (config.length === count) return config;
  if (config.length > count) return config.slice(0, count);
  const next = [...config];
  while (next.length < count) {
    next.push(defaultMapForIndex(next.length));
  }
  return next;
}

export function loadDesign(
  count: number = BUILTIN_PATTERNS.length,
): DesignConfig {
  const fallback = createDefaultDesign(count);
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return fallback;
    return Array.from({ length: count }, (_, index) => {
      const item = parsed[index] as Partial<PatternGestureMap> | undefined;
      const base = fallback[index];
      return {
        rotate: isAssignable(item?.rotate) ? item.rotate : base.rotate,
        zoomIn: isAssignable(item?.zoomIn) ? item.zoomIn : base.zoomIn,
        zoomOut: isAssignable(item?.zoomOut) ? item.zoomOut : base.zoomOut,
        next: isAssignable(item?.next) ? item.next : base.next,
      };
    });
  } catch {
    return fallback;
  }
}

export function saveDesign(config: DesignConfig): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

function isAssignable(value: unknown): value is AssignableGesture {
  return (
    value === 'fist' ||
    value === 'palm' ||
    value === 'peace' ||
    value === 'point'
  );
}

/** 同一张图案上，同一手势不能绑两个效果 */
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
