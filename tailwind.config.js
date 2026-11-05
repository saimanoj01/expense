/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui'],
      },
      fontSize: {
        'display-xl': ['64px', { lineHeight: '64px', letterSpacing: '-0.035em', fontWeight: '600' }],
        'display-l': ['40px', { lineHeight: '44px', letterSpacing: '-0.025em', fontWeight: '600' }],
        'title': ['22px', { lineHeight: '28px', letterSpacing: '-0.015em', fontWeight: '600' }],
        'heading': ['15px', { lineHeight: '22px', letterSpacing: '-0.005em', fontWeight: '600' }],
        'body': ['14px', { lineHeight: '20px', fontWeight: '400' }],
        'label': ['12px', { lineHeight: '16px', fontWeight: '500' }],
        'eyebrow': ['11px', { lineHeight: '16px', letterSpacing: '0.06em', fontWeight: '600' }],
      },
      colors: {
        border: "hsl(var(--border) / <alpha-value>)",
        input: "hsl(var(--input) / <alpha-value>)",
        ring: "hsl(var(--ring) / <alpha-value>)",
        background: "hsl(var(--background) / <alpha-value>)",
        foreground: "hsl(var(--foreground) / <alpha-value>)",
        primary: {
          DEFAULT: "hsl(var(--primary) / <alpha-value>)",
          foreground: "hsl(var(--primary-foreground) / <alpha-value>)",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary) / <alpha-value>)",
          foreground: "hsl(var(--secondary-foreground) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "hsl(var(--accent) / <alpha-value>)",
          foreground: "hsl(var(--accent-foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "hsl(var(--muted) / <alpha-value>)",
          foreground: "hsl(var(--muted-foreground) / <alpha-value>)",
        },
        card: {
          DEFAULT: "hsl(var(--card) / <alpha-value>)",
          foreground: "hsl(var(--card-foreground) / <alpha-value>)",
        },
        surface2: "hsl(var(--surface-2) / <alpha-value>)",
        faint: "hsl(var(--faint) / <alpha-value>)",
        negative: "hsl(var(--c-negative) / <alpha-value>)",
        bucket: {
          fixed: "hsl(var(--c-fixed) / <alpha-value>)",
          variable: "hsl(var(--c-variable) / <alpha-value>)",
          nonmonthly: "hsl(var(--c-nonmonthly) / <alpha-value>)",
          saved: "hsl(var(--c-saved) / <alpha-value>)",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      animation: {
        'fade-in': 'fade-in 0.3s ease-out forwards',
        'slide-up': 'slide-up 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
