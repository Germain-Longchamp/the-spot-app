/** Provisional: the real value depends on the printer's paper (SCRUM-26). */
const MAX_SIDE_PX = 2048;

/** Gallery thumbnails: sharp in a three-column grid, light on a salon network. */
export const THUMB_SIDE_PX = 480;

export function targetSize(width: number, height: number, maxSide = MAX_SIDE_PX) {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}
