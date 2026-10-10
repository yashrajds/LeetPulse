/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base: '#101216',
        panel: '#16191f',
        edge: '#262b34',
        accent: '#4f8cff',
        ok: '#3fb950',
        warn: '#d29922',
        bad: '#f85149',
      },
    },
  },
  plugins: [],
};
