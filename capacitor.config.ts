import type { CapacitorConfig } from '@capacitor/cli'
const config: CapacitorConfig = {
  appId: 'com.storypuzzle.app',
  appName: 'Story Puzzle',
  webDir: 'dist',
  android: { backgroundColor: '#121118' },
  plugins: { SplashScreen: { launchAutoHide: true, backgroundColor: '#121118', showSpinner: false } }
}
export default config
