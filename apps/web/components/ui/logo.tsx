/**
 * The Spot Memories logo, colour versions: the app background is light
 * (charter by Alison Medici, "Sur quel fond ?"; light theme since SCRUM-46).
 *
 * The charter's rules live here so no screen can break them: proportions come
 * from the files, never from CSS; a protection zone surrounds the logo; below
 * its minimum size a version falls back to the simpler one.
 */

export const LOGO_NAME = "The Spot Memories";

type Variant = "full" | "short" | "icon";

// Designer files: the full and short logos share a 805.5 x 586.8 canvas, with
// 40 units of margin on each side already drawn in.
const CANVAS = { width: 805.5, height: 586.8, margin: 40 };
// Protection zone = height of the "e" of "The", about 56 units in the files.
const PROTECTION = 56;

const files: Record<Variant, string> = {
  full: "/brand/logo-complet-couleur.svg",
  short: "/brand/logo-court-couleur.svg",
  icon: "/brand/icone-couleur.svg",
};

/** Charter minimum sizes on screen, measured on the drawing itself. */
export const MIN_VISIBLE_WIDTH: Record<Variant, number> = {
  full: 200,
  short: 120,
  icon: 16,
};

/** Width of the drawing itself, without the margin drawn in the file. */
export function visibleWidth(variant: Variant, width: number) {
  if (variant === "icon") return width;
  return (width * (CANVAS.width - 2 * CANVAS.margin)) / CANVAS.width;
}

/** The asked version, or a simpler one when it would be too small to read. */
export function fittingVariant(variant: Variant, width: number): Variant {
  if (variant === "full" && visibleWidth("full", width) < MIN_VISIBLE_WIDTH.full)
    return fittingVariant("short", width);
  if (variant === "short" && visibleWidth("short", width) < MIN_VISIBLE_WIDTH.short)
    return "icon";
  return variant;
}

interface Props {
  variant?: Variant;
  /** Rendered width of the file, in CSS pixels. */
  width: number;
  className?: string;
}

export function Logo({ variant = "full", width, className = "" }: Props) {
  const used = fittingVariant(variant, width);
  const height =
    used === "icon" ? width : Math.round((width * CANVAS.height) / CANVAS.width);
  // The files carry 40 units of margin; the charter asks for about 56.
  const extra =
    used === "icon"
      ? Math.round(width * 0.25)
      : Math.round((width * (PROTECTION - CANVAS.margin)) / CANVAS.width);

  return (
    <span
      data-testid="logo"
      data-variant={used}
      className={`inline-block shrink-0 ${className}`}
      style={{ padding: extra }}
    >
      {/* A static vector file: an image optimizer would add nothing. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={files[used]}
        alt={LOGO_NAME}
        width={width}
        height={height}
        className="block max-w-none"
        style={{ width, height }}
      />
    </span>
  );
}
