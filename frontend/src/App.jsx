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
  const [presentations, setPresentations] = useState([])
  const [presentationsError, setPresentationsError] = useState(null)
  const [presentationsLoading, setPresentationsLoading] = useState(false)
  const [activePresentation, setActivePresentation] = useState(null)
  const [isSavingPresentation, setIsSavingPresentation] = useState(false)
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
      loadPresentations()
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

  const loadPresentations = async () => {
    setPresentationsLoading(true)
    try {
      const data = await api.getPresentations(8)
      setPresentations(data.presentations || [])
      setPresentationsError(null)
    } catch (err) {
      setPresentationsError('Failed to load presentations')
      setPresentations([])
      console.error('Presentations fetch failed:', err)
    } finally {
      setPresentationsLoading(false)
    }
  }

  const createBlankPresentationPayload = (title = 'Untitled Presentation') => ({
    title,
    slides: [
      {
        title: 'Slide 1',
        content: '',
        backgroundColor: '#ffffff',
        fabricData: null,
      },
    ],
  })

  const handleCreatePresentation = async () => {
    try {
      const defaultTitle = `Presentation ${presentations.length + 1}`
      const data = await api.createPresentation(createBlankPresentationPayload(defaultTitle))
      setActivePresentation(data.presentation)
      setCurrentPage('editor')
      await loadPresentations()
    } catch (err) {
      setPresentationsError('Failed to create presentation')
      console.error('Create presentation failed:', err)
    }
  }

  const handleOpenPresentation = async (presentationId) => {
    try {
      const data = await api.getPresentation(presentationId)
      setActivePresentation(data.presentation)
      setCurrentPage('editor')
    } catch (err) {
      setPresentationsError('Failed to open presentation')
      console.error('Open presentation failed:', err)
    }
  }

  const handleSavePresentation = async (payload) => {
    setIsSavingPresentation(true)
    try {
      const data = payload.id
        ? await api.updatePresentation(payload.id, payload)
        : await api.createPresentation(payload)

      setActivePresentation(data.presentation)
      await loadPresentations()
      return data.presentation
    } finally {
      setIsSavingPresentation(false)
    }
  }

  const handleLoginSuccess = (userData) => {
    setUser(userData)
    setCurrentPage(isMobileDevice() ? 'phoneinteraction' : 'home')
  }

  const handleLogout = async () => {
    await api.logout()
    setUser(null)
    setPresentations([])
    setActivePresentation(null)
    setCurrentPage('login')
  }

  const handleEditorNav = async () => {
    if (currentPage === 'home') {
      if (activePresentation?.id) {
        setCurrentPage('editor')
      } else {
        await handleCreatePresentation()
      }
      return
    }

    setCurrentPage('home')
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
          onClick={handleEditorNav}
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
              <h2>Recent presentations</h2>
              <div className="home-actions">
                <button onClick={handleCreatePresentation}>+ New presentation</button>
              </div>

              {presentationsError && <p className="error">{presentationsError}</p>}

              {presentationsLoading ? (
                <p>Loading presentations...</p>
              ) : presentations.length === 0 ? (
                <div className="empty-state">No presentations yet.</div>
              ) : (
                <div className="item-list">
                  {presentations.map((presentation) => (
                    <div key={presentation.id} className="item-card">
                      <div className="item-content">
                        <h3>{presentation.title}</h3>
                        <p className="recent-meta">
                          {presentation.slide_count} slide(s) • {new Date(presentation.created_at).toLocaleString()}
                        </p>
                      </div>
                      <button onClick={() => handleOpenPresentation(presentation.id)}>
                        Open
                      </button>
                    </div>
                  ))}
                </div>
              )}
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
            <PresentationEditor
              presentation={activePresentation}
              onSavePresentation={handleSavePresentation}
              isSaving={isSavingPresentation}
            />
          </main>
        </>
      )}
    </div>
  )
}

export default App