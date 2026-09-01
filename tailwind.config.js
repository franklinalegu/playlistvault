/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Outfit', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        display: ['Space Grotesk', 'Outfit', 'system-ui', 'sans-serif']
      },
      colors: {
        accent: {
          DEFAULT: '#4F46E5',
          50: '#EEF2FF',
          100: '#E0E7FF',
          200: '#C7D2FE',
          300: '#A5B4FC',
          400: '#818CF8',
          500: '#6366F1',
          600: '#4F46E5',
          700: '#4338CA',
          800: '#3730A3',
          900: '#312E81'
        },
        vault: {
          950: '#080A12',
          900: '#0C0F1A',
          850: '#11141F',
          800: '#161A27',
          700: '#1F2433',
          600: '#2A3042'
        }
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
        '3xl': '1.5rem'
      },
      backdropBlur: {
        xs: '2px'
      },
      boxShadow: {
        glass: '0 10px 40px rgba(0, 0, 0, 0.4), 0 2px 8px rgba(0, 0, 0, 0.3)',
        'glass-sm': '0 4px 18px rgba(0, 0, 0, 0.32)',
        glow: '0 0 0 1px rgba(79, 70, 229, 0.35), 0 8px 30px rgba(79, 70, 229, 0.25)',
        'glow-lg':
          '0 0 0 1px rgba(79, 70, 229, 0.4), 0 12px 44px rgba(79, 70, 229, 0.35), 0 0 48px rgba(79, 70, 229, 0.18)',
        inner: 'inset 0 1px 0 rgba(255, 255, 255, 0.06)',
        'inner-lg': 'inset 0 1px 0 rgba(255, 255, 255, 0.09)'
      },
      keyframes: {
        shimmer: {
          '100%': { transform: 'translateX(100%)' }
        },
        floaty: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-8px)' }
        },
        pulseSoft: {
          '0%, 100%': { opacity: 1 },
          '50%': { opacity: 0.45 }
        },
        fadeUp: {
          '0%': { opacity: 0, transform: 'translateY(12px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' }
        }
      },
      animation: {
        shimmer: 'shimmer 1.8s infinite',
        floaty: 'floaty 6s ease-in-out infinite',
        'pulse-soft': 'pulseSoft 2.2s ease-in-out infinite',
        'fade-up': 'fadeUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) both'
      }
    }
  },
  plugins: []
};
