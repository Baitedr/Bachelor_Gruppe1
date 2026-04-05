import React, { useEffect, useRef, useState } from 'react'
import LivePresentation from './components/LivePresentation'
import Login from './components/Login'
import PhoneInteraction from './components/joinSession'
import PollPage from './components/PollPage'
import PresentationEditor from './components/PresentationEditor'
import type { PresentationEditorHandle } from './components/PresentationEditor'
import SessionLobby from './components/SessionLobby'
import Navbar from './components/Navbar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { MonitorPlay, Pencil, Trash2, RotateCcw, Plus, Save, X } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import api from './services/api'
import { createDefaultSlideFabricData } from './lib/fabricDefaults'
import { cn } from '@/lib/utils'

type Page =
  | 'login'
  | 'home'
  | 'editor'
  | 'polls'
  | 'lobby'
  | 'live'
  | 'phoneinteraction'

type UserRecord = {
  id?: number | string
  email?: string
  name?: string
  oauth_user?: boolean
}

type SlidePreview = {
  title?: string
  content?: string
  backgroundColor?: string
  previewImage?: string
}

type PresentationSummary = {
  id: string
  title: string
  created_at: string
  slide_count: number
  first_slide?: SlidePreview
  slides?: Array<{
    title?: string
    content?: string
    backgroundColor?: string
    fabricData?: unknown
    previewImage?: string
  }>
}

type TrashItem = {
  id: string
  presentation: PresentationSummary
  deletedAt: string
}

type PersistedPageState = {
  currentPage: Page
  activePresentationId: string | null
  livePresentationId: string | null
  liveJoinCode: string | null
  guestMode: boolean
}

const MOBILE_BREAKPOINT = 768
// Hvor lenge «slettet»-toast med angre vises før den forsvinner av seg selv
const DELETE_UNDO_TIMEOUT_MS = 16_000

// Intern toast-state: Navbar får kun message + actions
type NavbarUndoToastState = {
  message: string
  actions: React.ReactNode
  undoTrashId: string
}

