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
          DEFAULT: '#6366F1',
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
          950: '#060815',
          900: '#0A0D1E',
          850: '#0F1228',
          800: '#171B34',
          700: '#22274A',
          600: '#2E345E'
        },
        v6: {
          cyan: '#06B6D4',
          violet: '#8B5CF6',
          pink: '#EC4899',
          emerald: '#10B981'
        }
      },
      backgroundImage: {
        'gradient-minimal': 'linear-gradient(180deg, #F8FAFC 0%, #EEF2FF 50%, #F1F5F9 100%)',
        'gradient-aurora': 'radial-gradient(70% 50% at 50% 0%, rgba(99,102,241,0.08), transparent 60%), radial-gradient(50% 40% at 100% 0%, rgba(6,182,214,0.06), transparent 50%)',
        'gradient-mesh': 'radial-gradient(80rem 55rem at 4% -10%, rgba(99,102,241,0.16), transparent 58%), radial-gradient(70rem 45rem at 98% -4%, rgba(6,182,214,0.10), transparent 52%)',
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
        glass: '0 12px 48px rgba(0, 0, 0, 0.45), 0 3px 12px rgba(0, 0, 0, 0.35)',
        'glass-sm': '0 6px 22px rgba(0, 0, 0, 0.38)',
        glow: '0 0 0 1px rgba(99, 102, 241, 0.38), 0 10px 36px rgba(99, 102, 241, 0.28)',
        'glow-lg':
          '0 0 0 1px rgba(99, 102, 241, 0.45), 0 16px 56px rgba(99, 102, 241, 0.38), 0 0 64px rgba(6, 182, 214, 0.16)',
        'v6-glow': '0 0 0 1px rgba(139, 92, 246, 0.35), 0 12px 40px rgba(99, 102, 241, 0.30), 0 0 80px rgba(6, 182, 214, 0.12)',
        inner: 'inset 0 1px 0 rgba(255, 255, 255, 0.08)',
        'inner-lg': 'inset 0 1px 0 rgba(255, 255, 255, 0.10)'
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
