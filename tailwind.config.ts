import type { Config } from "tailwindcss";

// Design tokens — "study desk" identity, not the generic cream/terracotta AI look.
// Palette is built around an ink-blue workspace (the chat/app chrome) with a
// warm paper cream reserved ONLY for surfaces that represent actual notebook
// pages, so the metaphor (chrome = desk, paper = page) stays legible.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#12171f", // app chrome background
          800: "#1d2530",
          700: "#28323f",
          500: "#4a5a6e",
          300: "#8ea0b3",
        },
        paper: {
          DEFAULT: "#faf6ea", // notebook page
          line: "#c9d6e0", // ruled lines
          margin: "#e3796b", // margin rule, warm coral
        },
        highlight: "#ffe066", // yellow highlighter
        accent: "#5b8cff", // interactive accent (links, active tab)
        good: "#3fb27f",
      },
      fontFamily: {
        display: ["var(--font-display)", "serif"],
        body: ["var(--font-body)", "sans-serif"],
        hand: ["var(--font-hand)", "cursive"],
        handbold: ["var(--font-hand-bold)", "cursive"],
      },
      boxShadow: {
        page: "0 1px 2px rgba(18,23,31,0.06), 0 8px 24px rgba(18,23,31,0.12)",
      },
    },
  },
  plugins: [],
};
export default config;
