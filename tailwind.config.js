/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Warm theme custom colors
        beige: {
          50: "#FBF7F0",
          100: "#FBF6EE",
          200: "#F8F2E8",
          300: "#E9DFD0",
          400: "#E4D8C9",
          500: "#D8CDBE",
        },
        brown: {
          50: "#9A8774",
          100: "#8D7A69",
          200: "#755B4C",
          300: "#4B2B1D",
        },
        slate: {
          50: "#F5EFE5",
          100: "#E3D8C9",
          200: "#D7C9B7",
          300: "#2E527F",
          400: "#2A1A12",
        },
        primary: {
          50: "#EBF5FF",
          100: "#D7EAFF",
          200: "#B4D9FF",
          300: "#7FC1FF",
          400: "#4BA3FF",
          500: "#1E6FD4",
          600: "#0D5AC7",
          700: "#0A47A8",
          800: "#073B8A",
          900: "#051F47",
        },
      },
    },
  },
  plugins: [],
}
