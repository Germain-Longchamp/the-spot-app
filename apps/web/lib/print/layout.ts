/**
 * The print, Polaroid style (SCRUM-65, Germain 2026-11-12): one format for v1.
 * Paper in portrait, the photo 88 × 110 mm (4:5) with the same white border at
 * the top and on the sides (6.8 mm, SCRUM-66, Germain 2026-11-13), and the
 * white band below for texts (SCRUM-60).
 *
 * The same file lives in the print agent (apps/print-agent/src/layout.ts):
 * the preview on the phone and the page sent to the printer are built from
 * the same numbers. A test checks that both copies agree.
 *
 * "10 × 15" photo paper is 4 × 6 inches in practice (101.6 × 152.4 mm): the
 * photo sits in the middle across (side borders of 6.8 mm), as far from the
 * top, and the band below gets what is left (35.6 mm). No border under 6 mm:
 * a paper shifted by a millimetre would show uneven borders.
 */

export const PRINT_LAYOUT = {
  /** 4 × 6 inches, the "10 × 15" of photo printers. */
  paperMm: { width: 101.6, height: 152.4 },
  photoMm: { width: 88, height: 110 },
  topBorderMm: 6.8,
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

/**
 * The band below the photo (SCRUM-60): Alison's mockup (2-personnaliser-cadre,
 * 2026-11-11), a print 248 px wide, scaled to the paper. Line 1 in raspberry,
 * bold; line 2, optional, smaller, grey, in spaced capitals; the The Spot icon
 * on the right. The text starts on the photo's left edge, the icon ends on
 * its right edge, the whole vertically centred in the band. Inter, embedded
 * in the agent.
 */
const MOCKUP_MM_PER_PX = PRINT_LAYOUT.paperMm.width / 248;

export interface BandLineStyle {
  sizeMm: number;
  /** Long texts shrink down to this size, then end with "…". */
  minSizeMm: number;
  color: string;
  bold: boolean;
  letterSpacingEm: number;
  uppercase: boolean;
}

export const BAND = {
  line1: {
    sizeMm: 16 * MOCKUP_MM_PER_PX,
    minSizeMm: 11 * MOCKUP_MM_PER_PX,
    color: "#AD354E",
    bold: true,
    letterSpacingEm: 0,
    uppercase: false,
  } satisfies BandLineStyle,
  line2: {
    sizeMm: 10.5 * MOCKUP_MM_PER_PX,
    minSizeMm: 8.5 * MOCKUP_MM_PER_PX,
    color: "#5A474B",
    bold: false,
    letterSpacingEm: 0.08,
    uppercase: true,
  } satisfies BandLineStyle,
  /** Between the two lines. */
  lineGapMm: 4 * MOCKUP_MM_PER_PX,
  iconMm: 22 * MOCKUP_MM_PER_PX,
  /** Between the text and the icon. */
  iconGapMm: 8 * MOCKUP_MM_PER_PX,
  /** Inter's own line height (ascender + descender), so that the browser and the agent agree. */
  lineHeight: 1.21,
  /** Inter's ascender, in em: from the top of a line to its baseline. */
  ascender: 0.96875,
} as const;

export interface FrameText {
  line1: string;
  line2?: string | null;
}

/**
 * What can be printed of a line: no control characters, no emojis (unsure on
 * the printer, and the brand has none), spaces tidied.
 */
// Built from strings: the web app's TypeScript target predates the "u" flag.
const CONTROL = new RegExp("[\\p{Cc}\\p{Cf}]", "gu");
const EMOJI = new RegExp("[\\p{Extended_Pictographic}\\u{1F1E6}-\\u{1F1FF}\\u{FE0F}\\u{20E3}]", "gu");

export function cleanLine(text: string | null | undefined, style: BandLineStyle): string {
  const clean = (text ?? "")
    .replace(CONTROL, "")
    .replace(EMOJI, "")
    .replace(/\s+/g, " ")
    .trim();
  return style.uppercase ? clean.toLocaleUpperCase("fr-FR") : clean;
}

/** Room for the text: the photo's width, less the icon and its gap. */
export function bandTextWidthMm(): number {
  return PRINT_LAYOUT.photoMm.width - BAND.iconMm - BAND.iconGapMm;
}

/**
 * The size of a line, and its text: as in the mockup if it fits, smaller if
 * not (down to the style's minimum), then cut with "…". `measureEm` gives the
 * width of a text at a size of 1, letter spacing included: the browser and the
 * agent each measure with Inter, the rule is the same.
 */
export function fitLine(
  text: string,
  style: BandLineStyle,
  maxWidthMm: number,
  measureEm: (text: string) => number
): { text: string; sizeMm: number } {
  if (!text) return { text: "", sizeMm: style.sizeMm };
  const em = measureEm(text);
  if (em * style.sizeMm <= maxWidthMm) return { text, sizeMm: style.sizeMm };
  const sizeMm = Math.max(style.minSizeMm, maxWidthMm / em);
  if (em * sizeMm <= maxWidthMm + 1e-6) return { text, sizeMm };
  const chars = Array.from(text);
  for (let n = chars.length - 1; n > 0; n--) {
    const cut = chars.slice(0, n).join("").trimEnd() + "…";
    if (measureEm(cut) * sizeMm <= maxWidthMm) return { text: cut, sizeMm };
  }
  return { text: "…", sizeMm };
}
