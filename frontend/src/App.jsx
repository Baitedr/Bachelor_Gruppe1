import { useState, useEffect, useRef } from 'react'
import './App.css'
import api from './services/api'
import PresentationEditor from './components/PresentationEditor'
import Login from './components/Login'
import PollPage from './components/PollPage'
import PhoneInteraction from './components/MobileComponents/PhoneInteraction'
import LivePresentation from './components/LivePresentation'
import SessionLobby from './components/SessionLobby'

const MOBILE_BREAKPOINT = 768;
const DELETE_UNDO_TIMEOUT_MS = 10000;

function App() {
  const [apiStatus, setApiStatus] = useState(null)
  const [presentations, setPresentations] = useState([])
  const [deletingPresentationIds, setDeletingPresentationIds] = useState({})
  const [trashedPresentations, setTrashedPresentations] = useState([])
  const [deleteUndoToast, setDeleteUndoToast] = useState(null)
  const [presentationsError, setPresentationsError] = useState(null)
  const [presentationsLoading, setPresentationsLoading] = useState(false)
  const [activePresentation, setActivePresentation] = useState(null)
  const [isSavingPresentation, setIsSavingPresentation] = useState(false)
  const [currentPage, setCurrentPage] = useState('login')
  const [user, setUser] = useState(null)
  const [isAuthChecking, setIsAuthChecking] = useState(true)
  const [livePresentationId, setLivePresentationId] = useState(null)
  const [liveJoinCode, setLiveJoinCode] = useState(null)
  const [guestMode, setGuestMode] = useState(false)
  const [isNewPresentationSession, setIsNewPresentationSession] = useState(false)
  const [hasSavedCurrentSession, setHasSavedCurrentSession] = useState(false)
  const [isExitEditorDialogOpen, setIsExitEditorDialogOpen] = useState(false)
  const [isDiscardingPresentation, setIsDiscardingPresentation] = useState(false)
  const undoToastTimerRef = useRef(null)
  const presentationEditorRef = useRef(null)

  const clearUndoToastTimer = () => {
    if (!undoToastTimerRef.current) return
    window.clearTimeout(undoToastTimerRef.current)
    undoToastTimerRef.current = null
  }

  const toRestorablePresentationPayload = (presentation) => ({
    title: presentation?.title || 'Gjenopprettet presentasjon', // Recovered Presentation
    slides: (presentation?.slides || []).map((slide, index) => ({
      title: slide?.title || `Lysbilde ${index + 1}`, // Slide
      content: slide?.content || '',
      backgroundColor: slide?.backgroundColor || '#ffffff',
      fabricData: slide?.fabricData || null,
    })),
  })

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

  useEffect(() => {
    return () => {
      clearUndoToastTimer()
    }
  }, [])

  const checkApiHealth = async () => {
    try {
      const data = await api.checkHealth()
      setApiStatus(data.status)
    } catch (err) {
      setApiStatus('error')
      console.error('API helsesjekk feilet:', err) // API health check failed
    }
  }

  const loadPresentations = async () => {
    setPresentationsLoading(true)
    try {
      const data = await api.getPresentations(8)
      setPresentations(data.presentations || [])
      setPresentationsError(null)
    } catch (err) {
      setPresentationsError('Kunne ikke laste presentasjoner') // Failed to load presentations
      setPresentations([])
      console.error('Kunne ikke laste presentasjoner:', err)
    } finally {
      setPresentationsLoading(false)
    }
  }

  const createBlankPresentationPayload = (title = 'Uten navn') => ({ // Untitled Presentation
    title,
    slides: [
      {
        title: 'Lysbilde 1', // Slide 1
        content: '',
        backgroundColor: '#ffffff',
        fabricData: null,
      },
    ],
  })

  const handleCreatePresentation = async () => {
    try {
      const defaultTitle = `Presentasjon ${presentations.length + 1}` // Presentation
      const data = await api.createPresentation(createBlankPresentationPayload(defaultTitle))
      setActivePresentation(data.presentation)
      setIsNewPresentationSession(true)
      setHasSavedCurrentSession(false)
      setCurrentPage('editor')
      await loadPresentations()
    } catch (err) {
      setPresentationsError('Kunne ikke opprette presentasjon') // Failed to create presentation
      console.error('Opprettelse av presentasjon feilet:', err)
    }
  }

  const handleOpenPresentation = async (presentationId) => {
    try {
      const data = await api.getPresentation(presentationId)
      setActivePresentation(data.presentation)
      setIsNewPresentationSession(false)
      setHasSavedCurrentSession(false)
      setCurrentPage('editor')
    } catch (err) {
      setPresentationsError('Kunne ikke åpne presentasjon') // Failed to open presentation
      console.error('Åpning av presentasjon feilet:', err)
    }
  }

  const handleSavePresentation = async (payload) => {
    setIsSavingPresentation(true)
    try {
      const presentationId = payload.id || activePresentation?.id
      const data = presentationId
        ? await api.updatePresentation(presentationId, payload)
        : await api.createPresentation(payload)

      setActivePresentation(data.presentation)
      setHasSavedCurrentSession(true)
      setIsNewPresentationSession(false)
      await loadPresentations()
      return data.presentation
    } finally {
      setIsSavingPresentation(false)
    }
  }

  const handleDeletePresentation = async (presentationId) => {
    if (deletingPresentationIds[presentationId]) return

    setDeletingPresentationIds((prev) => ({ ...prev, [presentationId]: true }))

    try {
      const details = await api.getPresentation(presentationId)
      const restorablePresentation = details?.presentation

      await api.deletePresentation(presentationId)

      if (activePresentation?.id === presentationId) {
        setActivePresentation(null)
      }

      const trashId = `trash-${presentationId}-${Date.now()}`
      const trashedItem = {
        id: trashId,
        presentation: restorablePresentation,
        deletedAt: new Date().toISOString(),
      }

      setTrashedPresentations((prev) => [trashedItem, ...prev])
      setDeleteUndoToast({
        trashId,
        title: restorablePresentation?.title || 'Presentasjon', // Presentation
      })

      clearUndoToastTimer()
      undoToastTimerRef.current = window.setTimeout(() => {
        setDeleteUndoToast(null)
        undoToastTimerRef.current = null
      }, DELETE_UNDO_TIMEOUT_MS)

      window.setTimeout(() => {
        setPresentations((prev) => prev.filter((item) => item.id !== presentationId))
        setDeletingPresentationIds((prev) => {
          const next = { ...prev }
          delete next[presentationId]
          return next
        })
      }, 280)
    } catch (err) {
      setDeletingPresentationIds((prev) => {
        const next = { ...prev }
        delete next[presentationId]
        return next
      })
      setPresentationsError('Kunne ikke slette presentasjon') // Failed to delete presentation
      console.error('Sletting av presentasjon feilet:', err)
    }
  }

  const handleRestorePresentation = async (trashId) => {
    const trashedItem = trashedPresentations.find((item) => item.id === trashId)
    if (!trashedItem?.presentation) return

    try {
      const payload = toRestorablePresentationPayload(trashedItem.presentation)
      await api.createPresentation(payload)

      setTrashedPresentations((prev) => prev.filter((item) => item.id !== trashId))

      if (deleteUndoToast?.trashId === trashId) {
        clearUndoToastTimer()
        setDeleteUndoToast(null)
      }

      await loadPresentations()
      setPresentationsError(null)
    } catch (err) {
      setPresentationsError('Kunne ikke gjenopprette presentasjon') // Failed to restore presentation
      console.error('Gjenoppretting av presentasjon feilet:', err)
    }
  }

  const handleDeletePermanently = (trashId) => {
    const trashedItem = trashedPresentations.find((item) => item.id === trashId)
    if (!trashedItem) return

    const presentationTitle = trashedItem.presentation?.title || 'denne presentasjonen' // this presentation
    const shouldDelete = window.confirm(
      `Slett "${presentationTitle}" permanent? Dette kan ikke angres.` // Permanently delete "${presentationTitle}"? This cannot be undone.
    )

    if (!shouldDelete) return

    setTrashedPresentations((prev) => prev.filter((item) => item.id !== trashId))

    if (deleteUndoToast?.trashId === trashId) {
      clearUndoToastTimer()
      setDeleteUndoToast(null)
    }
  }

  const dismissDeleteUndoToast = () => {
    clearUndoToastTimer()
    setDeleteUndoToast(null)
  }

  const handleLoginSuccess = (userData) => {
    setUser(userData)
    setCurrentPage(isMobileDevice() ? 'phoneinteraction' : 'home')
  }

  const handleStartLive = async (presentationId) => {
    try {
      const data = await api.startSession(presentationId)
      setLivePresentationId(presentationId)
      setLiveJoinCode(data.join_code)
      setCurrentPage('lobby')
    } catch (err) {
      console.error('Kunne ikke starte live-økt', err) // Failed to start live session
    }
  }

  const handleGuestJoin = (presentationId) => {
    setLivePresentationId(presentationId)
    setLiveJoinCode(null)
    setGuestMode(true)
    setCurrentPage('live')
  }

  const handleLogout = async () => {
    await api.logout()
    clearUndoToastTimer()
    setUser(null)
    setPresentations([])
    setTrashedPresentations([])
    setDeleteUndoToast(null)
    setActivePresentation(null)
    setIsNewPresentationSession(false)
    setHasSavedCurrentSession(false)
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

    setIsExitEditorDialogOpen(true)
  }

  const handleDiscardAndGoHome = async () => {
    if (isSavingPresentation || isDiscardingPresentation) return

    setIsDiscardingPresentation(true)

    try {
      if (isNewPresentationSession && !hasSavedCurrentSession && activePresentation?.id) {
        await api.deletePresentation(activePresentation.id)
        setActivePresentation(null)
        await loadPresentations()
      }

      setIsExitEditorDialogOpen(false)
      setCurrentPage('home')
    } catch (err) {
      setPresentationsError('Kunne ikke forkaste presentasjonen') // Failed to discard presentation
      console.error('Kunne ikke forkaste presentasjonen:', err)
    } finally {
      setIsDiscardingPresentation(false)
    }
  }

  const handleSaveAndGoHome = async () => {
    if (isSavingPresentation) return

    const didSave = await presentationEditorRef.current?.savePresentation?.()
    if (didSave) {
      setIsExitEditorDialogOpen(false)
      setCurrentPage('home')
    }
  }

  if (isAuthChecking) {
    return <div className="App">Laster...</div> // Loading...
  }

  // If not logged in, always show login page (mobile users log in then are redirected to phoneinteraction)
  if (!user && !guestMode) {
    return <Login onLoginSuccess={handleLoginSuccess} onGuestJoin={handleGuestJoin} />
  }

  if (currentPage === 'phoneinteraction') {
    return <PhoneInteraction onJoined={(presentationId) => {
      setLivePresentationId(presentationId)
      setCurrentPage('live')
    }} />
  }

  // Guest: go straight to live view, no nav bar
  if (guestMode && currentPage === 'live') {
    return (
      <div>
        <div style={{ background: '#1e293b', color: '#fff', padding: '0.75rem 1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span>ProSlides – Gjest</span>
          <button
            onClick={() => { setGuestMode(false); setLivePresentationId(null); api.logout() }}
            style={{ marginLeft: 'auto', padding: '0.25rem 0.75rem', cursor: 'pointer' }}
          >
            Forlat sesjon
          </button>
        </div>
        <LivePresentation presentationId={livePresentationId} isPresenter={false} />
      </div>
    )
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
          {currentPage === 'home' ? '→ Gå til redigering' : '← Tilbake til hjem'}
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
          → Avstemninger
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
          Logg ut
        </button>
      </nav>

      {currentPage === 'home' ? (
        <>
          <header>
            <h1>ProSlides</h1>
            <p>Lag eller rediger presentasjonene dine</p>
            <p style={{ fontSize: '0.875rem', color: 'rgba(255, 255, 255, 0.7)' }}>
              Logget inn som: {user?.email}
            </p>
          </header>

          <main>
            <section className="slides-list-section">
              <h2>Nylige presentasjoner</h2>
              <div className="home-actions">
                <button onClick={handleCreatePresentation}>+ Ny presentasjon</button>
              </div>

              {presentationsError && <p className="error">{presentationsError}</p>}

              {presentationsLoading ? (
                <p>Laster presentasjoner...</p>
              ) : presentations.length === 0 ? (
                <div className="empty-state">Ingen presentasjoner ennå.</div>
              ) : (
                <div className="item-list">
                  {presentations.map((presentation) => (
                    <div
                      key={presentation.id}
                      className={`item-card ${deletingPresentationIds[presentation.id] ? 'deleting' : ''}`}
                    >
                      <div className="item-content">
                        <div
                          className="recent-slide-preview"
                          style={{
                            backgroundColor:
                              presentation.first_slide?.backgroundColor || '#ffffff',
                          }}
                        >
                          {presentation.first_slide?.previewImage ? (
                            <img
                              src={presentation.first_slide.previewImage}
                              alt={`${presentation.title} første lysbilde forhåndsvisning`}
                              className="recent-slide-image"
                            />
                          ) : (
                            <>
                              <div className="recent-slide-title">
                                {presentation.first_slide?.title || 'Lysbilde 1'}
                              </div>
                              <div className="recent-slide-content">
                                {presentation.first_slide?.content || 'Inget innhold ennå'}
                              </div>
                            </>
                          )}
                        </div>
                        <h3>{presentation.title}</h3>
                        <p className="recent-meta">
                          {presentation.slide_count} lysbilde(r) • {new Date(presentation.created_at).toLocaleString()}
                        </p>
                      </div>
                      <div className="recent-actions">
                        <button
                          className="recent-action-btn edit-btn"
                          onClick={() => handleOpenPresentation(presentation.id)}
                          disabled={deletingPresentationIds[presentation.id]}
                        >
                          Rediger
                        </button>
                        <button
                          className="recent-action-btn"
                          onClick={() => handleStartLive(presentation.id)}
                          disabled={deletingPresentationIds[presentation.id]}
                          style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: '0.25rem', padding: '0.25rem 0.75rem', cursor: 'pointer' }}
                        >
                          ▶ Start Live
                        </button>
                        <button
                          className="recent-action-btn delete-btn"
                          onClick={() => handleDeletePresentation(presentation.id)}
                          disabled={deletingPresentationIds[presentation.id]}
                        >
                          Slett
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="trash-section">
                <h3>Papirkurv</h3>
                {trashedPresentations.length === 0 ? (
                  <p className="trash-empty">Slettede presentasjoner vises her.</p>
                ) : (
                  <div className="trash-list">
                    {trashedPresentations.map((trashedItem) => (
                      <div key={trashedItem.id} className="trash-item">
                        <div>
                          <strong>{trashedItem.presentation?.title || 'Uten navn'}</strong>
                          <p className="trash-meta">
                            Slettet {new Date(trashedItem.deletedAt).toLocaleTimeString()}
                          </p>
                        </div>
                        <div className="trash-actions">
                          <button
                            className="recent-action-btn restore-btn"
                            onClick={() => handleRestorePresentation(trashedItem.id)}
                          >
                            Gjenopprett
                          </button>
                          <button
                            className="recent-action-btn permanent-delete-btn"
                            onClick={() => handleDeletePermanently(trashedItem.id)}
                          >
                            Slett permanent
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </main>

          {deleteUndoToast && (
            <div className="delete-undo-toast" role="status" aria-live="polite">
              <span>Slettet “{deleteUndoToast.title}”.</span>
              <div className="delete-undo-actions">
                <button
                  className="recent-action-btn undo-btn"
                  onClick={() => handleRestorePresentation(deleteUndoToast.trashId)}
                >
                  Angre
                </button>
                <button className="recent-action-btn dismiss-btn" onClick={dismissDeleteUndoToast}>
                  Lukk
                </button>
              </div>
            </div>
          )}
        </>
      ) : currentPage === 'polls' ? (
        <PollPage onNavigate={setCurrentPage} user={user} />
      ) : currentPage === 'lobby' ? (
        <SessionLobby
        presentationId={livePresentationId}
        joinCode={liveJoinCode}
        isPresenter={true}
        onSessionStarted={() => setCurrentPage('live')}
        />
      ) : currentPage === 'live' ? (
        <div>
          {liveJoinCode && (
            <div style={{
              background: '#1e293b',
              color: '#fff',
              padding: '0.75rem 1.5rem',
              display: 'flex',
              alignItems: 'center',
              gap: '1rem'
            }}>
              <span>Lively-kode: <strong style={{ fontSize: '1.25rem', letterSpacing: '0.1em' }}>{liveJoinCode}</strong></span>
              <button
                onClick={() => { setCurrentPage('home'); setLiveJoinCode(null); setLivePresentationId(null) }}
                style={{ marginLeft: 'auto', padding: '0.25rem 0.75rem', cursor: 'pointer' }}
              >
                Avslutt økt
              </button>
            </div>
          )}
          <LivePresentation presentationId={livePresentationId} isPresenter={!!liveJoinCode} />
        </div>
      ) : (
        <>
          <header>
            <h1>ProSlides</h1>
          </header>

          <main>
            <PresentationEditor
              ref={presentationEditorRef}
              presentation={activePresentation}
              onSavePresentation={handleSavePresentation}
              isSaving={isSavingPresentation}
            />
          </main>
        </>
      )}

      {isExitEditorDialogOpen && (
        <div className="editor-exit-dialog-overlay" role="dialog" aria-modal="true" aria-label="Forlat redigeringsprogrammet">
          <div className="editor-exit-dialog">
            <h3>Forlat redigeringsprogrammet?</h3>
            <p>Vil du lagre endringene før du returnerer hjem?</p>
            <div className="editor-exit-dialog-actions">
              <button
                type="button"
                className="recent-action-btn permanent-delete-btn"
                onClick={handleDiscardAndGoHome}
                  disabled={isSavingPresentation || isDiscardingPresentation}
              >
                  {isDiscardingPresentation ? 'Forkaster...' : 'Forkast'}
              </button>
              <button
                type="button"
                className="recent-action-btn edit-btn"
                onClick={handleSaveAndGoHome}
                disabled={isSavingPresentation}
              >
                {isSavingPresentation ? 'Lagrer...' : 'Lagre'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App