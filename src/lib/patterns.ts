export interface KaleidoscopePattern {
  src: string;
  /** 无障碍名称 / 提示用语 */
  label: string;
}

/**
 * 预置万花筒图案（占位素材，均为径向对称 SVG）。
 * 替换方式：用同名文件覆盖 public/images/patterns/ 下的文件，
 * 或在此数组中追加新的图片路径（支持 svg/png/webp/jpg）。
 */
export const PATTERNS: KaleidoscopePattern[] = [
  { src: '/images/patterns/pattern-1-rainbow.svg', label: '彩虹光环' },
  { src: '/images/patterns/pattern-2-candy.svg', label: '糖果花园' },
  { src: '/images/patterns/pattern-3-bubbles.svg', label: '海底泡泡' },
  { src: '/images/patterns/pattern-4-sunburst.svg', label: '太阳光芒' },
  { src: '/images/patterns/pattern-5-gems.svg', label: '星空宝石' },
  { src: '/images/patterns/pattern-6-petals.svg', label: '春日花瓣' },
];
