/**
 * The print, Polaroid style (SCRUM-65, Germain 2026-11-12): one format for v1.
 * Paper in portrait, white borders of 1 cm at the top and on the sides, the
 * photo 8 × 10 cm (4:5), and the white band below for texts later (SCRUM-60).
 *
 * The same file lives in the web app (apps/web/lib/print/layout.ts):
 * the preview on the phone and the page sent to the printer are built from
 * the same numbers. A test checks that both copies agree.
 *
 * "10 × 15" photo paper is 4 × 6 inches in practice (101.6 × 152.4 mm): the
 * photo keeps its size and its 1 cm top border, sits in the middle across
 * (side borders of 10.8 mm) and the band below gets what is left (42.4 mm).
 */

export const PRINT_LAYOUT = {
  /** 4 × 6 inches, the "10 × 15" of photo printers. */
  paperMm: { width: 101.6, height: 152.4 },
  photoMm: { width: 80, height: 100 },
  topBorderMm: 10,
  dpi: 300,
} as const;

/** Width over height of the photo on the print: 4:5. */
export const PHOTO_RATIO = PRINT_LAYOUT.photoMm.width / PRINT_LAYOUT.photoMm.height;

/** The part of a photo kept for the print, relative to its size (0 to 1). */
export interface CropZone {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** How far the zone's proportions may drift from the print's (rounding). */
export const CROP_RATIO_TOLERANCE = 0.01;

/**
 * The largest zone of the given proportions, in the middle of the photo: the
 * one rule for v1 (no manual framing). A 4:5 photo from the app's camera keeps
 * all of itself; a landscape photo loses its sides.
 */
export function centerCrop(width: number, height: number, ratio = PHOTO_RATIO): CropZone {
  if (width / height > ratio) {
    const w = (height * ratio) / width;
    return { x: (1 - w) / 2, y: 0, w, h: 1 };
  }
  const h = width / ratio / height;
  return { x: 0, y: (1 - h) / 2, w: 1, h };
}

/** Inside the photo, and with the print's proportions. */
export function isValidCrop(
  zone: CropZone,
  width: number,
  height: number,
  ratio = PHOTO_RATIO
): boolean {
  const values = [zone.x, zone.y, zone.w, zone.h, width, height];
  if (!values.every((value) => Number.isFinite(value))) return false;
  if (width <= 0 || height <= 0 || zone.w <= 0 || zone.h <= 0) return false;
  const eps = 1e-6;
  if (zone.x < -eps || zone.y < -eps) return false;
  if (zone.x + zone.w > 1 + eps || zone.y + zone.h > 1 + eps) return false;
  const actual = (zone.w * width) / (zone.h * height);
  return Math.abs(actual / ratio - 1) <= CROP_RATIO_TOLERANCE;
}

const mmToPx = (mm: number, dpi: number) => Math.round((mm / 25.4) * dpi);

/** The page in pixels, and where the photo goes on it. */
export function pageLayoutPx(dpi: number = PRINT_LAYOUT.dpi) {
  const page = {
    width: mmToPx(PRINT_LAYOUT.paperMm.width, dpi),
    height: mmToPx(PRINT_LAYOUT.paperMm.height, dpi),
  };
  const photoWidth = mmToPx(PRINT_LAYOUT.photoMm.width, dpi);
  const photoHeight = mmToPx(PRINT_LAYOUT.photoMm.height, dpi);
  return {
    page,
    photo: {
      left: Math.round((page.width - photoWidth) / 2),
      top: mmToPx(PRINT_LAYOUT.topBorderMm, dpi),
      width: photoWidth,
      height: photoHeight,
    },
  };
}

/** The same, in percent of the page: for the preview on the phone. */
export function pageLayoutPercent() {
  const { width, height } = PRINT_LAYOUT.paperMm;
  const left = (width - PRINT_LAYOUT.photoMm.width) / 2;
  return {
    pageRatio: width / height,
    photo: {
      left: (left / width) * 100,
      top: (PRINT_LAYOUT.topBorderMm / height) * 100,
      width: (PRINT_LAYOUT.photoMm.width / width) * 100,
      height: (PRINT_LAYOUT.photoMm.height / height) * 100,
    },
  };
}
