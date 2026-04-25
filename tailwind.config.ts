import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        verdict: {
          good: '#16a34a',
          ok: '#eab308',
          risky: '#f97316',
          bad: '#dc2626',
        },
      },
    },
  },
  plugins: [],
};

export default config;
