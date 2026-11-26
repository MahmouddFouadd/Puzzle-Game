/** Design system: "treasure map" palette. Tokens only; no hardcoded colors in components. */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        parchment: { 50: '#fbf6ea', 100: '#f4ead2', 200: '#e8d7aa' },
        ink: { 700: '#2b2a33', 800: '#1d1c24', 900: '#121118' },
        gold: { 400: '#e0b34a', 500: '#c9962b', 600: '#a57619' },
        sea: { 500: '#1f7a8c', 600: '#176273' },
        danger: '#b3261e', ok: '#2e7d4f',
        bk: { 900: '#120d2b', 800: '#1b1340', 700: '#2a1d5c', 600: '#3a2a7a', accent: '#ffb938', pink: '#ff6fa8', cyan: '#3dc5ff', lime: '#7bd96a' }
      },
      fontFamily: { display: ['Fraunces', 'Cairo', 'serif'], body: ['Cairo', 'system-ui', 'sans-serif'] },
      borderRadius: { card: '1rem' }
    }
  },
  plugins: []
}
