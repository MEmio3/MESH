/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/renderer/**/*.{js,jsx,ts,tsx,html}',
  ],
  theme: {
    extend: {
      colors: {
        'mesh-bg': '#09090b',
        'mesh-accent': '#3b82f6',
      },
    },
  },
  plugins: [],
}
