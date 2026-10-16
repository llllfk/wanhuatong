'use client';

import { useEffect, useRef, type MutableRefObject } from 'react';

/** 手势驱动的运动参数（每帧由父组件写入，不走 React state） */
export interface KaleidoMotion {
  /** 纹理旋转角（度） */
  spin: number;
  /** 缩放 */
  zoom: number;
}

interface KaleidoscopeStageProps {
  patternSrc: string;
  motionRef: MutableRefObject<KaleidoMotion>;
}

/** 扇区数：偶数，相邻镜像 → 经典万花筒折叠对称（接近视频里的密集花纹） */
const SEGMENTS = 8;

/**
 * Canvas 万花筒（对齐视频 Demo 的画法）：
 * 从源图取一块纹理，裁成扇形后绕中心镜像铺满；
 * 手势改变的是「取样纹理」的旋转/缩放，镜面分割线不动，花纹会重组。
 */
export function KaleidoscopeStage({
  patternSrc,
  motionRef,
}: KaleidoscopeStageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const imgReadyRef = useRef(false);
  const rafRef = useRef<number | null>(null);

  // 加载图案
  useEffect(() => {
    imgReadyRef.current = false;
    const img = new Image();
    img.decoding = 'async';
    img.src = patternSrc;
    img.onload = () => {
      imgRef.current = img;
      imgReadyRef.current = true;
      const wrap = wrapRef.current;
      if (wrap) {
        wrap.classList.remove('kaleido-pop');
        void wrap.offsetWidth;
        wrap.classList.add('kaleido-pop');
      }
    };
    img.onerror = () => {
      imgReadyRef.current = false;
    };
    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [patternSrc]);

  // 持续绘制
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    let alive = true;

    const resize = (): void => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener('resize', resize);

    const slice = (Math.PI * 2) / SEGMENTS;

    const draw = (): void => {
      if (!alive) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const cx = w / 2;
      const cy = h / 2;
      // 铺满屏幕（含四角），更接近视频全屏万花筒
      const radius = Math.hypot(cx, cy) * 1.05;

      ctx.fillStyle = '#05030c';
      ctx.fillRect(0, 0, w, h);

      const img = imgRef.current;
      if (imgReadyRef.current && img && img.naturalWidth > 0) {
        const spinRad = (motionRef.current.spin * Math.PI) / 180;
        const zoom = Math.max(0.35, Math.min(2.8, motionRef.current.zoom));
        // 随旋转轻微平移取样点，花纹会「流动重组」，不像整图拧转
        const driftX = Math.cos(spinRad * 0.65) * (28 + 36 * zoom);
        const driftY = Math.sin(spinRad * 0.45) * (28 + 36 * zoom);

        const iw = img.naturalWidth;
        const ih = img.naturalHeight;
        // 取样块随 zoom 明显变大/变小，孩子才能看出「放大/缩小」
        const baseW = radius * (0.75 + zoom * 1.35);
        const baseH = (ih / iw) * baseW;

        for (let i = 0; i < SEGMENTS; i += 1) {
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(i * slice);
          if (i % 2 === 1) {
            ctx.scale(1, -1);
          }

          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.arc(0, 0, radius, -slice / 2, slice / 2, false);
          ctx.closePath();
          ctx.clip();

          // 纹理在扇形内旋转/缩放（镜子不动）；从画面中心取样，照片/密铺图效果更接近视频
          ctx.rotate(spinRad);
          ctx.drawImage(
            img,
            -baseW * 0.5 + driftX,
            -baseH * 0.5 + driftY,
            baseW,
            baseH,
          );
          ctx.restore();
        }

        // 中心柔光，增强宝石感
        const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 0.45);
        glow.addColorStop(0, 'rgba(255,255,255,0.10)');
        glow.addColorStop(0.35, 'rgba(255,200,120,0.04)');
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, w, h);
      }

      // 暗角（视频里也是中心亮、四周沉）
      const vig = ctx.createRadialGradient(
        cx,
        cy,
        radius * 0.28,
        cx,
        cy,
        radius * 0.92,
      );
      vig.addColorStop(0, 'rgba(0,0,0,0)');
      vig.addColorStop(0.65, 'rgba(5,3,12,0.15)');
      vig.addColorStop(1, 'rgba(5,3,12,0.78)');
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, w, h);

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      alive = false;
      window.removeEventListener('resize', resize);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [motionRef]);

  return (
    <div ref={wrapRef} className="kaleido-stage">
      <canvas ref={canvasRef} className="kaleido-canvas" />
      <div className="kaleido-vignette" aria-hidden />
    </div>
  );
}
