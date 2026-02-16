import { useState, useEffect } from 'react'
import './App.css'
import api from './services/api'
import SlideEditor from './components/SlideEditor'

function App() {
  const [apiStatus, setApiStatus] = useState(null)

  useEffect(() => {
    checkApiHealth()
  }, [])

  const checkApiHealth = async () => {
    try {
      const data = await api.checkHealth()
      setApiStatus(data.status)
    } catch (err) {
      setApiStatus('error')
      console.error('API health check failed:', err)
    }
  }

  return (
    <div className="App">
      <header>
        <h1>ProSlides</h1>
        <div className={`api-status ${apiStatus === 'ok' ? 'connected' : 'disconnected'}`}>
          API Status: {apiStatus === 'ok' ? '🟢 Connected' : '🔴 Disconnected'}
        </div>
      </header>

      <main>
        <SlideEditor />
      </main>
    </div>
  )
}

export default App