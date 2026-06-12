import type { Config } from 'tailwindcss';

export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter Variable', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          primary:   '#6366F1',   // indigo — primary action color (CTAs, active states)
          accent:    '#3B82F6',   // blue — informational, links, secondary badges
          purple:    '#6366F1',   // alias for brand.primary (explicit for .text-brand-purple)
          whatsapp:  '#25D366',   // WhatsApp green — only used for WA-specific UI
        },
        surface: {
          DEFAULT:   '#0d1526',   // page background
          deep:      '#080d1a',   // sidebar, deepest surfaces
          card:      '#1a2540',   // cards, modals
          hover:     '#1e2d4a',   // hover states, inputs
          border:    '#2d3a55',   // all borders and separators
        },
        status: {
          green:  '#16A34A',   // paid / al día (deeper than pure green — more trustworthy)
          yellow: '#F59E0B',   // pending / próximo a vencer
          red:    '#DC2626',   // overdue / moroso (deeper red — financial severity)
          info:   '#3B82F6',   // informational blue (same as brand.accent)
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
