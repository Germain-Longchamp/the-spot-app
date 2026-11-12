import { createRequire } from "module";
import path from "path";
import type SharpType from "../../../print-agent/node_modules/sharp";

// sharp is the print agent's dependency (SCRUM-65): the tests borrow it to
// draw test photos and read the pages the agent builds. CI installs the
// agent's packages before the web tests.
const fromAgent = createRequire(path.resolve(__dirname, "../../../print-agent/package.json"));
export const sharp = fromAgent("sharp") as typeof SharpType;

export type Rgb = [number, number, number];

/** A PNG made of vertical stripes, left to right, of equal width. */
export async function stripes(width: number, height: number, colors: Rgb[]): Promise<Buffer> {
  const data = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = colors[Math.min(colors.length - 1, Math.floor((x * colors.length) / width))];
      const i = (y * width + x) * 3;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
    }
  }
  return sharp(data, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

/** A PNG of one colour. */
export const plain = (width: number, height: number, color: Rgb) => stripes(width, height, [color]);

/** The colour of one pixel, and the image's size. */
export async function inspect(image: Buffer) {
  const { data, info } = await sharp(image).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return {
    width: info.width,
    height: info.height,
    at(x: number, y: number): Rgb {
      const i = (Math.round(y) * info.width + Math.round(x)) * info.channels;
      return [data[i], data[i + 1], data[i + 2]];
    },
  };
}

/** Close enough to a colour, after JPEG. */
export function near(actual: Rgb, expected: Rgb, tolerance = 30): boolean {
  return actual.every((value, i) => Math.abs(value - expected[i]) <= tolerance);
}
