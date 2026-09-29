/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      // max-md will target widths through 760px instead of Tailwind's default 767px.
      screens: {
        md: '761px',
      },
      fontFamily: {
        sans: ['Geist', 'sans-serif'],
        display: ['Special Elite', 'serif'],
      },
      colors: {
        momento: {
          dark: '#0a0a0a',
          text: '#1a1a1a',
          muted: '#767676',
          prompt: '#905831',
        },
      },
      opacity: {
        55: '.55',
      },
    },
  },
  plugins: [],
};
