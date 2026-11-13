import sharp from "sharp";
import { bandLayers } from "./band";
import { centerCrop, CropZone, FrameText, pageLayoutPx, PRINT_LAYOUT } from "./layout";

export interface ComposeOptions {
  /** The zone chosen on the phone; null for photos sent before SCRUM-65. */
  crop: CropZone | null;
  /** The texts of the band below the photo (SCRUM-60); null: band left white. */
  frame?: FrameText | null;
  /** Some drivers take the page lying down: turned a quarter, same print. */
  landscape?: boolean;
  dpi?: number;
}

/** The composition failed: the job goes to the team, never printed bare. */
export class CompositionError extends Error {}

const WHITE = { r: 255, g: 255, b: 255 };

/**
 * The page sent to the printer (SCRUM-65): the zone of the photo kept on the
 * phone, cut out and set on white paper with the Polaroid borders, the texts
 * and the icon in the band below (SCRUM-60).
 */
export async function composePage(image: Buffer, options: ComposeOptions): Promise<Buffer> {
  const dpi = options.dpi ?? PRINT_LAYOUT.dpi;
  const { page, photo } = pageLayoutPx(dpi);
  try {
    // Upright first: the zone was chosen on the photo as the phone showed it.
    const upright = await sharp(image).rotate().toBuffer({ resolveWithObject: true });
    const { width, height } = upright.info;
    const zone = options.crop ?? centerCrop(width, height);

    const left = Math.min(width - 1, Math.max(0, Math.round(zone.x * width)));
    const top = Math.min(height - 1, Math.max(0, Math.round(zone.y * height)));
    const cut = {
      left,
      top,
      width: Math.max(1, Math.min(width - left, Math.round(zone.w * width))),
      height: Math.max(1, Math.min(height - top, Math.round(zone.h * height))),
    };

    const picture = await sharp(upright.data)
      .extract(cut)
      // The zone has the photo's proportions already: "cover" only absorbs
      // the rounding of a pixel or two.
      .resize(photo.width, photo.height, { fit: "cover" })
      .toBuffer();

    let result = sharp({
      create: { width: page.width, height: page.height, channels: 3, background: WHITE },
    }).composite([
      { input: picture, left: photo.left, top: photo.top },
      ...(options.frame ? await bandLayers(options.frame, dpi) : []),
    ]);

    if (options.landscape) {
      result = sharp(await result.png().toBuffer()).rotate(90);
    }
    return await result.jpeg({ quality: 95 }).withMetadata({ density: dpi }).toBuffer();
  } catch (error) {
    throw new CompositionError(
      error instanceof Error ? error.message : "mise en page impossible"
    );
  }
}
