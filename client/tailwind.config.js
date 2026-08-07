import forms from '@tailwindcss/forms'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      colors: {
        navy: {
          DEFAULT: '#1e2d4e',
          50:  '#f0f3f8',
          100: '#dce4f0',
          200: '#b8c8e0',
          300: '#8aa5c8',
          400: '#5c82af',
          500: '#3a6396',
          600: '#2d4170',
          700: '#1e2d4e',
          800: '#162240',
          900: '#0f1a30',
          950: '#080e1e',
        },
        brand: {
          DEFAULT: '#e85c1a',
          50:  '#fff5f0',
          100: '#ffe8d9',
          200: '#ffc9a8',
          300: '#ffa070',
          400: '#ff7540',
          500: '#e85c1a',
          600: '#d04f12',
          700: '#b0420e',
          800: '#8a320a',
          900: '#642206',
        },
        surface: {
          1: '#ffffff',
          2: '#f8f9fb',
          3: '#f1f3f7',
          4: '#e8ebf2',
        },
      },
      borderRadius: {
        sm:   '6px',
        DEFAULT: '8px',
        md:   '10px',
        lg:   '14px',
        xl:   '20px',
        '2xl': '28px',
      },
      boxShadow: {
        xs:  '0 1px 2px rgba(0,0,0,0.05)',
        sm:  '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)',
        DEFAULT: '0 4px 6px rgba(0,0,0,0.07), 0 2px 4px rgba(0,0,0,0.04)',
        md:  '0 4px 6px rgba(0,0,0,0.07), 0 2px 4px rgba(0,0,0,0.04)',
        lg:  '0 10px 15px rgba(0,0,0,0.08), 0 4px 6px rgba(0,0,0,0.04)',
        xl:  '0 20px 25px rgba(0,0,0,0.1),  0 8px 10px rgba(0,0,0,0.04)',
        '2xl':'0 25px 50px rgba(0,0,0,0.12)',
        inner:'inset 0 2px 4px rgba(0,0,0,0.04)',
        none: 'none',
      },
      transitionTimingFunction: {
        'out-expo':   'cubic-bezier(0.16, 1, 0.3, 1)',
        'spring':     'cubic-bezier(0.34, 1.56, 0.64, 1)',
        'in-out-smooth': 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
      transitionDuration: {
        fast:   '150ms',
        normal: '200ms',
        slow:   '300ms',
        slower: '500ms',
      },
      animation: {
        'shimmer': 'shimmer 1.8s ease-in-out infinite',
        'fade-in': 'fadeIn 200ms ease-out forwards',
        'slide-up': 'slideUp 200ms cubic-bezier(0.16,1,0.3,1) forwards',
        'slide-down': 'slideDown 200ms cubic-bezier(0.16,1,0.3,1) forwards',
        'scale-in': 'scaleIn 150ms cubic-bezier(0.34,1.56,0.64,1) forwards',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
      },
      keyframes: {
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          from: { opacity: '0', transform: 'translateY(-8px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          from: { opacity: '0', transform: 'scale(0.95)' },
          to:   { opacity: '1', transform: 'scale(1)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.5' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [forms],
}
