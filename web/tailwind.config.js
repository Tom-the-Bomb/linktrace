/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Geist', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"Geist Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        // near-white ground inside a frame of hairlines
        canvas: '#fafafa',
        panel: '#ffffff',
        sunken: '#f5f5f5',
        line: {
          DEFAULT: '#eaeaea',
          strong: '#d4d4d4',
        },
        ink: {
          DEFAULT: '#171717',
          2: '#4d4d4d',
          3: '#666666', // muted; >=4.5:1 on canvas and panel
          4: '#a1a1a1', // decorative only, never text
        },
        // links and focus; 600 carries white text
        accent: {
          50: '#f0f6ff',
          100: '#d9e8ff',
          500: '#3b8cff',
          600: '#0068d6',
          700: '#0054ad',
        },
        ok: { bg: '#e9f8ee', fg: '#107d3e', dot: '#2bb35e' },
        warn: { bg: '#fff4d6', fg: '#8a5300', dot: '#f5a623' },
        bad: { bg: '#ffebee', fg: '#c50f1f', dot: '#e5484d' },
      },
      borderRadius: {
        panel: '12px',
        control: '6px',
      },
      boxShadow: {
        // floating surfaces only (menus, drawer, dialog); everything else is a hairline
        lift: '0 0 0 1px rgba(0,0,0,0.08), 0 4px 8px rgba(0,0,0,0.04), 0 16px 40px -12px rgba(0,0,0,0.16)',
        control: '0 0 0 1px #eaeaea',
        key: '0 0 0 1px #d4d4d4, 0 1px 0 #d4d4d4',
      },
      letterSpacing: {
        display: '-0.05em',
      },
      keyframes: {
        'row-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'none' },
        },
        tick: {
          from: { transform: 'translateY(35%)', opacity: '0.35' },
          to: { transform: 'none', opacity: '1' },
        },
      },
      animation: {
        'row-in': 'row-in 360ms cubic-bezier(0.16, 1, 0.3, 1) both',
        tick: 'tick 360ms cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
};
