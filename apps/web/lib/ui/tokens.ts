/**
 * The whole look of the app in one place: changing a value here restyles every
 * screen. Brand colors come from Alison Medici's logo charter (v1.0, November
 * 2026); the app stays dark (Germain, 2026-11-06).
 */
export const brand = {
  /** Charter: Framboise. Too dark for text on the app background. */
  framboise: "#AD354E",
  /** Charter: Pêche. */
  peche: "#EC9A62",
} as const;

export const colors = {
  background: "#0D0D0D",
  surface: "#1A1A1A",
  /** Outlines that identify a control: at least 3:1 against both backgrounds. */
  border: "#756A62",
  /** Assumption to confirm with Alison: cream taken from the charter's cover. */
  foreground: "#F6EEE3",
  muted: "#B5AAA0",
  /** Main actions, with dark text on top. */
  accent: brand.peche,
  onAccent: "#0D0D0D",
  /** Brand surfaces and decoration only, never text on the dark background. */
  brand: brand.framboise,
  onBrand: "#F6EEE3",
  /** Success and "online". */
  success: "#4ADE80",
  /** Errors and blocked prints: kept apart from Framboise on purpose. */
  danger: "#F87171",
} as const;

/** The provisional colors from SCRUM-36, which must not come back. */
export const retiredColors = ["#F5A524", "#2DD4BF"] as const;
