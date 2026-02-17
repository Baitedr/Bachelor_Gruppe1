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
    <div className="database-output">
      <header>
        <h1>ProSlides</h1>
        <div className={`api-status ${apiStatus === 'ok' ? 'connected' : 'disconnected'}`}>
          API Status: {apiStatus === 'ok' ? '🟢 Connected' : '🔴 Disconnected'}
        </div>
      </header>

      <main>
        <section>
          <h2>Database Print connection</h2>
          {slidesError && <div className="error">{slidesError}</div>}
          <div className="data-textbox">
            {Array.isArray(slidesData) && slidesData.length > 0 ? (
              slidesData.map((slide) => (
                <div key={slide.slideid ?? slide.id ?? slide.slide_name}>
                  {slide.slide_name}
                </div>
              ))
            ) : (
              <div>No slides found.</div>
            )}
          </div>
          <button type="button" onClick={loadSlides}>Refresh</button>
        </section>
        <SlideEditor />
      </main>
    </div>
  )
}

export default App