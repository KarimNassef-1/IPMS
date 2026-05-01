import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import { AuthProvider } from './contexts/AuthContext.jsx'
import { ToastProvider } from './contexts/ToastContext.jsx'
import AppRouter from './router/AppRouter'

const basePath = import.meta.env.BASE_URL || '/'
const swPath = `${basePath.replace(/\/$/, '')}/sw.js`

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter basename={basePath}>
      <ToastProvider>
        <AuthProvider>
          <AppRouter />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
)

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(swPath).catch((error) => {
      console.error('Service worker registration failed:', error)
    })
  })
}
