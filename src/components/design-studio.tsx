'use client';

import {
  Check,
  ImagePlus,
  Images,
  Play,
  RotateCcw,
  RotateCw,
  Sparkles,
  Trash2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useRef, useState, type ComponentType } from 'react';
import {
  ACTION_OPTIONS,
  BODY_POSE_OPTIONS,
  HAND_GESTURE_OPTIONS,
  actionLabel,
  findGestureConflict,
  inferGestureMode,
  type AssignableGesture,
  type GestureOptionGroup,
  type PatternAction,
  type PatternGestureMap,
} from '@/lib/design-config';
import type { KaleidoscopePattern } from '@/lib/patterns';

const ACTION_VISUAL: Record<
  PatternAction,
  {
    Icon: ComponentType<{ className?: string }>;
    className: string;
    demo: string;
  }
> = {
  rotate: {
    Icon: RotateCw,
    className: 'action-visual-rotate',
    demo: '转',
  },
  zoomIn: {
    Icon: ZoomIn,
    className: 'action-visual-zoomin',
    demo: '大',
  },
  zoomOut: {
    Icon: ZoomOut,
    className: 'action-visual-zoomout',
    demo: '小',
  },
  next: {
    Icon: Images,
    className: 'action-visual-next',
    demo: '换',
  },
};

interface DesignStudioProps {
  patterns: KaleidoscopePattern[];
  gestures: PatternGestureMap;
  selectedIndex: number;
  onSelectPattern: (index: number) => void;
  onChangeMapping: (action: PatternAction, gesture: AssignableGesture) => void;
  onChangeGestureMode: (mode: GestureOptionGroup) => void;
  onAddPatterns: (files: FileList | File[]) => Promise<void> | void;
  onRemovePattern: (index: number) => void;
  onReset: () => void;
  onRun: () => void;
}

