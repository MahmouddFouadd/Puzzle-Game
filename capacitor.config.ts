import type { CapacitorConfig } from '@capacitor/cli'
const config: CapacitorConfig = {
  appId: 'com.storypuzzle.app',
  appName: 'Friends Zone',
  webDir: 'dist',
  android: { backgroundColor: '#101426' },
  plugins: { SplashScreen: { launchAutoHide: true, backgroundColor: '#101426', showSpinner: false } }
}
export default config
