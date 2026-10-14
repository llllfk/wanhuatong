'use client';

import { forwardRef, useEffect, useRef } from 'react';

interface KaleidoscopeStageProps {
  patternSrc: string;
}

const SLICE_COUNT = 12;
const SLICE_ANGLE = 360 / SLICE_COUNT;

/**
 * 万花筒舞台：
 * - 12 个放射扇形切片铺满全屏，相邻切片镜像翻转，形成真实万花筒的镜面对称；
 * - 外层 rotor 负责手势驱动的旋转（父组件通过 ref 直接写 transform，不走 React 渲染）；
 * - 中层 pop 层在切换图案时做果冻回弹；
 * - 所有动画只使用 transform / opacity，保证 iPad 上流畅。
 */
export const KaleidoscopeStage = forwardRef<
  HTMLDivElement,
  KaleidoscopeStageProps
>(function KaleidoscopeStage({ patternSrc }, rotorRef) {
  const popRef = useRef<HTMLDivElement>(null);
  const isFirstPattern = useRef(true);

  useEffect(() => {
    if (isFirstPattern.current) {
      isFirstPattern.current = false;
      return;
    }
    const el = popRef.current;
    if (!el) return;
    el.classList.remove('kaleido-pop');
    // 强制重排以重新触发动画
    void el.offsetWidth;
    el.classList.add('kaleido-pop');
  }, [patternSrc]);

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#160f29]">
      <div
        ref={rotorRef}
        className="absolute inset-0 will-change-transform"
        style={{ transform: 'rotate(0deg)' }}
      >
        <div ref={popRef} className="absolute inset-0">
          {Array.from({ length: SLICE_COUNT }, (_, index) => (
            <div
              key={index}
              className="kaleido-slice"
              style={{ transform: `rotate(${index * SLICE_ANGLE}deg)` }}
            >
              {/* key 变化会重建 img，从而重新播放淡入动画 */}
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
      <div className="kaleido-vignette" />
    </div>
  );
});
