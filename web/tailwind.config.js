/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Fraunces"', 'ui-serif', 'Georgia', 'serif'],
        sans: ['"Inter Tight"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        // navy backgrounds, three depths plus an inset for inputs
        ink: {
          900: '#06080f',
          800: '#0a0e1a',
          700: '#0f1320',
          600: '#161b2c',
          500: '#1f2538',
          400: '#2a3148',
          300: '#3a425e',
        },
        // warm amber primary + teal secondary; status colours kept emerald/rose
        accent: {
          DEFAULT: '#f5b042',
          soft: '#fbc878',
          deep: '#c98a2a',
        },
        teal: {
          DEFAULT: '#4fb3a9',
          deep: '#2d756f',
        },
        paper: '#f5efe4', // near-white used sparingly on the hero
      },
      letterSpacing: {
        widest: '0.2em',
      },
      boxShadow: {
        amber: '0 8px 32px -10px rgba(245,176,66,0.35)',
        card: '0 1px 0 0 rgba(255,255,255,0.04) inset, 0 18px 40px -24px rgba(0,0,0,0.6)',
      },
    },
  },
  plugins: [],
};
