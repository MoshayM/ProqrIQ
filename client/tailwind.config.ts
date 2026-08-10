import type { Config } from 'tailwindcss'
import forms from '@tailwindcss/forms'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
      },
      colors: {
        navy:   { DEFAULT: '#1e2d4e', 50: '#f0f3f8', 100: '#dce4f0', 600: '#2d4170', 700: '#1e2d4e', 800: '#162240', 900: '#0f1a30' },
        brand:  { DEFAULT: '#e85c1a', 50: '#fff5f0', 100: '#ffe8d9', 500: '#e85c1a', 600: '#d04f12', 700: '#b0420e' },
        amber:  { DEFAULT: '#f59e0b' },
      },
    },
  },
  plugins: [forms],
} satisfies Config
