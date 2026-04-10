import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: '#2EF2A3',
          muted: '#1FBD7E',
          ink: '#053A24',
        },
        paper: {
          light: '#FAFAF7',
          dark: '#0B0D0C',
        },
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Inter', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
        display: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        stamp: '0 2px 0 0 rgba(0,0,0,0.08), 0 0 0 2px #2EF2A3',
      },
      keyframes: {
        stampIn: {
          '0%': { transform: 'scale(0.6) rotate(-12deg)', opacity: '0' },
          '60%': { transform: 'scale(1.15) rotate(-8deg)', opacity: '1' },
          '100%': { transform: 'scale(1) rotate(-6deg)', opacity: '1' },
        },
      },
      animation: {
        stampIn: 'stampIn 260ms cubic-bezier(0.2,0.9,0.3,1.2)',
      },
    },
  },
  plugins: [],
};
export default config;
