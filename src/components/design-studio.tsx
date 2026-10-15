'use client';

import { Play, RotateCcw, Sparkles } from 'lucide-react';
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
import { PATTERNS } from '@/lib/patterns';

interface DesignStudioProps {
  config: DesignConfig;
  selectedIndex: number;
  onSelectPattern: (index: number) => void;
  onChangeMapping: (
    patternIndex: number,
    action: PatternAction,
    gesture: AssignableGesture,
  ) => void;
  onReset: () => void;
  onRun: () => void;
}

export function DesignStudio({
  config,
  selectedIndex,
  onSelectPattern,
  onChangeMapping,
  onReset,
  onRun,
}: DesignStudioProps) {
  const map = config[selectedIndex] ?? config[0];
  const conflict = map ? findGestureConflict(map) : null;
  const pattern = PATTERNS[selectedIndex] ?? PATTERNS[0];

  return (
    <div className="design-studio">
      <div className="design-studio-blob design-studio-blob-a" />
      <div className="design-studio-blob design-studio-blob-b" />

      <header className="relative z-10 flex flex-col items-center gap-2 px-4 pt-[max(1rem,env(safe-area-inset-top))] text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/25">
          <Sparkles className="size-7 text-amber-300" />
        </div>
        <h1 className="font-kid text-4xl text-[#fff7e8] sm:text-5xl">
          设计你们的万花筒
        </h1>
        <p className="max-w-xl font-kid text-lg text-white/70 sm:text-xl">
          先选一张图案，再为放大、缩小、翻转、换图各自选一种手势。
          每张可以配得不一样。配好后点「运行」上台表演！
        </p>
      </header>

      <section className="relative z-10 mt-4 flex gap-3 overflow-x-auto px-4 pb-2">
        {PATTERNS.map((item, index) => {
          const active = index === selectedIndex;
          return (
            <button
              key={item.src}
              type="button"
              onClick={() => onSelectPattern(index)}
              className={`design-pattern-card ${active ? 'is-active' : ''}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.src} alt="" className="design-pattern-thumb" />
              <span className="font-kid text-base text-white">
                第 {index + 1} 张
              </span>
              <span className="truncate text-xs text-white/55">{item.label}</span>
            </button>
          );
        })}
      </section>

      <section className="relative z-10 mx-auto mt-2 w-full max-w-3xl flex-1 overflow-y-auto px-4 pb-36">
        <div className="rounded-3xl bg-white/10 p-4 ring-1 ring-white/15 backdrop-blur-md sm:p-6">
          <h2 className="font-kid text-2xl text-amber-200">
            正在设计：第 {selectedIndex + 1} 张 · {pattern?.label}
          </h2>
          <p className="mt-1 text-sm text-white/60">
            四种效果请选四种不同手势，避免打架哦
          </p>

          <div className="mt-5 space-y-5">
            {ACTION_OPTIONS.map((action) => (
              <div key={action.id} className="design-action-block">
                <div className="mb-2">
                  <p className="font-kid text-xl text-white">{action.label}</p>
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
                        disabled={usedElsewhere}
                        onClick={() =>
                          onChangeMapping(selectedIndex, action.id, gesture.id)
                        }
                        className={`design-gesture-chip ${
                          selected ? 'is-selected' : ''
                        } ${usedElsewhere ? 'is-disabled' : ''}`}
                      >
                        <span className="text-2xl leading-none">{gesture.emoji}</span>
                        <span className="font-kid text-base">{gesture.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {conflict && (
            <p className="mt-4 rounded-2xl bg-amber-400/20 px-4 py-3 font-kid text-lg text-amber-100 ring-1 ring-amber-300/40">
              「{actionLabel(conflict[0])}」和「{actionLabel(conflict[1])}」用手势相同了，请改成不一样的。
            </p>
          )}
        </div>
      </section>

      <footer className="design-studio-footer">
        <button type="button" onClick={onReset} className="design-secondary-btn">
          <RotateCcw className="size-6" />
          恢复默认
        </button>
        <button
          type="button"
          onClick={onRun}
          disabled={Boolean(conflict)}
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
