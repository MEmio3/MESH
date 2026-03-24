/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/renderer/**/*.{js,jsx,ts,tsx,html}',
  ],
  theme: {
    extend: {
      colors: {
        'mesh-bg': '#09090b',
        'mesh-accent': '#107C10',
      },
    },
  },
  plugins: [],
}
