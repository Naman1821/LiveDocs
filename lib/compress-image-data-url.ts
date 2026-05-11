/** Import pipeline: keep JPEG data URLs small enough for Convex ~1 MiB doc fields. */
const IMPORT_MAX_IMAGE_DATA_URL_CHARS = 520_000;

function scaleToMaxSide(
  width: number,
  height: number,
  maxSide: number,
): [number, number] {
  if (width <= maxSide && height <= maxSide) return [width, height];
  if (width >= height) {
    return [maxSide, Math.max(1, Math.round((height * maxSide) / width))];
  }
  return [Math.max(1, Math.round((width * maxSide) / height)), maxSide];
}

/**
 * Shrinks large `data:` image URLs so Mammoth imports fit Convex storage.
 */
export async function compressDataUrlIfLarge(dataUrl: string): Promise<string> {
  if (!dataUrl.startsWith("data:")) return dataUrl;
  if (dataUrl.length <= IMPORT_MAX_IMAGE_DATA_URL_CHARS) return dataUrl;

  try {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const bitmap = await createImageBitmap(blob);
    try {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return dataUrl;

      for (const maxSide of [1600, 1280, 960, 720, 560, 448, 360]) {
        const [w, h] = scaleToMaxSide(bitmap.width, bitmap.height, maxSide);
        canvas.width = w;
        canvas.height = h;
        ctx.drawImage(bitmap, 0, 0, w, h);
        for (let q = 0.88; q >= 0.42; q -= 0.05) {
          const out = canvas.toDataURL("image/jpeg", q);
          if (out.length <= IMPORT_MAX_IMAGE_DATA_URL_CHARS) return out;
        }
      }
      for (const maxSide of [280, 220, 180, 140]) {
        const [w, h] = scaleToMaxSide(bitmap.width, bitmap.height, maxSide);
        canvas.width = w;
        canvas.height = h;
        ctx.drawImage(bitmap, 0, 0, w, h);
        const out = canvas.toDataURL("image/jpeg", 0.32);
        if (out.length <= IMPORT_MAX_IMAGE_DATA_URL_CHARS) return out;
      }
      return canvas.toDataURL("image/jpeg", 0.28);
    } finally {
      bitmap.close();
    }
  } catch {
    return dataUrl;
  }
}
