/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      colors: {
        kamisah: { bg: '#070914', panel: '#101426', line: '#222a40', purple: '#743cff', blue: '#236bff' },
        terminal: '#00FF41'
      }
    }
  },
  plugins: []
}