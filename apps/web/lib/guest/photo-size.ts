/** Provisional: the real value depends on the printer's paper (SCRUM-26). */
const MAX_SIDE_PX = 2048;

export function targetSize(width: number, height: number) {
  const scale = Math.min(1, MAX_SIDE_PX / Math.max(width, height));
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}
