'use client';

import { Check, ImagePlus, Play, RotateCcw, Sparkles, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import {
  ACTION_OPTIONS,
  GESTURE_OPTIONS,
  actionLabel,
  findGestureConflict,
  type AssignableGesture,
  type DesignConfig,
  type PatternAction,
  type PatternGestureMap,
} from '@/lib/design-config';
import type { KaleidoscopePattern } from '@/lib/patterns';

interface DesignStudioProps {
  patterns: KaleidoscopePattern[];
  config: DesignConfig;
  selectedIndex: number;
  onSelectPattern: (index: number) => void;
  onChangeMapping: (
    patternIndex: number,
    action: PatternAction,
    gesture: AssignableGesture,
  ) => void;
  onAddPatterns: (files: FileList | File[]) => Promise<void> | void;
  onRemovePattern: (index: number) => void;
  onReset: () => void;
  onRun: () => void;
}

export function DesignStudio({
  patterns,
  config,
  selectedIndex,
  onSelectPattern,
  onChangeMapping,
  onAddPatterns,
  onRemovePattern,
  onReset,
  onRun,
}: DesignStudioProps) {
  const map = config[selectedIndex] ?? config[0];
  const conflict = map ? findGestureConflict(map) : null;
  const pattern = patterns[selectedIndex] ?? patterns[0];
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFiles = async (
    list: FileList | null,
  ): Promise<void> => {
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
                左边选/上传样式，右边选手势；配好点「运行」表演
              </p>
            </div>
          </div>
        </header>

        <div className="design-split">
          <aside className="design-split-left" aria-label="选择万花筒样式">
            <div className="design-section-title is-left">
              <span className="font-kid text-xl text-amber-200">① 选择样式</span>
              <span className="text-sm text-white/55">
                可上传照片，镜子会把它折成万花筒
              </span>
            </div>

            <div className="design-style-preview is-aside">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={pattern?.src}
                alt=""
                className="design-style-preview-img is-large"
              />
              <div className="design-style-preview-meta">
                <p className="font-kid text-xl text-white sm:text-2xl">
                  第 {selectedIndex + 1} 张 · {pattern?.label}
                </p>
                <p className="text-sm text-white/55">
                  共 {patterns.length} 张
                  {pattern?.custom ? ' · 上传' : ' · 预置'}
                </p>
              </div>
            </div>

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
              {pattern?.custom && (
                <button
                  type="button"
                  className="design-remove-btn"
                  onClick={() => onRemovePattern(selectedIndex)}
                  aria-label="删除这张上传图片"
                >
                  <Trash2 className="size-5" />
                  删除
                </button>
              )}
            </div>

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
                    <img src={item.src} alt="" className="design-pattern-thumb" />
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
          </aside>

          <section className="design-split-right" aria-label="配置手势">
            <div className="design-config-scroll">
              <div className="design-config-panel">
                <div className="design-section-title is-left">
                  <span className="font-kid text-xl text-amber-200">
                    ② 配置手势
                  </span>
                  <span className="text-sm text-white/55">
                    点一下换手势；占用时自动对调
                  </span>
                </div>

                <div className="mt-3 space-y-3">
                  {ACTION_OPTIONS.map((action) => (
                    <div key={action.id} className="design-action-block">
                      <div className="mb-2">
                        <p className="font-kid text-lg text-white sm:text-xl">
                          {action.label}
                        </p>
                        <p className="text-sm text-white/55">{action.hint}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {GESTURE_OPTIONS.map((gesture) => {
                          const selected = map?.[action.id] === gesture.id;
                          const usedElsewhere =
                            !selected &&
                            map &&
                            isGestureUsedByOther(map, action.id, gesture.id);
                          return (
                            <button
                              key={gesture.id}
                              type="button"
                              onClick={() =>
                                onChangeMapping(
                                  selectedIndex,
                                  action.id,
                                  gesture.id,
                                )
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
                  ))}
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
          恢复默认
        </button>
        <button
          type="button"
          onClick={onRun}
          disabled={Boolean(conflict) || patterns.length === 0}
          className="design-run-btn"
        >
          <Play className="size-8 fill-current" />
          运行 · 开始表演
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