function App() {
  const [presentations, setPresentations] = useState<PresentationSummary[]>([])
  const [deletingPresentationIds, setDeletingPresentationIds] = useState<Record<string, boolean>>({})
  const [trashedPresentations, setTrashedPresentations] = useState<TrashItem[]>([])
  // Melding midt i navbar (f.eks. angre etter sletting)
  const [navbarToast, setNavbarToast] = useState<NavbarUndoToastState | null>(null)
  const [presentationsError, setPresentationsError] = useState<string | null>(null)
  const [presentationsLoading, setPresentationsLoading] = useState(false)

  const [activePresentation, setActivePresentation] = useState<PresentationSummary | null>(null)
  const [isSavingPresentation, setIsSavingPresentation] = useState(false)
  const [isCreatingPresentation, setIsCreatingPresentation] = useState(false)
  const [currentPage, setCurrentPage] = useState<Page>('login')

  const [user, setUser] = useState<UserRecord | null>(null)
  const [isAuthChecking, setIsAuthChecking] = useState(true)
  const [guestMode, setGuestMode] = useState(false)

  const [livePresentationId, setLivePresentationId] = useState<string | null>(null)
  const [liveJoinCode, setLiveJoinCode] = useState<string | null>(null)
  const [isNewPresentationSession, setIsNewPresentationSession] = useState(false)
  const [hasSavedCurrentSession, setHasSavedCurrentSession] = useState(false)

  const [isExitEditorDialogOpen, setIsExitEditorDialogOpen] = useState(false)
  const [isDiscardingPresentation, setIsDiscardingPresentation] = useState(false)
  const [permanentDeleteDialog, setPermanentDeleteDialog] = useState<{
    trashId: string
    title: string
  } | null>(null)

  // Auto-lukk av navbar-toast etter valgt antall millisekunder
  const navbarToastTimerRef = useRef<number | null>(null)

  const presentationEditorRef = useRef<PresentationEditorHandle | null>(null)

  // Lagre-knapp i navbar når editor er åpen
  const [editorLastSavedAt, setEditorLastSavedAt] = useState<Date | null>(null)
  const [editorSaveFlash, setEditorSaveFlash] = useState(false)
  const editorSaveFlashTimerRef = useRef<number | null>(null)
  // Husker hvilken presentasjon editoren viser, så vi ikke nullstiller ved nytt objekt med samme id etter lagring
  const editorPresentationIdRef = useRef<string | undefined>(undefined)

  const PAGE_STATE_KEY = 'proslides_page_state'

  const loadPageState = (): PersistedPageState | null => {
    try {
      const raw = sessionStorage.getItem(PAGE_STATE_KEY)
      return raw ? (JSON.parse(raw) as PersistedPageState): null
    } catch {
      return null
    }
  }

  const savePageState = (state: PersistedPageState) => {
    sessionStorage.setItem(PAGE_STATE_KEY, JSON.stringify(state))
  }

  const clearPageState = () => sessionStorage.removeItem(PAGE_STATE_KEY)

  const clearNavbarToastTimer = () => {
    if (!navbarToastTimerRef.current) return
    window.clearTimeout(navbarToastTimerRef.current)
    navbarToastTimerRef.current = null
  }

  // Lukker toast med en gang (f.eks. «Lukk» eller utlogging)
  const dismissNavbarToast = () => {
    clearNavbarToastTimer()
    setNavbarToast(null)
  }

  const clearEditorSaveFlashTimer = () => {
    if (!editorSaveFlashTimerRef.current) return
    window.clearTimeout(editorSaveFlashTimerRef.current)
    editorSaveFlashTimerRef.current = null
  }

  // Oppdaterer tid + kort «Lagret»-blink i navbar etter vellykket lagring fra editoren
  const handleEditorSaveComplete = (savedAt: Date) => {
    setEditorLastSavedAt(savedAt)
    setEditorSaveFlash(true)
    clearEditorSaveFlashTimer()
    editorSaveFlashTimerRef.current = window.setTimeout(() => {
      setEditorSaveFlash(false)
      editorSaveFlashTimerRef.current = null
    }, 2500)
  }

  // Viser angre-toast og auto-lukker etter DELETE_UNDO_TIMEOUT_MS
  const showNavbarUndoToast = (payload: NavbarUndoToastState) => {
    clearNavbarToastTimer()
    setNavbarToast(payload)
    navbarToastTimerRef.current = window.setTimeout(() => {
      setNavbarToast(null)
      navbarToastTimerRef.current = null
    }, DELETE_UNDO_TIMEOUT_MS)
  }

  // Hjelpefunksjon for å generere en "clean" payload når vi gjenoppretter en presentasjon fra papirkurven.
  const toRestorablePresentationPayload = (presentation: PresentationSummary) => ({
    title: presentation?.title || 'Gjenopprettet presentasjon',
    slides: (presentation?.slides || []).map((slide, index) => ({
      title: slide?.title || `Lysbilde ${index + 1}`,
      content: slide?.content || '',
      backgroundColor: slide?.backgroundColor || '#ffffff',
      fabricData: slide?.fabricData || null,
      previewImage: slide?.previewImage || (index === 0 ? presentation?.first_slide?.previewImage : null),
    })),
  })

  // Sjekker om brukeren benytter en mobil enhet basert på skjermstørrelse og touch-mulighet.
  const isMobileDevice = () => {
    const hasSmallViewport = window.innerWidth <= MOBILE_BREAKPOINT
    const isTouchDevice = window.matchMedia('(pointer: coarse)').matches
    const userAgentIsMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    return hasSmallViewport || isTouchDevice || userAgentIsMobile
  }

  useEffect(() => {
  if (!user && !guestMode) return
  savePageState({
    currentPage,
    activePresentationId: activePresentation?.id ?? null,
    livePresentationId,
    liveJoinCode,
    guestMode,
  })
}, [currentPage, activePresentation?.id, livePresentationId, liveJoinCode, guestMode, user])

  useEffect(() => {
    const loc = window.location
    if (loc.pathname === '/oauth/callback' || loc.pathname.endsWith('/oauth/callback')) {
      const token = new URLSearchParams(loc.search).get('token')
      if (token) {
        api.setAuthToken(token)
        window.history.replaceState({}, '', '/')
      }
    }

    // Sjekker om det finnes en aktiv økt eller token ved oppstart
  const restoreSession = async () => {
  const savedRaw = sessionStorage.getItem('proslides_session')
  const saved = savedRaw ? JSON.parse(savedRaw) : null
  const savedPage = loadPageState()

  if (saved?.guestMode) {
    setLivePresentationId(saved.presentationId)
    setGuestMode(true)
    setCurrentPage(saved.page)
    setIsAuthChecking(false)
    return
  }

  if (!api.hasToken()) {
    setIsAuthChecking(false)
    return
  }

  try {
    const data = await api.me()
    setUser(data.user)

    if (saved?.page === 'lobby' || saved?.page === 'live') {
      setLivePresentationId(saved.presentationId)
      setLiveJoinCode(saved.joinCode ?? null)
      setCurrentPage(saved.page)
    } else if (savedPage) {
      setLivePresentationId(savedPage.livePresentationId)
      setLiveJoinCode(savedPage.liveJoinCode)
      setGuestMode(savedPage.guestMode)

      if (savedPage.currentPage === 'editor' && savedPage.activePresentationId) {
        try {
          const p = await api.getPresentation(savedPage.activePresentationId)
          setActivePresentation(p.presentation)
          setCurrentPage('editor')
        } catch {
          setCurrentPage('home')
        }
      } else {
        setCurrentPage(savedPage.currentPage === 'login' ? 'home' : savedPage.currentPage)
      }
    } else {
      setCurrentPage('home')
    }
  } catch {
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
      loadPresentations()
    }
  }, [user])

  // Rydd vekk pending auto-dismiss ved unmount
  useEffect(() => {
    return () => clearNavbarToastTimer()
  }, [])

  useEffect(() => {
    return () => clearEditorSaveFlashTimer()
  }, [])

  // Slideseditor: ingen body-scroll; layout bruker dvh + flex (canvas skalerer i viewporter).
  useEffect(() => {
    if (currentPage !== 'editor') return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [currentPage])

  // Nullstill lagre-status ved sidebytte eller når aktiv presentasjons-id faktisk endres (ikke bare nytt objekt etter save)
  useEffect(() => {
    if (currentPage !== 'editor') {
      editorPresentationIdRef.current = undefined
      clearEditorSaveFlashTimer()
      setEditorSaveFlash(false)
      setEditorLastSavedAt(null)
      return
    }
    const pid =
      activePresentation?.id != null && activePresentation.id !== ''
        ? String(activePresentation.id)
        : undefined
    if (editorPresentationIdRef.current === pid) return
    editorPresentationIdRef.current = pid
    clearEditorSaveFlashTimer()
    setEditorSaveFlash(false)
    setEditorLastSavedAt(null)
  }, [currentPage, activePresentation?.id])

  // Henter inn og oppdaterer brukerens lagrede presentasjoner
  const loadPresentations = async () => {
    setPresentationsLoading(true)
    try {
      const data = await api.getPresentations(8)
      setPresentations(data.presentations || [])
      setPresentationsError(null)
    } catch {
      setPresentationsError('Kunne ikke laste presentasjoner')
      setPresentations([])
    } finally {
      setPresentationsLoading(false)
    }
  }

  // Genererer en standard payload for en helt ny, blank presentasjon.
  const createBlankPresentationPayload = (title = 'Uten navn') => ({
    title,
    slides: [
      {
        title: 'Lysbilde 1',
        content: '',
        backgroundColor: '#ffffff',
        fabricData: createDefaultSlideFabricData(),
      },
    ],
  })

  // Håndterer opprettelsen av en ny presentasjon (via backend-kall) og navigerer deretter til editoren.
  const handleCreatePresentation = async () => {
    setIsCreatingPresentation(true)
    try {
      const defaultTitle = `Presentasjon ${presentations.length + 1}`
      const data = await api.createPresentation(createBlankPresentationPayload(defaultTitle))
      setActivePresentation(data.presentation)
      setIsNewPresentationSession(true)
      setHasSavedCurrentSession(false)
      setCurrentPage('editor')
      await loadPresentations()
    } catch {
      setPresentationsError('Kunne ikke opprette presentasjon')
    } finally {
      setIsCreatingPresentation(false)
    }
  }

  const handleOpenPresentation = async (presentationId: string) => {
    try {
      const data = await api.getPresentation(presentationId)
      setActivePresentation(data.presentation)
      setIsNewPresentationSession(false)
      setHasSavedCurrentSession(false)
      setCurrentPage('editor')
    } catch {
      setPresentationsError('Kunne ikke åpne presentasjon')
    }
  }

  const handleSavePresentation = async (payload: Record<string, unknown>) => {
    setIsSavingPresentation(true)
    try {
      const presentationId = (payload.id as string) || activePresentation?.id
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

  // Sletter en presentasjon og flytter den midlertidig til en intern "papirkurv" for angrerett
  const handleDeletePresentation = async (presentationId: string) => {
    if (deletingPresentationIds[presentationId]) return

    setDeletingPresentationIds((previous) => ({ ...previous, [presentationId]: true }))

    try {
      const details = await api.getPresentation(presentationId)
      const summaryPresentation = presentations.find((item) => item.id === presentationId)
      const restorablePresentation = details?.presentation
        ? {
            ...details.presentation,
            first_slide:
              details.presentation?.first_slide ||
              summaryPresentation?.first_slide ||
              null,
          }
        : details?.presentation
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

      setTrashedPresentations((previous) => [trashedItem, ...previous])
      const deletedTitle = restorablePresentation?.title || 'Presentasjon'
      // Kompakt toast i navbar med angre (undoTrashId kobler til papirkurv-rad)
      showNavbarUndoToast({
        message: `Slettet "${deletedTitle}".`,
        undoTrashId: trashId,
        actions: (
          <>
            {/* Litt lavere enn sm-knapp så alt får plass i én toast-rad */}
            <Button
              size='sm'
              variant='outline'
              className='h-7 shrink-0 px-2 text-[11px]'
              onClick={() => void handleRestorePresentation(trashId)}
            >
              Angre
            </Button>
            <Button size='sm' variant='ghost' className='h-7 shrink-0 px-2 text-[11px]' onClick={dismissNavbarToast}>
              Lukk
            </Button>
          </>
        ),
      })

      window.setTimeout(() => {
        setPresentations((previous) => previous.filter((item) => item.id !== presentationId))
        setDeletingPresentationIds((previous) => {
          const next = { ...previous }
          delete next[presentationId]
          return next
        })
      }, 280)
    } catch {
      setDeletingPresentationIds((previous) => {
        const next = { ...previous }
        delete next[presentationId]
        return next
      })
      setPresentationsError('Kunne ikke slette presentasjon')
    }
  }

  // Gjenoppretter en midlertidig slettet presentasjon fra papirkurven ved å lage en ny kopi
  const handleRestorePresentation = async (trashId: string) => {
    const trashedItem = trashedPresentations.find((item) => item.id === trashId)
    if (!trashedItem?.presentation) return

    try {
      const payload = toRestorablePresentationPayload(trashedItem.presentation)
      await api.createPresentation(payload)

      setTrashedPresentations((previous) => previous.filter((item) => item.id !== trashId))

      // Fjern angre-toast hvis den gjaldt akkurat denne raden (trygg etter async)
      setNavbarToast((current) => {
        if (current?.undoTrashId === trashId) {
          clearNavbarToastTimer()
          return null
        }
        return current
      })

      await loadPresentations()
      setPresentationsError(null)
    } catch {
      setPresentationsError('Kunne ikke gjenopprette presentasjon')
    }
  }

  const handleDeletePermanently = (trashId: string) => {
    const trashedItem = trashedPresentations.find((item) => item.id === trashId)
    if (!trashedItem) return

    setPermanentDeleteDialog({
      trashId,
      title: trashedItem.presentation?.title || 'Uten navn',
    })
  }

  const confirmDeletePermanently = () => {
    if (!permanentDeleteDialog) return

    const { trashId } = permanentDeleteDialog

    setTrashedPresentations((previous) => previous.filter((item) => item.id !== trashId))

    // Skjul angre-linjen hvis brukeren slettet den samme tingen for godt
    setNavbarToast((current) => {
      if (current?.undoTrashId === trashId) {
        clearNavbarToastTimer()
        return null
      }
      return current
    })

    setPermanentDeleteDialog(null)
  }

  const handleLoginSuccess = (userData: UserRecord) => {
    setUser(userData)
    setCurrentPage('home')
  }

  const saveSessionState = (
    page: Page,
    presentationId: string | null,
    joinCode: string | null,
    isGuest: boolean
  ) => {
    sessionStorage.setItem(
      'proslides_session',
      JSON.stringify({ page, presentationId, joinCode: joinCode ?? null, guestMode: isGuest })
    )
  }

  const clearSessionState = () => sessionStorage.removeItem('proslides_session')

  const handleStartLive = async (presentationId: string) => {
    try {
      const data = await api.startSession(presentationId)
      setLivePresentationId(presentationId)
      setLiveJoinCode(data.join_code)
      saveSessionState('lobby', presentationId, data.join_code, false)
      setCurrentPage('lobby')
    } catch {
      setPresentationsError('Kunne ikke starte live-økt')
    }
  }

  const handleGuestJoin = (presentationId: string | number) => {
    const normalizedPresentationId = String(presentationId)
    saveSessionState('lobby', normalizedPresentationId, null, true)
    setLivePresentationId(normalizedPresentationId)
    setLiveJoinCode(null)
    setGuestMode(true)
    setCurrentPage('lobby')
  }

  const handleLogout = async () => {
    await api.logout()
    dismissNavbarToast() // ikke la toast henge igjen etter utlogging
    setEditorLastSavedAt(null)
    setEditorSaveFlash(false)
    clearEditorSaveFlashTimer()
    clearSessionState()
    clearPageState()
    setUser(null)
    setPresentations([])
    setTrashedPresentations([])
    setActivePresentation(null)
    setIsNewPresentationSession(false)
    setHasSavedCurrentSession(false)
    setCurrentPage('login')
  }

  const handleGoHome = async () => {
    if (currentPage === 'editor') {
      setIsExitEditorDialogOpen(true)
      return
        
    }

    //Eksisterende presentasjon, ingen endringer - bare gå hjem
    clearSessionState()
    setLiveJoinCode(null)
    setLivePresentationId(null)
    setCurrentPage('home')
  }

  const handleUpdateProfileName = async (name: string) => {
    const data = await api.updateProfile({ name })
    setUser((previous) => ({ ...(previous || {}), ...(data?.user || {}), name }))
  }

  const handleChangePassword = async (payload: {
    current_password?: string
    password: string
    password_confirmation: string
  }) => {
    const data = await api.changePassword(payload)
    if (data?.user) {
      setUser((previous) => ({ ...(previous || {}), ...data.user }))
    }
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
      clearSessionState()
      setCurrentPage('home')
    } catch {
      setPresentationsError('Kunne ikke forkaste presentasjonen')
    } finally {
      setIsDiscardingPresentation(false)
    }
  }

  const handleSaveAndGoHome = async () => {
    if (isSavingPresentation) return

    const didSave = await presentationEditorRef.current?.savePresentation?.()
    if (!didSave) return 
      
      setIsExitEditorDialogOpen(false)
      clearSessionState()
      setCurrentPage('home')
    
  }

  if (isAuthChecking) {
    return (
      <div className='grid min-h-screen place-items-center bg-background text-foreground'>
        Laster...
      </div>
    )
  }

  if (!user && !guestMode) {
    return <Login onLoginSuccess={handleLoginSuccess} onGuestJoin={handleGuestJoin} />
  }

  if (guestMode) {
    const leaveGuestSession = () => {
      clearSessionState()
      setGuestMode(false)
      setLivePresentationId(null)
      setCurrentPage('login')
      api.logout()
    }

    return (
      <div className='min-h-screen bg-background text-foreground'>
        <header className='border-b border-border/70 bg-card/80'>
          <div className='mx-auto flex w-full items-center gap-3 px-4 py-3'>
            <Badge variant='secondary'>Gjest</Badge>
            <span className='text-sm text-muted-foreground'>ProSlides gjestemodus</span>
            <Button className='ml-auto' variant='destructive' size='sm' onClick={leaveGuestSession}>
              Forlat sesjon
            </Button>
          </div>
        </header>

        <main className='mx-auto w-full px-4 py-6'>
          {currentPage === 'lobby' ? (
            <div className='mx-auto w-full max-w-4xl'>
              <SessionLobby
                presentationId={livePresentationId}
                joinCode={null}
                isPresenter={false}
                onSessionStarted={() => {
                  saveSessionState('live', livePresentationId, null, true)
                  setCurrentPage('live')
                }}
                onSessionEnd={leaveGuestSession}
              />
            </div>
          ) : (
            <LivePresentation 
              presentationId={livePresentationId} 
              isPresenter={false} 
              onSessionEnd={leaveGuestSession}
            />
          )}
        </main>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'bg-background text-foreground',
        currentPage === 'editor'
          ? 'flex h-dvh max-h-dvh min-h-0 flex-col overflow-hidden'
          : 'min-h-screen',
      )}
    >
      <Navbar
        currentPage={currentPage}
        userEmail={user?.email}
        userName={user?.name}
        oauthUser={Boolean(user?.oauth_user)}
        onGoHome={handleGoHome}
        onJoinLive={() => setCurrentPage('phoneinteraction')}
        onUpdateProfileName={handleUpdateProfileName}
        onChangePassword={handleChangePassword}
        onLogout={handleLogout}
        // Send kun det Navbar trenger (ikke intern undoTrashId)
        centerToast={
          navbarToast
            ? { message: navbarToast.message, actions: navbarToast.actions }
            : null
        }
        editorSave={
          currentPage === 'editor'
            ? {
                onSave: () => void presentationEditorRef.current?.savePresentation?.(),
                isSaving: isSavingPresentation,
                lastSavedAt: editorLastSavedAt,
                saveFlash: editorSaveFlash,
              }
            : null
        }
      />

      <main
        className={cn(
          currentPage === 'editor'
            ? 'mx-auto flex min-h-0 w-full flex-1 flex-col overflow-hidden'
            : 'mx-auto w-full px-4 py-6',
        )}
      >
        {currentPage === 'home' && (
          <Card className='mx-auto w-full max-w-7xl border-border/80'>
            <CardHeader className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
              <div>
                <CardTitle>Dine presentasjoner</CardTitle>
                <CardDescription>Opprett, rediger eller start en live-økt.</CardDescription>
              </div>
              <Button 
                onClick={handleCreatePresentation} 
                disabled={isCreatingPresentation}
                variant="outline"
                className="bg-primary/10 text-primary border-primary/30 hover:bg-accent hover:text-accent-foreground hover:border-input transition-colors"
                >
                  {isCreatingPresentation ? 'Setter sammen...' : (
                    <>
                      <Plus className="mr-2 h-4 w-4" />
                      Ny presentasjon
                    </>
                  )}
              </Button>
            </CardHeader>

            <CardContent className='space-y-6'>
              {presentationsError && (
                <div className='rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive'>
                  {presentationsError}
                </div>
              )}

              {presentationsLoading ? (
                <p className='text-sm text-muted-foreground'>Laster inn presentasjoner...</p>
              ) : presentations.length === 0 ? (
                <div className='rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground'>
                  Ingen presentasjoner tilgjengelig ennå.
                </div>
              ) : (
                <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-3'>
                  {presentations.map((presentation) => (
                    <Card
                      key={presentation.id}
                      className='group border-border/70 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-accent/30 hover:shadow-lg'
                    >
                      <CardContent
                        className='space-y-4 rounded-lg p-4 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background'
                        role='button'
                        tabIndex={0}
                        aria-label={`Rediger ${presentation.title}`}
                        onClick={(event) => {
                          if ((event.target as HTMLElement).closest('button')) return
                          void handleOpenPresentation(presentation.id)
                        }}
                        onKeyDown={(event) => {
                          if (event.key !== 'Enter' && event.key !== ' ') return
                          event.preventDefault()
                          void handleOpenPresentation(presentation.id)
                        }}
                      >
                        {presentation.first_slide?.previewImage ? (
                          <div className='aspect-video w-full overflow-hidden rounded-md border border-border bg-muted/20'>
                            <img
                              src={presentation.first_slide.previewImage}
                              alt={`${presentation.title} forhåndsvisning`}
                              className='h-full w-full object-cover'
                            />
                          </div>
                        ) : (
                          <div className='aspect-video w-full rounded-md border border-border bg-muted/40 p-3'>
                            <p className='line-clamp-1 text-sm font-medium'>
                              {presentation.first_slide?.title || 'Lysbilde 1'}
                            </p>
                            <p className='mt-2 line-clamp-3 text-xs text-muted-foreground'>
                              {presentation.first_slide?.content || 'Intet innhold ennå'}
                            </p>
                          </div>
                        )}

                        <div className='space-y-1'>
                          <h3 className='line-clamp-1 text-sm font-semibold'>{presentation.title}</h3>
                          <p className='text-xs text-muted-foreground'>
                            {presentation.slide_count} lysbilde(r) ·{' '}
                            {new Date(presentation.created_at).toLocaleString()}
                          </p>
                        </div>

                        <div className='grid grid-cols-3 gap-2'>
                          <Button
                            size='sm'
                            variant='outline'
                            className='flex items-center justify-center gap-1.5 hover:bg-accent hover:text-accent-foreground'
                            disabled={deletingPresentationIds[presentation.id]}
                            onClick={() => handleOpenPresentation(presentation.id)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Rediger
                          </Button>
                          <Button
                            size='sm'
                            variant='outline'
                            className='flex items-center justify-center gap-1.5 bg-emerald-500/15 text-emerald-500 border-emerald-500/30 hover:bg-accent hover:text-accent-foreground hover:border-input transition-colors'
                            disabled={deletingPresentationIds[presentation.id]}
                            onClick={() => handleStartLive(presentation.id)}
                          >
                            <MonitorPlay className="h-3.5 w-3.5" />
                            Start live
                          </Button>
                          <Button
                            size='sm'
                            variant='outline'
                            className='flex items-center justify-center gap-1.5 bg-destructive/15 text-destructive border-destructive/30 hover:bg-accent hover:text-accent-foreground hover:border-input transition-colors'
                            disabled={deletingPresentationIds[presentation.id]}
                            onClick={() => handleDeletePresentation(presentation.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Slett
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              <section className='space-y-3'>
                <h3 className='text-sm font-semibold'>Søppelkasse</h3>
                {trashedPresentations.length === 0 ? (
                  <p className='text-sm text-muted-foreground'>Slettede presentasjoner vises her.</p>
                ) : (
                  <div className='space-y-2'>
                    {trashedPresentations.map((trashedItem) => (
                      <Card key={trashedItem.id} className='border-border/70'>
                        <CardContent className='flex flex-col gap-3 p-4 sm:flex-row sm:items-center'>
                          <div className='w-full sm:w-40 shrink-0'>
                            {(trashedItem.presentation?.first_slide?.previewImage || trashedItem.presentation?.slides?.[0]?.previewImage) ? (
                              <div className='aspect-video w-full overflow-hidden rounded-md border border-border bg-muted/20'>
                                <img
                                  src={trashedItem.presentation?.first_slide?.previewImage || trashedItem.presentation?.slides?.[0]?.previewImage}
                                  alt={`${trashedItem.presentation?.title || 'Presentasjon'} forhåndsvisning`}
                                  className='h-full w-full object-cover'
                                />
                              </div>
                            ) : (
                              <div className='aspect-video w-full rounded-md border border-border bg-muted/40 p-3'>
                                <p className='line-clamp-1 text-sm font-medium'>
                                  {trashedItem.presentation?.slides?.[0]?.title || trashedItem.presentation?.first_slide?.title || 'Lysbilde 1'}
                                </p>
                                <p className='mt-2 line-clamp-3 text-xs text-muted-foreground'>
                                  {trashedItem.presentation?.slides?.[0]?.content || trashedItem.presentation?.first_slide?.content || 'Intet innhold ennå'}
                                </p>
                              </div>
                            )}
                          </div>
                          <div className='min-w-0 flex-1'>
                            <p className='line-clamp-1 text-sm font-medium'>
                              {trashedItem.presentation?.title || 'Uten navn'}
                            </p>
                            <p className='text-xs text-muted-foreground'>
                              Slettet {new Date(trashedItem.deletedAt).toLocaleTimeString()}
                            </p>
                            <p className='text-xs text-muted-foreground'>
                              {(trashedItem.presentation?.slides?.length || trashedItem.presentation?.slide_count || 0)} lysbilde(r)
                            </p>
                          </div>
                          <div className='flex gap-2'>
                            <Button
                              size='sm'
                              variant='outline'
                              className='flex items-center gap-1.5'
                              onClick={() => handleRestorePresentation(trashedItem.id)}
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                              Gjenopprett
                            </Button>
                            <Button
                              size='sm'
                              variant='destructive'
                              className='flex items-center gap-1.5'
                              onClick={() => handleDeletePermanently(trashedItem.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Slett for alltid
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </section>
            </CardContent>
          </Card>
        )}

        {currentPage === 'polls' && <PollPage onNavigate={setCurrentPage} user={user} />}

        {currentPage === 'phoneinteraction' && (
          <div className='mx-auto w-full max-w-4xl'>
            <PhoneInteraction
              onJoined={(presentationId) => {
                setLivePresentationId(presentationId)
                setCurrentPage('live')
              }}
            />
          </div>
        )}

        {currentPage === 'lobby' && (
          <div className='mx-auto w-full max-w-4xl'>
            <SessionLobby
              presentationId={livePresentationId}
              joinCode={liveJoinCode}
              isPresenter
              onSessionStarted={() => {
                saveSessionState('live', livePresentationId, liveJoinCode, false)
                setCurrentPage('live')
              }}
              onSessionEnd={handleGoHome}
            />
          </div>
        )}

        {currentPage === 'live' && (
          <div className='mx-auto w-full max-w-7xl space-y-4'>
            {liveJoinCode && (
              <Card className='mx-auto w-full max-w-3xl border-border/70'>
                <CardContent className='flex flex-wrap items-center gap-3 p-4'>
                  <div className='text-sm text-muted-foreground'>
                    Live-kode:{' '}
                    <span className='font-mono text-base font-semibold tracking-wider text-foreground'>
                      {liveJoinCode}
                    </span>
                  </div>
                  <Button
                    className='ml-auto'
                    size='sm'
                    variant='destructive'
                    onClick={async () => {
                      if (livePresentationId) {
                        try {
                          await api.endSession(livePresentationId)
                        } catch (e) {
                          console.error('Failed to end session on server:', e)
                        }
                      }
                      clearSessionState()
                      setCurrentPage('home')
                      setLiveJoinCode(null)
                      setLivePresentationId(null)
                    }}
                  >
                    Avslutt økt
                  </Button>
                </CardContent>
              </Card>
            )}
            <LivePresentation 
              presentationId={livePresentationId} 
              isPresenter={Boolean(liveJoinCode)} 
              onSessionEnd={handleGoHome}
            />
          </div>
        )}

        {currentPage === 'editor' && (
          <PresentationEditor
            ref={presentationEditorRef}
            presentation={activePresentation}
            onSavePresentation={handleSavePresentation}
            isSaving={isSavingPresentation}
            onSaveComplete={handleEditorSaveComplete}
          />
        )}
      </main>

      {isExitEditorDialogOpen && (
        <div className='fixed inset-0 z-50 grid place-items-center bg-black/60 px-4'>
          <Card className='w-full max-w-md border-border/70'>
            <CardHeader>
              <CardTitle>Gå ut av editor?</CardTitle>
              <CardDescription>Vil du lagre endringene dine før du går tilbake?</CardDescription>
            </CardHeader>
            <CardContent className='flex justify-end gap-2'>
              <Button
                variant='outline'
                onClick={() => setIsExitEditorDialogOpen(false)}
                disabled={isSavingPresentation || isDiscardingPresentation}
                className='flex items-center justify-center gap-1.5 bg-muted/30 text-foreground border-border hover:bg-accent hover:text-accent-foreground hover:border-input transition-colors'
              >
                Avbryt
              </Button>
              <Button
                variant='outline'
                onClick={handleDiscardAndGoHome}
                disabled={isSavingPresentation || isDiscardingPresentation}
                className='flex items-center justify-center gap-1.5 bg-destructive/15 text-destructive border-destructive/30 hover:bg-accent hover:text-accent-foreground hover:border-input transition-colors'
              >
                <X className="h-4 w-4" />
                {isDiscardingPresentation ? 'Forkaster...' : 'Forkast'}
              </Button>
              <Button
                variant='outline'
                onClick={handleSaveAndGoHome}
                disabled={isSavingPresentation}
                className='flex items-center justify-center gap-1.5 bg-emerald-500/15 text-emerald-500 border-emerald-500/30 hover:bg-accent hover:text-accent-foreground hover:border-input transition-colors'
              >
                <Save className="h-4 w-4" />
                {isSavingPresentation ? 'Lagrer...' : 'Lagre'}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {permanentDeleteDialog && (
        <div className='fixed inset-0 z-50 grid place-items-center bg-black/60 px-4'>
          <Card className='w-full max-w-md border-border/70'>
            <CardHeader>
              <CardTitle>Slette for alltid?</CardTitle>
              <CardDescription>
                Du sletter "{permanentDeleteDialog.title}" permanent. Denne handlingen kan ikke angres.
              </CardDescription>
            </CardHeader>
            <CardContent className='flex justify-end gap-2'>
              <Button variant='outline' onClick={() => setPermanentDeleteDialog(null)}>
                Avbryt
              </Button>
              <Button 
                variant='outline' 
                onClick={confirmDeletePermanently}
                className='flex items-center justify-center gap-1.5 bg-destructive/15 text-destructive border-destructive/30 hover:bg-accent hover:text-accent-foreground hover:border-input transition-colors'
              >
                <Trash2 className="h-4 w-4" />
                Ja, slett
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

export default App