export function DesignStudio({
  patterns,
  gestures,
  selectedIndex,
  onSelectPattern,
  onChangeMapping,
  onChangeGestureMode,
  onAddPatterns,
  onRemovePattern,
  onReset,
  onRun,
}: DesignStudioProps) {
  const conflict = findGestureConflict(gestures);
  const gestureMode = inferGestureMode(gestures);
  const activeOptions =
    gestureMode === 'body' ? BODY_POSE_OPTIONS : HAND_GESTURE_OPTIONS;
  const pattern = patterns[selectedIndex] ?? patterns[0];
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFiles = async (list: FileList | null): Promise<void> => {
    if (!list || list.length === 0) return;
    setUploading(true);
    try {
      await onAddPatterns(list);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="design-studio">
      <div className="design-studio-blob design-studio-blob-a" />
      <div className="design-studio-blob design-studio-blob-b" />

      <div className="design-studio-shell">
        <header className="design-studio-header">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/25">
              <Sparkles className="size-5 text-amber-300" />
            </div>
            <div className="min-w-0 text-left">
              <h1 className="font-kid text-3xl leading-tight text-[#fff7e8] sm:text-4xl">
                设计你们的万花筒
              </h1>
              <p className="mt-0.5 font-kid text-base text-white/65 sm:text-lg">
                左边上传照片，右边配一套手势（所有图共用）；点「运行」表演
              </p>
            </div>
          </div>
        </header>

        <div className="design-split">
          <aside className="design-split-left" aria-label="上传万花筒照片">
            <div className="design-section-title is-left">
              <span className="font-kid text-xl text-amber-200">① 上传照片</span>
              <span className="text-sm text-white/55">
                自己选图，镜子会折成万花筒
              </span>
            </div>

            {pattern ? (
              <div className="design-style-preview is-aside">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={pattern.src}
                  alt=""
                  className="design-style-preview-img is-large"
                />
                <div className="design-style-preview-meta">
                  <p className="font-kid text-xl text-white sm:text-2xl">
                    第 {selectedIndex + 1} 张 · {pattern.label}
                  </p>
                  <p className="text-sm text-white/55">
                    共 {patterns.length} 张 · 上传
                  </p>
                </div>
              </div>
            ) : (
              <div className="design-empty-upload">
                <ImagePlus className="size-12 text-amber-200/80" />
                <p className="font-kid text-2xl text-white">还没有照片</p>
                <p className="text-sm text-white/55">
                  先上传几张，再配手势去表演
                </p>
              </div>
            )}

            <div className="design-upload-row">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(event) => {
                  void handleFiles(event.target.files);
                }}
              />
              <button
                type="button"
                className="design-upload-btn"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
              >
                <ImagePlus className="size-5" />
                {uploading ? '正在加入…' : '上传多张图片'}
              </button>
              {pattern && (
                <button
                  type="button"
                  className="design-remove-btn"
                  onClick={() => onRemovePattern(selectedIndex)}
                  aria-label="删除这张图片"
                >
                  <Trash2 className="size-5" />
                  删除
                </button>
              )}
            </div>

            {patterns.length > 0 && (
              <div className="design-pattern-grid is-aside">
                {patterns.map((item, index) => {
                  const active = index === selectedIndex;
                  return (
                    <button
                      key={`${item.src.slice(0, 48)}-${index}`}
                      type="button"
                      onClick={() => onSelectPattern(index)}
                      aria-pressed={active}
                      className={`design-pattern-card ${active ? 'is-active' : ''}`}
                    >
                      {active && (
                        <span className="design-pattern-check" aria-hidden>
                          <Check className="size-4 stroke-[3]" />
                        </span>
                      )}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.src}
                        alt=""
                        className="design-pattern-thumb"
                      />
                      <span className="font-kid text-sm text-white">
                        第 {index + 1} 张
                      </span>
                      <span className="truncate text-[11px] text-white/60">
                        {item.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </aside>

          <section className="design-split-right" aria-label="配置手势">
            <div className="design-config-scroll">
              <div className="design-config-panel">
                <div className="design-section-title is-left">
                  <span className="font-kid text-xl text-amber-200">
                    ② 配置动作
                  </span>
                  <span className="text-sm text-white/55">
                    先选手势或身体姿势，只能用一种；全场共用
                  </span>
                </div>

                <div
                  className="design-mode-switch"
                  role="group"
                  aria-label="选择用手势还是身体姿势"
                >
                  <button
                    type="button"
                    className={`design-mode-btn ${
                      gestureMode === 'hand' ? 'is-active' : ''
                    }`}
                    aria-pressed={gestureMode === 'hand'}
                    onClick={() => onChangeGestureMode('hand')}
                  >
                    <span className="text-xl leading-none">🖐️</span>
                    <span className="font-kid text-lg">用手势</span>
                  </button>
                  <button
                    type="button"
                    className={`design-mode-btn ${
                      gestureMode === 'body' ? 'is-active' : ''
                    }`}
                    aria-pressed={gestureMode === 'body'}
                    onClick={() => onChangeGestureMode('body')}
                  >
                    <span className="text-xl leading-none">🧍</span>
                    <span className="font-kid text-lg">用身体姿势</span>
                  </button>
                </div>

                <div className="mt-3 space-y-3">
                  {ACTION_OPTIONS.map((action) => {
                    const visual = ACTION_VISUAL[action.id];
                    const Icon = visual.Icon;
                    return (
                      <div key={action.id} className="design-action-block">
                        <div className="mb-2 flex items-start gap-3">
                          <div
                            className={`action-visual ${visual.className}`}
                            aria-hidden
                          >
                            <span className="action-visual-shape">
                              {visual.demo}
                            </span>
                            <Icon className="action-visual-icon" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-kid text-lg text-white sm:text-xl">
                              {action.label}
                            </p>
                            <p className="text-sm text-white/55">
                              {action.hint}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {activeOptions.map((gesture) => {
                            const selected =
                              gestures[action.id] === gesture.id;
                            const usedElsewhere =
                              !selected &&
                              isGestureUsedByOther(
                                gestures,
                                action.id,
                                gesture.id,
                              );
                            return (
                              <button
                                key={gesture.id}
                                type="button"
                                onClick={() =>
                                  onChangeMapping(action.id, gesture.id)
                                }
                                className={`design-gesture-chip ${
                                  selected ? 'is-selected' : ''
                                } ${usedElsewhere ? 'is-swap' : ''}`}
                              >
                                <span className="text-2xl leading-none">
                                  {gesture.emoji}
                                </span>
                                <span className="font-kid text-base">
                                  {gesture.label}
                                </span>
                                {usedElsewhere && (
                                  <span className="text-xs text-amber-100/80">
                                    对调
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {conflict && (
                  <p className="mt-4 rounded-2xl bg-amber-400/20 px-4 py-3 font-kid text-lg text-amber-100 ring-1 ring-amber-300/40">
                    「{actionLabel(conflict[0])}」和「
                    {actionLabel(conflict[1])}」用手势相同了，请改成不一样的。
                  </p>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>

      <footer className="design-studio-footer">
        <button type="button" onClick={onReset} className="design-secondary-btn">
          <RotateCcw className="size-6" />
          清空重来
        </button>
        <button
          type="button"
          onClick={onRun}
          disabled={Boolean(conflict) || patterns.length === 0}
          className="design-run-btn"
        >
          <Play className="size-8 fill-current" />
          {patterns.length === 0 ? '先上传照片' : '运行 · 开始表演'}
        </button>
      </footer>
    </div>
  );
}

function isGestureUsedByOther(
  map: PatternGestureMap,
  currentAction: PatternAction,
  gesture: AssignableGesture,
): boolean {
  return ACTION_OPTIONS.some(
    (action) => action.id !== currentAction && map[action.id] === gesture,
  );
}

