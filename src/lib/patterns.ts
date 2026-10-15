export interface KaleidoscopePattern {
  src: string;
  /** 无障碍名称 / 提示用语 */
  label: string;
  /** 是否用户上传（现已全部为上传图） */
  custom?: boolean;
}

/**
 * 不再使用预置图案：孩子在设计页自行上传照片。
 * public/images/patterns/ 可留作素材参考，业务默认列表为空。
 */
export const BUILTIN_PATTERNS: KaleidoscopePattern[] = [];

/** @deprecated 使用空列表；保留别名避免旧引用炸掉 */
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
