import { useState, useEffect } from 'react'
import './App.css'
import api from './services/api'
import PresentationEditor from './components/PresentationEditor'
import Login from './components/Login'
import PollPage from './components/PollPage'
import PhoneInteraction from './components/MobileComponents/PhoneInteraction'

const MOBILE_BREAKPOINT = 768;

function App() {
  const [apiStatus, setApiStatus] = useState(null)
  const [slidesData, setSlidesData] = useState(null)
  const [slidesError, setSlidesError] = useState(null)
  const [currentPage, setCurrentPage] = useState('login')
  const [user, setUser] = useState(null)
  const [isAuthChecking, setIsAuthChecking] = useState(true)

  const isMobileDevice = () => {
    const hasSmallViewport = window.innerWidth <= MOBILE_BREAKPOINT
    const isTouchDevice = window.matchMedia('(pointer: coarse)').matches
    const userAgentIsMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    return hasSmallViewport || isTouchDevice || userAgentIsMobile
  }

  useEffect(() => {
    const checkMobile = () => {
      const isMobile = isMobileDevice()
      if (isMobile) {
        setCurrentPage('phoneinteraction')
      } else {
        setCurrentPage((prevPage) => {
          if (prevPage !== 'phoneinteraction') return prevPage
          return user ? 'home' : 'login'
        })
      }
    }

    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [user])

  useEffect(() => {
    const restoreSession = async () => {
      if (!api.hasToken()) {
        setIsAuthChecking(false)
        return
      }

      try {
        const data = await api.me()
        setUser(data.user)
        
        // Only set to home if we are not on mobile
        const isMobile = isMobileDevice()
        if (!isMobile) {
          setCurrentPage('home')
        }
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
    setCurrentPage(isMobileDevice() ? 'phoneinteraction' : 'home')
  }

  const handleLogout = async () => {
    await api.logout()
    setUser(null)
    setCurrentPage('login')
  }

  if (isAuthChecking) {
    return <div className="App">Loading...</div>
  }

  // If not logged in and not on phone interaction, show login page
  if (!user && currentPage !== 'phoneinteraction') {
    return <Login onLoginSuccess={handleLoginSuccess} />
  }

  if (currentPage === 'phoneinteraction') {
    return <PhoneInteraction />
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
          onClick={() => setCurrentPage('polls')}
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
          → Polls
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
      ) : currentPage === 'polls' ? (
        <PollPage onNavigate={setCurrentPage} user={user} />
      ) : (
        <>
          <header>
            <h1>ProSlides</h1>
          </header>

          <main>
            <PresentationEditor />
          </main>
        </>
      )}
    </div>
  )
}

export default App