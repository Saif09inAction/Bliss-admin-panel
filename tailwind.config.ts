import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        bliss: {
          black: "#0a0a0a",
          dark: "#121417",
          lime: "#c8ff00",
          gold: "#d4af37",
          cream: "#fafaf8",
        },
      },
    },
  },
  plugins: [],
};
export default config;
