import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        card: 'var(--card)',
        'card-hover': 'var(--cardHover)',
        border: 'var(--border)',
        'border-strong': 'var(--border-strong)',

        // Semantic colors
        focus: {
          DEFAULT: 'var(--focus)',
          light: 'var(--focus-light)',
          bg: 'var(--focus-bg)',
          border: 'var(--focus-border)',
        },
        reward: {
          DEFAULT: 'var(--reward)',
          light: 'var(--reward-light)',
          bg: 'var(--reward-bg)',
          border: 'var(--reward-border)',
        },
        growth: {
          DEFAULT: 'var(--growth)',
          light: 'var(--growth-light)',
          bg: 'var(--growth-bg)',
          border: 'var(--growth-border)',
        },
        wisdom: {
          DEFAULT: 'var(--wisdom)',
          light: 'var(--wisdom-light)',
          bg: 'var(--wisdom-bg)',
          border: 'var(--wisdom-border)',
        },
        urgency: {
          DEFAULT: 'var(--urgency)',
          light: 'var(--urgency-light)',
          bg: 'var(--urgency-bg)',
          border: 'var(--urgency-border)',
        },
      },
      fontFamily: {
        display: ['Georgia', 'Times New Roman', 'serif'],
        body: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      fontSize: {
        'display': ['48px', { lineHeight: '1.1', fontWeight: '800' }],
        'h1': ['36px', { lineHeight: '1.2', fontWeight: '800' }],
        'h2': ['28px', { lineHeight: '1.3', fontWeight: '700' }],
        'h3': ['22px', { lineHeight: '1.4', fontWeight: '700' }],
        'h4': ['16px', { lineHeight: '1.5', fontWeight: '600' }],
        'body': ['15px', { lineHeight: '1.6', fontWeight: '400' }],
        'small': ['13px', { lineHeight: '1.5', fontWeight: '400' }],
        'label': ['11px', { lineHeight: '1.4', fontWeight: '600' }],
      },
      keyframes: {
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.9)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'pulse-ring': {
          '0%': { transform: 'scale(0.95)', opacity: '0.5' },
          '50%': { transform: 'scale(1)', opacity: '0.3' },
          '100%': { transform: 'scale(0.95)', opacity: '0.5' },
        },
        'glow-pulse': {
          '0%, 100%': { opacity: '0.4' },
          '50%': { opacity: '0.8' },
        },
        timerPulse: {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.05)' },
        },
        timerShake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '25%': { transform: 'translateX(-3px)' },
          '75%': { transform: 'translateX(3px)' },
        },
        bounce: {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.15)' },
        },
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '20%': { transform: 'translateX(-8px)' },
          '40%': { transform: 'translateX(8px)' },
          '60%': { transform: 'translateX(-4px)' },
          '80%': { transform: 'translateX(4px)' },
        },
        xpFloat: {
          '0%': { opacity: '1', transform: 'translateY(0)' },
          '100%': { opacity: '0', transform: 'translateY(-40px)' },
        },
        flame: {
          '0%, 100%': { transform: 'scaleY(1) rotate(-2deg)' },
          '50%': { transform: 'scaleY(1.2) rotate(2deg)' },
        },
        particle: {
          '0%': { opacity: '1', transform: 'translate(0, 0) scale(1)' },
          '100%': { opacity: '0', transform: 'translate(var(--px), var(--py)) scale(0)' },
        },
        rankReveal: {
          '0%': { transform: 'scale(0.2) rotate(-15deg)', opacity: '0' },
          '60%': { transform: 'scale(1.1) rotate(2deg)', opacity: '1' },
          '100%': { transform: 'scale(1) rotate(0)', opacity: '1' },
        },
        bounceOnce: {
          '0%': { transform: 'scale(1)' },
          '30%': { transform: 'scale(1.05)' },
          '70%': { transform: 'scale(0.97)' },
          '100%': { transform: 'scale(1)' },
        },
        slideR: {
          '0%': { opacity: '0', transform: 'translateX(-20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-12px)' },
        },
      },
      animation: {
        fadeUp: 'fadeUp 0.6s ease both',
        'fade-up': 'fadeUp 0.5s ease-out',
        'scale-in': 'scaleIn 0.3s ease-out',
        'shimmer': 'shimmer 2s linear infinite',
        'pulse-ring': 'pulse-ring 3s ease-in-out infinite',
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
        'timer-pulse': 'timerPulse 1s ease-in-out infinite',
        'timer-shake': 'timerShake 0.3s ease-in-out infinite',
        'bounce-in': 'bounce 0.4s ease-out',
        'shake': 'shake 0.5s ease-out',
        'xp-float': 'xpFloat 1.5s ease-out forwards',
        'flame': 'flame 0.6s ease-in-out infinite',
        'particle': 'particle 0.8s ease-out forwards',
        'slide-r': 'slideR 0.3s ease-out',
        'float': 'float 4s ease-in-out infinite',
        'rankReveal': 'rankReveal 0.8s cubic-bezier(0.22,1,0.36,1) both',
        'bounce-once': 'bounceOnce 0.45s ease',
      },
      borderRadius: {
        '2xl': '16px',
        '3xl': '24px',
      },
    },
  },
  plugins: [],
}

export default config
