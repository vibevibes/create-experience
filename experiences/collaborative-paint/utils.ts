export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.substring(0, 2), 16) || 0,
    g: parseInt(h.substring(2, 4), 16) || 0,
    b: parseInt(h.substring(4, 6), 16) || 0,
  };
}

/**
 * Paint a filled circle with soft edges onto an RGBA pixel buffer.
 */
export function paintCircle(
  pixels: Uint8ClampedArray,
  W: number,
  H: number,
  cx: number,
  cy: number,
  radius: number,
  color: { r: number; g: number; b: number },
  pressure: number,
) {
  const r2 = radius * radius;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      const px = cx + dx;
      const py = cy + dy;
      if (px < 0 || px >= W || py < 0 || py >= H) continue;

      const idx = (py * W + px) * 4;
      const dist = Math.sqrt(d2) / radius;
      const alpha = Math.max(0, 1 - dist) * pressure;
      pixels[idx] = Math.round(pixels[idx] * (1 - alpha) + color.r * alpha);
      pixels[idx + 1] = Math.round(pixels[idx + 1] * (1 - alpha) + color.g * alpha);
      pixels[idx + 2] = Math.round(pixels[idx + 2] * (1 - alpha) + color.b * alpha);
      pixels[idx + 3] = 255;
    }
  }
}

/**
 * Rasterize a thick line between two points by stamping circles along it.
 */
export function paintLine(
  pixels: Uint8ClampedArray,
  W: number,
  H: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  radius: number,
  color: { r: number; g: number; b: number },
  pressure: number,
) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dist = Math.sqrt(dx * dx + dy * dy);
  // Stamp circles every ~1px along the line
  const steps = Math.max(1, Math.ceil(dist));
  for (let i = 0; i <= steps; i++) {
    const t = steps === 0 ? 0 : i / steps;
    const cx = Math.round(x0 + dx * t);
    const cy = Math.round(y0 + dy * t);
    paintCircle(pixels, W, H, cx, cy, radius, color, pressure);
  }
}

export function createBlankPixels(
  w: number,
  h: number,
  bgColor: string,
): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(w * h * 4);
  const bg = hexToRgb(bgColor);
  for (let i = 0; i < w * h; i++) {
    pixels[i * 4] = bg.r;
    pixels[i * 4 + 1] = bg.g;
    pixels[i * 4 + 2] = bg.b;
    pixels[i * 4 + 3] = 255;
  }
  return pixels;
}
