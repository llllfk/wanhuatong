export interface KaleidoscopePattern {
  src: string;
  /** 无障碍名称 / 提示用语 */
  label: string;
  /** 是否用户上传（可删除） */
  custom?: boolean;
}

/**
 * 预置万花筒图案：全幅密铺素材，适合 Canvas 扇形镜像取样。
 * 也可在设计页上传自己的照片；替换预置：覆盖 public/images/patterns/ 同名文件。
 */
export const BUILTIN_PATTERNS: KaleidoscopePattern[] = [
  { src: '/images/patterns/pattern-1-rainbow.svg', label: '彩虹碎钻' },
  { src: '/images/patterns/pattern-2-candy.svg', label: '糖果花园' },
  { src: '/images/patterns/pattern-3-bubbles.svg', label: '海底泡泡' },
  { src: '/images/patterns/pattern-4-sunburst.svg', label: '太阳焰火' },
  { src: '/images/patterns/pattern-5-gems.svg', label: '星空宝石' },
  { src: '/images/patterns/pattern-6-petals.svg', label: '春日花瓣' },
];

/** @deprecated 使用 BUILTIN_PATTERNS；保留别名避免旧引用炸掉 */
export const PATTERNS = BUILTIN_PATTERNS;

const MAX_EDGE = 1024;
const JPEG_QUALITY = 0.84;

/** 把上传图片压成适合万花筒取样的 JPEG DataURL */
export async function compressImageFile(
  file: File,
  labelIndex: number,
): Promise<KaleidoscopePattern> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(
      1,
      MAX_EDGE / Math.max(bitmap.width, bitmap.height),
    );
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('无法处理图片');
    ctx.fillStyle = '#0a0614';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    const src = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
    const base = file.name.replace(/\.[^.]+$/, '').trim();
    return {
      src,
      label: base || `我的图片 ${labelIndex}`,
      custom: true,
    };
  } finally {
    bitmap.close();
  }
}
