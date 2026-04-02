import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ThemeProvider } from './components/theme-provider'
import './index.css'

// Tema: klassen "dark" på <html> styrer Tailwind/shadcn-variabler.
// defaultTheme system = følg OS; enableSystem tillater det valget.
// disableTransitionOnChange reduserer glimt ved bytte.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider attribute='class' defaultTheme='system' enableSystem disableTransitionOnChange>
      <App />
    </ThemeProvider>
  </React.StrictMode>,
)
