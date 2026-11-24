import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import App from './App'
import { AuthProvider } from './auth/AuthProvider'
import { I18nProvider } from './lib/i18n'
import { InstallPrompt } from './components/InstallPrompt'
import './index.css'
if (!Capacitor.isNativePlatform() && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { void navigator.serviceWorker.register('/sw.js') })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <I18nProvider><AuthProvider><App /><InstallPrompt /></AuthProvider></I18nProvider>
    </BrowserRouter>
  </StrictMode>
)
