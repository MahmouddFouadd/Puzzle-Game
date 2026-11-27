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
        fz: { navy: '#101426', purple: '#6D4AFF', cyan: '#20D5D2', blue: '#3887FF', white: '#F5F5FA', gray: '#A5A9BB', gold: '#E5B85C', s1: '#171C33', s2: '#1F2542', s3: '#2A3156', success: '#2FD17D', warning: '#F5A524', danger: '#FF5470', story: '#3887FF', detective: '#20D5D2', bakasa: '#FF7A45', multi: '#6D4AFF' },
        bk: { 900: '#120d2b', 800: '#1b1340', 700: '#2a1d5c', 600: '#3a2a7a', accent: '#ffb938', pink: '#ff6fa8', cyan: '#3dc5ff', lime: '#7bd96a' }
      },
      fontFamily: { display: ['Fraunces', 'Cairo', 'serif'], body: ['Cairo', 'system-ui', 'sans-serif'], fzdisplay: ['"FZ Display"', '"Baloo Bhaijaan 2"', 'Cairo', 'system-ui', 'sans-serif'], fztext: ['"FZ Text"', 'Cairo', 'system-ui', 'sans-serif'] },
      borderRadius: { card: '1rem' }
    }
  },
  plugins: []
}
