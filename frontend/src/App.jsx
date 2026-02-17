import { useState, useEffect } from 'react'
import './App.css'
import api from './services/api'
import SlideEditor from './components/SlideEditor'

function App() {
  const [apiStatus, setApiStatus] = useState(null)
  const [slidesData, setSlidesData] = useState(null)
  const [slidesError, setSlidesError] = useState(null)

  useEffect(() => {
    checkApiHealth()
    loadSlides()
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

  const loadSlides = async () => {
    try {
      const data = await api.getSlides()
      setSlidesData(data.slides || [])
      setSlidesError(null)
    } catch (err) {
      setSlidesError('Failed to load slides')
      setSlidesData([])
      console.error('Slides fetch failed:', err)
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
        <section>
          <h2>Database Test</h2>
          {slidesError && <div className="error">{slidesError}</div>}
          <textarea
            className="data-textbox"
            readOnly
            value={JSON.stringify(slidesData, null, 2)}
          />
          <button type="button" onClick={loadSlides}>Refresh</button>
        </section>
        <SlideEditor />
      </main>
    </div>
  )
}

export default App