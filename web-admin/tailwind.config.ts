import type { Config } from 'tailwindcss';

export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: '#3B82F6',
          secondary: '#6366F1',
        },
        surface: {
          DEFAULT: '#0d1526',
          card: '#1a2540',
          hover: '#1e2d4a',
          border: '#2d3a55',
        },
        status: {
          green: '#22C55E',
          yellow: '#F59E0B',
          red: '#EF4444',
          blue: '#3B82F6',
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
