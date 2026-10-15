'use client';

import { forwardRef, useEffect, useRef } from 'react';

interface KaleidoscopeStageProps {
  patternSrc: string;
  /** 图案缩放（1 = 默认） */
  scale?: number;
}

const SLICE_COUNT = 12;
const SLICE_ANGLE = 360 / SLICE_COUNT;

/**
 * 万花筒舞台：
 * - 12 个放射扇形切片铺满全屏，相邻切片镜像翻转；
 * - 外层 rotor 负责手势驱动的旋转（父组件通过 ref 写 transform）；
 * - scale 层负责放大 / 缩小；
 * - 中层 pop 层在切换图案时做果冻回弹。
 */
export const KaleidoscopeStage = forwardRef<
  HTMLDivElement,
  KaleidoscopeStageProps
>(function KaleidoscopeStage({ patternSrc, scale = 1 }, rotorRef) {
  const popRef = useRef<HTMLDivElement>(null);
  const scaleRef = useRef<HTMLDivElement>(null);
  const isFirstPattern = useRef(true);

  useEffect(() => {
    if (isFirstPattern.current) {
      isFirstPattern.current = false;
      return;
    }
    const el = popRef.current;
    if (!el) return;
    el.classList.remove('kaleido-pop');
    void el.offsetWidth;
    el.classList.add('kaleido-pop');
  }, [patternSrc]);

  useEffect(() => {
    if (scaleRef.current) {
      scaleRef.current.style.transform = `scale(${scale})`;
    }
  }, [scale]);

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#160f29]">
      <div
        ref={rotorRef}
        className="absolute inset-0 will-change-transform"
        style={{ transform: 'rotate(0deg)' }}
      >
        <div
          ref={scaleRef}
          className="absolute inset-0 will-change-transform transition-transform duration-300 [transition-timing-function:cubic-bezier(0.34,1.56,0.64,1)]"
          style={{ transform: `scale(${scale})` }}
        >
          <div ref={popRef} className="absolute inset-0">
            {Array.from({ length: SLICE_COUNT }, (_, index) => (
              <div
                key={index}
                className="kaleido-slice"
                style={{ transform: `rotate(${index * SLICE_ANGLE}deg)` }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  key={patternSrc}
                  src={patternSrc}
                  alt=""
                  draggable={false}
                  className={`kaleido-img${
                    index % 2 === 1 ? ' kaleido-img-mirror' : ''
                  }`}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="kaleido-vignette" />
    </div>
  );
});
