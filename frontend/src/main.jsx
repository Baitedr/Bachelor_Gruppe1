import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ThemeProvider } from './components/ui/theme-provider'
import './index.css'

// Tema: klassen "dark" på <html> styrer Tailwind/shadcn-variabler.
// defaultTheme system = følg OS; enableSystem tillater det valget.
// disableTransitionOnChange er av — ellers blokkerer next-themes CSS-overganger ved temabytte (se index.css).
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider attribute='class' defaultTheme='system' enableSystem>
      <App />
    </ThemeProvider>
  </React.StrictMode>,
)
