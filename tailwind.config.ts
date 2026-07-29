import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#06110D",
          elevated: "#0C1A14",
          soft: "#12251C",
        },
        atrium: {
          surface: "#F3F5F4",
          raised: "#FFFFFF",
          mist: "#E8EEEA",
        },
        jade: {
          DEFAULT: "#1ECB8F",
          deep: "#0D8F63",
          soft: "#D8F8EB",
          glow: "#5EE4B0",
        },
        bronze: {
          DEFAULT: "#C4A574",
          soft: "#F3EBD9",
        },
        danger: "#E85D4C",
        warning: "#E8A838",
      },
      fontFamily: {
        display: ["var(--font-syne)", "system-ui", "sans-serif"],
        sans: ["var(--font-outfit)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        soft: "0 1px 2px rgba(6,17,13,0.04), 0 8px 24px rgba(6,17,13,0.06)",
        lift: "0 4px 6px rgba(6,17,13,0.03), 0 20px 40px rgba(6,17,13,0.08)",
        glow: "0 0 0 1px rgba(30,203,143,0.15), 0 8px 32px rgba(30,203,143,0.18)",
        dock: "0 -8px 40px rgba(6,17,13,0.12)",
      },
      borderRadius: {
        atrium: "16px",
        "atrium-lg": "24px",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        pulseSoft: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.55" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-4px)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.45s cubic-bezier(0.22,1,0.36,1) both",
        "fade-in": "fade-in 0.3s ease both",
        shimmer: "shimmer 1.6s linear infinite",
        pulseSoft: "pulseSoft 2s ease-in-out infinite",
        float: "float 4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
export default config;
