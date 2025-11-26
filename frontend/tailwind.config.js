/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0b1220",
        glass: "#0f172a",
      },
      fontFamily: {
        sans: ["Inter", "Geist", "IBM Plex Sans", "system-ui", "sans-serif"],
        display: ["Space Grotesk", "Inter", "Geist", "IBM Plex Sans", "system-ui", "sans-serif"],
      },
      boxShadow: {
        soft: "0 18px 60px -32px rgba(15, 23, 42, 0.9), 0 2px 20px -12px rgba(16, 185, 129, 0.35)",
      },
    },
  },
  plugins: [],
};
