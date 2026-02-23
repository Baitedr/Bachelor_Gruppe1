import { useState, useEffect } from 'react'
import './App.css'
import api from './services/api'
import SlideEditor from './components/SlideEditor'
import Login from './components/Login'

function App() {
  const [apiStatus, setApiStatus] = useState(null)
  const [slidesData, setSlidesData] = useState(null)
  const [slidesError, setSlidesError] = useState(null)
  const [currentPage, setCurrentPage] = useState('login')
  const [user, setUser] = useState(null)
  const [isAuthChecking, setIsAuthChecking] = useState(true)

  useEffect(() => {
    const restoreSession = async () => {
      if (!api.hasToken()) {
        setIsAuthChecking(false)
        return
      }

      try {
        const data = await api.me()
        setUser(data.user)
        setCurrentPage('home')
      } catch (err) {
        await api.logout()
        setUser(null)
      } finally {
        setIsAuthChecking(false)
      }
    }

    restoreSession()
  }, [])

  useEffect(() => {
    if (user) {
      checkApiHealth()
      loadSlides()
    }
  }, [user])

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

  const handleLoginSuccess = (userData) => {
    setUser(userData)
    setCurrentPage('home')
  }

  const handleLogout = async () => {
    await api.logout()
    setUser(null)
    setCurrentPage('login')
  }

  if (isAuthChecking) {
    return <div className="App">Loading...</div>
  }

  // If not logged in, show login page
  if (!user) {
    return <Login onLoginSuccess={handleLoginSuccess} />
  }

  return (
    <div className="App">
      
      <nav style={{ 
        position: 'absolute', 
        top: '1rem', 
        left: '1rem', 
        zIndex: 1000,
        display: 'flex',
        gap: '0.5rem'
      }}>
        <button 
          onClick={() => setCurrentPage(currentPage === 'home' ? 'editor' : 'home')}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '0.5rem',
            border: 'none',
            background: 'rgba(102, 126, 234, 0.8)',
            color: 'white',
            cursor: 'pointer',
            fontWeight: '600',
          }}
        >
          {currentPage === 'home' ? '→ Go to Editor' : '← Back to Home'}
        </button>
        <button 
          onClick={handleLogout}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '0.5rem',
            border: 'none',
            background: 'rgba(239, 68, 68, 0.8)',
            color: 'white',
            cursor: 'pointer',
            fontWeight: '600',
          }}
        >
          Logout
        </button>
      </nav>

      {currentPage === 'home' ? (
        <>
          <header>
            <h1>ProSlides</h1>
            <p>Lag eller rediger presentasjonene dine</p>
            <p style={{ fontSize: '0.875rem', color: 'rgba(255, 255, 255, 0.7)' }}>
              Logged in as: {user?.email}
            </p>
          </header>

          <main>
            <section className="slides-list-section">
              <h2>Hva vil du gjøre?</h2>
            </section>
          </main>
        </>
      ) : (
        <>
          <header>
            <h1>ProSlides</h1>
            <div className={`api-status ${apiStatus === 'ok' ? 'connected' : 'disconnected'}`}>
              API Status: {apiStatus === 'ok' ? '🟢 Connected' : '🔴 Disconnected'}
            </div>
          </header>

          <main>
            <section className="slides-list-section">
              <h2>Database Print connection</h2>
              {slidesError && (
                <div className="error-box">
                  {slidesError}
                </div>
              )}
              <div className="output-box">
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
              <button type="button" onClick={loadSlides}>
                Refresh
              </button>
            </section>
            <SlideEditor />
          </main>
        </>
      )}
    </div>
  )
}

export default App