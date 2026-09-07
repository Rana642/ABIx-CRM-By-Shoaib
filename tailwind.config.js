/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}', './components/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        paper: '#efeee7',
        ink: '#211d18',
        inksoft: '#57503f',
        surface: '#e4e1d6',
        brass: '#a97a2f',
        brassink: '#5c4517',
        ok: '#3f6b4a',
        okbg: '#dbe6dc',
        warn: '#a9502a',
        warnbg: '#ecdccc',
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'sans-serif'],
        serif: ['"IBM Plex Serif"', 'serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
};
