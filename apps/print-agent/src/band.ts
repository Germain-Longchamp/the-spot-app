import { readFileSync } from "node:fs";
import { join } from "node:path";
import opentype from "opentype.js";
import sharp from "sharp";
import {
  BAND,
  BandLineStyle,
  bandTextWidthMm,
  cleanLine,
  fitLine,
  FrameText,
  pageLayoutPx,
} from "./layout";

/**
 * The texts and the icon in the band below the photo (SCRUM-60). Letters are
 * drawn as shapes from Inter's files (opentype.js): the print never depends on
 * the fonts installed on the salon computer.
 */

const ASSETS = join(__dirname, "..", "assets");

let fonts: { bold: opentype.Font; regular: opentype.Font } | null = null;
function loadFonts() {
  fonts ??= {
    bold: opentype.loadSync(join(ASSETS, "fonts", "Inter-Bold.ttf")),
    regular: opentype.loadSync(join(ASSETS, "fonts", "Inter-Regular.ttf")),
  };
  return fonts;
}

let icon: Buffer | null = null;
function loadIcon() {
  icon ??= readFileSync(join(ASSETS, "icone-couleur.svg"));
  return icon;
}

const fontOf = (style: BandLineStyle) => (style.bold ? loadFonts().bold : loadFonts().regular);

/** Width of a text at a size of 1, letter spacing included. */
export function measureEm(text: string, style: BandLineStyle): number {
  return fontOf(style).getAdvanceWidth(text, 1, {
    kerning: true,
    letterSpacing: style.letterSpacingEm,
  });
}

/** Hex digits only: the colours are ours, but they go into SVG markup. */
const hex = (value: string) => value.replace(/[^0-9A-Fa-f]/g, "");

interface Laid {
  text: string;
  sizeMm: number;
  style: BandLineStyle;
}

/** The lines as they will be printed, fitted to the room. */
export function layBand(frame: FrameText): Laid[] {
  const maxWidth = bandTextWidthMm();
  return [
    { raw: frame.line1, style: BAND.line1 },
    { raw: frame.line2, style: BAND.line2 },
  ]
    .map(({ raw, style }) => {
      const text = cleanLine(raw, style);
      return { ...fitLine(text, style, maxWidth, (t) => measureEm(t, style)), style };
    })
    .filter((line) => line.text.length > 0);
}

/**
 * The layers to set on the page: the text (one SVG of shapes) and the icon,
 * placed in pixels at the page's resolution.
 */
export async function bandLayers(frame: FrameText, dpi: number): Promise<sharp.OverlayOptions[]> {
  const { page, photo } = pageLayoutPx(dpi);
  const px = (mm: number) => (mm / 25.4) * dpi;
  const bandTop = photo.top + photo.height;
  const bandHeight = page.height - bandTop;

  const layers: sharp.OverlayOptions[] = [];
  const iconSize = Math.round(px(BAND.iconMm));
  layers.push({
    input: await sharp(loadIcon(), { density: 300 }).resize(iconSize, iconSize).png().toBuffer(),
    left: photo.left + photo.width - iconSize,
    top: Math.round(bandTop + (bandHeight - iconSize) / 2),
  });

  const lines = layBand(frame);
  if (lines.length === 0) return layers;

  const heights = lines.map((line) => px(line.sizeMm) * BAND.lineHeight);
  const block = heights.reduce((a, b) => a + b, 0) + px(BAND.lineGapMm) * (lines.length - 1);
  let top = bandTop + (bandHeight - block) / 2;

  const paths = lines.map((line, i) => {
    const size = px(line.sizeMm);
    const baseline = top + size * BAND.ascender;
    top += heights[i] + px(BAND.lineGapMm);
    const d = fontOf(line.style)
      .getPath(line.text, 0, baseline, size, { kerning: true, letterSpacing: line.style.letterSpacingEm })
      .toPathData(2);
    return `<path d="${d}" fill="#${hex(line.style.color)}"/>`;
  });

  // Only the band: drawn at the photo's left edge.
  const width = Math.ceil(px(bandTextWidthMm())) + 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${page.height}"><g>${paths.join("")}</g></svg>`;
  layers.push({ input: Buffer.from(svg), left: photo.left, top: 0 });
  return layers;
}
