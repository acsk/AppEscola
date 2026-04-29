/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./App.{js,jsx,ts,tsx}",
    "./screens/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        primary: "#7C3AED",
        "primary-light": "#EDE9FE",
        accent: "#FBBF24",
        surface: "#EEEEFF",
      },
    },
  },
  plugins: [],
};
