import type { CapacitorConfig } from '@capacitor/cli'
const config: CapacitorConfig = {
  appId: 'com.storypuzzle.app',
  appName: 'Story Puzzle',
  webDir: 'dist',
  android: { backgroundColor: '#0b0b10' },
  plugins: { SplashScreen: { launchAutoHide: true, backgroundColor: '#0b0b10', showSpinner: false } }
}
export default config
