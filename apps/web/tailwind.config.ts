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
      colors: {
        background: colors.background,
        surface: colors.surface,
        border: colors.border,
        foreground: colors.foreground,
        muted: colors.muted,
        accent: colors.accent,
        "on-accent": colors.onAccent,
        success: colors.success,
        danger: colors.danger,
      },
    },
  },
  plugins: [],
};
export default config;
