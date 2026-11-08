/**
 * The whole look of the app in one place: changing a value here restyles every
 * screen. Brand colors come from Alison Medici's logo charter (v1.0, November
 * 2026). Light theme since Germain's decision of 2026-11-08 (SCRUM-46), which
 * replaces the dark theme of SCRUM-45; the charter's colour logo is made for
 * light backgrounds.
 */
export const brand = {
  /** Charter: Framboise. Main actions, with white text. */
  framboise: "#AD354E",
  /** Charter: Pêche. Decoration only, never text on the light background. */
  peche: "#EC9A62",
} as const;

export const colors = {
  /** Assumption to confirm with Alison: cream taken from the charter's cover. */
  background: "#F6EEE3",
  /** Cards and bars, lifted off the cream. */
  surface: "#FFFFFF",
  /** Outlines that identify a control: at least 3:1 against both backgrounds. */
  border: "#968079",
  /** Soft separators that carry no meaning. */
  divider: "#E7DBCF",
  foreground: "#2B1B20",
  muted: "#6B585C",
  /** Main actions. */
  accent: brand.framboise,
  accentPressed: "#8E2A40",
  onAccent: "#FFFFFF",
  /** Light tint of Framboise behind selected or highlighted items. */
  accentSoft: "#F7E3E7",
  /** Decoration: Pêche, with dark text on top when it carries text. */
  brand: brand.peche,
  onBrand: "#2B1B20",
  brandSoft: "#FBE6D6",
  /** Success and "online". */
  success: "#1F7A4D",
  /** Errors and blocked prints: always with a text and an icon. */
  danger: "#B42318",
} as const;

/** Colors of earlier themes, which must not come back. */
export const retiredColors = ["#F5A524", "#2DD4BF", "#0D0D0D", "#4ADE80"] as const;
