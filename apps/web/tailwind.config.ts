import type { Config } from "tailwindcss";
import { colors } from "./lib/ui/tokens";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      colors: {
        background: colors.background,
        surface: colors.surface,
        border: colors.border,
        divider: colors.divider,
        foreground: colors.foreground,
        muted: colors.muted,
        accent: colors.accent,
        "accent-pressed": colors.accentPressed,
        "on-accent": colors.onAccent,
        "accent-soft": colors.accentSoft,
        brand: colors.brand,
        "on-brand": colors.onBrand,
        "brand-soft": colors.brandSoft,
        success: colors.success,
        danger: colors.danger,
      },
      boxShadow: {
        card: "0 1px 2px rgb(43 27 32 / 0.06), 0 4px 16px rgb(43 27 32 / 0.06)",
        lift: "0 8px 24px rgb(43 27 32 / 0.12)",
        bar: "0 -4px 16px rgb(43 27 32 / 0.08)",
      },
      keyframes: {
        "screen-in": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "pop-in": {
          "0%": { opacity: "0", transform: "scale(0.6)" },
          "70%": { opacity: "1", transform: "scale(1.08)" },
          "100%": { transform: "scale(1)" },
        },
        "draw-check": { to: { strokeDashoffset: "0" } },
        flash: { from: { opacity: "0.9" }, to: { opacity: "0" } },
        "soft-pulse": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.45" },
        },
      },
      animation: {
        "screen-in": "screen-in 320ms cubic-bezier(0.2, 0.8, 0.2, 1) both",
        "pop-in": "pop-in 420ms cubic-bezier(0.2, 0.8, 0.2, 1) both",
        "draw-check": "draw-check 360ms 260ms ease-out forwards",
        flash: "flash 280ms ease-out forwards",
        "soft-pulse": "soft-pulse 1.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
export default config;
