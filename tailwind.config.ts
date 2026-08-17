import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-geist)", "system-ui", "sans-serif"],
        heading: ["var(--font-manrope)", "system-ui", "sans-serif"],
      },
      colors: {
        background: "#0a0a12",
        foreground: "#f5f5f7",
        card: {
          DEFAULT: "#14141f",
          foreground: "#f5f5f7",
        },
        "muted-foreground": "#9090a0",
        border: "rgba(255, 255, 255, 0.09)",
        violet: {
          DEFAULT: "#8b5cf6",
          glow: "rgba(139, 92, 246, 0.25)",
        },
        cyan: {
          DEFAULT: "#22d3ee",
        },
        success: {
          DEFAULT: "#34d399",
        },
        danger: {
          DEFAULT: "#f87171",
        },
        surface: "#12161f",
        "surface-raised": "#1a202c",
        "surface-border": "#283042",
        primary: {
          DEFAULT: "#8b5cf6",
          hover: "#7c3aed",
          muted: "rgba(139, 92, 246, 0.15)",
        },
        accent: {
          DEFAULT: "#22d3ee",
          purple: "#a855f7",
          emerald: "#34d399",
          rose: "#f87171",
        },
        text: {
          primary: "#f5f5f7",
          secondary: "#9090a0",
          muted: "#6b7280",
        },
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "fade-in": "fadeIn 0.25s ease-out forwards",
        "slide-up": "slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0", transform: "scale(0.98)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
