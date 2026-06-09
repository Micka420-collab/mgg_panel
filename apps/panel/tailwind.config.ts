import type { Config } from "tailwindcss";

/**
 * MGG design system — "Sci-Fi Lab" palette.
 * Premium glassy dark theme: near-black base, elevated navy surfaces,
 * electric-cyan primary, violet edge accent, GitHub-style console surface.
 */
const config: Config = {
  darkMode: "class",
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        base: "#07090F",
        ink: "#04060A",
        surface: {
          DEFAULT: "#0E131F",
          raised: "#151C2B",
          muted: "#0A0E18",
        },
        line: "rgba(255,255,255,0.07)",
        cyan: {
          DEFAULT: "#22B8D8",
          light: "#8FE3F2",
          frost: "#CAF0F8",
          deep: "#0E97BA",
        },
        violet: {
          DEFAULT: "#7C5CFF",
          light: "#B4A4FF",
        },
        online: "#34D399",
        warn: "#FBBF24",
        danger: "#F85149",
        console: {
          bg: "#0D1117",
          surface: "#161B22",
          blue: "#58A6FF",
          text: "#C9D1D9",
          dim: "#8B949E",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        display: ["var(--font-space-grotesk)", "var(--font-inter)", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.5rem",
      },
      boxShadow: {
        glass: "0 16px 40px -24px rgba(0,0,0,0.8)",
        glow: "0 10px 30px -14px rgba(34,184,216,0.4)",
        "glow-violet": "0 10px 30px -14px rgba(124,92,255,0.4)",
      },
      backgroundImage: {
        "grid-faint":
          "linear-gradient(to right, rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.025) 1px, transparent 1px)",
        "cyan-violet": "linear-gradient(135deg, #22B8D8 0%, #7C5CFF 100%)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        float: {
          "0%,100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-12px)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        pulseDot: {
          "0%,100%": { opacity: "1" },
          "50%": { opacity: "0.35" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.6s ease forwards",
        float: "float 6s ease-in-out infinite",
        shimmer: "shimmer 2s infinite",
        "pulse-dot": "pulseDot 1.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
