import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: "#021024", light: "#052659" },
        ice: "#C1E8FF",
      },
    },
  },
  plugins: [],
};
export default config;
