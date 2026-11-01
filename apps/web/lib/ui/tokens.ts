/**
 * The whole look of the app in one place: changing a value here restyles every
 * screen, which is where the designer's work will land. Provisional values
 * from the validated direction (dark, amber actions, teal, red).
 */
export const colors = {
  background: "#0D0D0D",
  surface: "#1A1A1A",
  border: "#3A3A3A",
  foreground: "#F2F2F2",
  muted: "#B3B3B3",
  /** Main actions. */
  accent: "#F5A524",
  onAccent: "#0D0D0D",
  /** Success and "online". */
  success: "#2DD4BF",
  /** Errors and blocked prints. */
  danger: "#F87171",
} as const;
