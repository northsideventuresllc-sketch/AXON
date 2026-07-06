import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/axon-ui/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ni: {
          bg: "#07080C",
          navy: "#0A1628",
          cyan: "#00D4FF",
          "cyan-dim": "#00A8CC",
          muted: "#8B95A8",
        },
        rf: {
          bg: "#0c0814",
          surface: "#16101f",
          card: "#1f1630",
          rose: "#fb7185",
          coral: "#f97316",
          violet: "#a78bfa",
          mint: "#5eead4",
          muted: "#9d8bb8",
        },
        gb: {
          bg: "#071210",
          surface: "#0f1a17",
          card: "#142420",
          emerald: "#34d399",
          amber: "#fbbf24",
          teal: "#2dd4bf",
          muted: "#8ba89e",
        },
        axon: {
          bg: "#050b16",
          surface: "#0a1424",
          elevated: "#101e33",
          border: "#1e3a5f",
          muted: "#7a8fa8",
          text: "#e8f0fa",
          gold: "#c9a962",
          "gold-dim": "#8a7340",
          "blue-glow": "#60a5fa",
          "blue-bright": "#3b82f6",
          blue: "#2563eb",
          cyan: "#22d3ee",
          purple: "#6366f1",
          "purple-deep": "#4338ca",
          "purple-glow": "#818cf8",
          violet: "#4f46e5",
          teal: "#2dd4bf",
          danger: "#f07178",
          success: "#34d399",
        },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "Inter", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
      },
      animation: {
        "float-bubble": "floatBubble 6s ease-in-out infinite",
        "bubble-in": "bubbleIn 0.55s ease-out forwards",
        "sector3-loading": "sector3Loading 1.2s ease-in-out infinite",
        "pulse-glow": "pulseGlow 2.5s ease-in-out infinite",
        wave: "wave 1.2s ease-in-out infinite",
        "grid-pulse": "grid-pulse 8s ease-in-out infinite",
        float: "float 6s ease-in-out infinite",
        "float-slow": "float-slow 8s ease-in-out infinite",
        "scan-line": "scan-line 8s linear infinite",
        shimmer: "shimmer 3s ease-in-out infinite",
        orbit: "orbit 24s linear infinite",
        "orbit-reverse": "orbit-reverse 32s linear infinite",
        "orbit-slow": "orbit-slow 40s linear infinite",
        "logo-reveal": "logoReveal 1.4s ease-out forwards",
        "marquee-scroll": "marquee-scroll 45s linear infinite",
      },
      keyframes: {
        floatBubble: {
          "0%, 100%": { transform: "translateY(0) rotate(0deg)" },
          "50%": { transform: "translateY(-12px) rotate(2deg)" },
        },
        bubbleIn: {
          "0%": {
            opacity: "0",
            transform: "translate(14px, 18px) scale(0.97) rotate(1.5deg)",
          },
          "100%": {
            opacity: "1",
            transform: "translate(0, 0) scale(1) rotate(0deg)",
          },
        },
        sector3Loading: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(400%)" },
        },
        pulseGlow: {
          "0%, 100%": { opacity: "0.5", transform: "scale(1)" },
          "50%": { opacity: "1", transform: "scale(1.05)" },
        },
        wave: {
          "0%, 100%": { transform: "scaleY(0.4)" },
          "50%": { transform: "scaleY(1)" },
        },
        "grid-pulse": {
          "0%, 100%": { opacity: "0.15" },
          "50%": { opacity: "0.35" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-8px)" },
        },
        "float-slow": {
          "0%, 100%": { transform: "translateY(0) translateZ(0)" },
          "50%": { transform: "translateY(-12px) translateZ(20px)" },
        },
        "scan-line": {
          "0%": { transform: "translateY(-100vh)", opacity: "0" },
          "10%": { opacity: "1" },
          "90%": { opacity: "1" },
          "100%": { transform: "translateY(100vh)", opacity: "0" },
        },
        shimmer: {
          "0%, 100%": { opacity: "0.5" },
          "50%": { opacity: "1" },
        },
        orbit: {
          "0%": { transform: "rotate(0deg) scale(1)" },
          "50%": { transform: "rotate(180deg) scale(1.02)" },
          "100%": { transform: "rotate(360deg) scale(1)" },
        },
        "orbit-reverse": {
          "0%": { transform: "rotate(360deg)" },
          "100%": { transform: "rotate(0deg)" },
        },
        "orbit-slow": {
          "0%": { transform: "rotate(0deg) translateZ(0)" },
          "100%": { transform: "rotate(360deg) translateZ(10px)" },
        },
        logoReveal: {
          "0%": { filter: "brightness(0.3) blur(6px)", opacity: "0.4" },
          "40%": { filter: "brightness(1.2) blur(0px)", opacity: "1" },
          "100%": { filter: "brightness(1) blur(0px)", opacity: "1" },
        },
        "marquee-scroll": {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
      },
      boxShadow: {
        "rf-glow": "0 0 40px rgba(251, 113, 133, 0.25)",
        "rf-violet": "0 0 50px rgba(167, 139, 250, 0.2)",
        "gb-glow": "0 0 40px rgba(52, 211, 153, 0.25)",
        "gb-amber": "0 0 50px rgba(251, 191, 36, 0.2)",
        glow: "0 0 40px rgba(0, 212, 255, 0.15)",
        "glow-sm": "0 0 20px rgba(0, 212, 255, 0.2)",
        "glow-lg": "0 0 80px rgba(0, 212, 255, 0.25)",
        "3d-inset": "inset 0 1px 0 rgba(0, 212, 255, 0.15), inset 0 -1px 0 rgba(0, 0, 0, 0.3)",
      },
      perspective: {
        DEFAULT: "1000px",
        near: "600px",
        far: "2000px",
      },
    },
  },
  plugins: [],
};

export default config;
