import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ThemeProvider } from './components/ui/theme-provider'
import './index.css'

// Tema: klassen "dark" på <html> styrer Tailwind/shadcn-variabler.
// defaultTheme system = følg OS; enableSystem tillater det valget.
// Sirkulært temabytte (inspirert av bl.a. Telegram) styres av View Transitions + ModeToggle (index.css).
// disableTransitionOnChange er ikke satt — next-themes sin korte blokkering av overganger er uproblematisk her.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider attribute='class' defaultTheme='system' enableSystem>
      <App />
    </ThemeProvider>
  </React.StrictMode>,
)
