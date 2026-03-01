/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}', './components/**/*.{js,ts,jsx,tsx,mdx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: '#0a0a0a',
        panel: '#111111',
        card: '#1a1a1a',
        border: '#2a2a2a',
        muted: '#666666',
        accent: '#6366f1',
      },
    },
  },
  plugins: [],
};
