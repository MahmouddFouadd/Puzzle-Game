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
        danger: '#b3261e', ok: '#2e7d4f'
      },
      fontFamily: { display: ['Fraunces', 'Cairo', 'serif'], body: ['Cairo', 'system-ui', 'sans-serif'] },
      borderRadius: { card: '1rem' }
    }
  },
  plugins: []
}
