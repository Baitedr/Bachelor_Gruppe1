import React, { useEffect, useRef, useState } from 'react'
import LivePresentation from './components/livesession/LivePresentation'
import LivePresentationProjectorShell from './components/livesession/LivePresentationProjectorShell'
import Login from './components/Login'
import PhoneInteraction from './components/livesession/joinSession'
import PollPage from './components/polls/PollPage'
import PresentationEditor from './components/PresentationEditor'
import type { PresentationEditorHandle } from './components/PresentationEditor'
import SessionLobby from './components/livesession/SessionLobby'
import Navbar from './components/ui/Navbar'
import { ModeToggle } from '@/components/ui/mode-toggle'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Loader2, LogOut, MonitorPlay, Pencil, Trash2, RotateCcw, Plus, Save, X } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import api from './services/api'
import { createDefaultSlideFabricData } from './lib/fabricDefaults'
import { cn, logoutStyleDestructiveButtonClassName } from '@/lib/utils'
import { useIsMobileDevice } from '@/hooks/useIsMobileDevice'

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
  notes?: string
  backgroundColor?: string
  previewImage?: string
}

type PresentationSummary = {
  id: string
  title: string
  created_at: string
  updated_at: string
  slide_count: number
  first_slide?: SlidePreview
  slides?: Array<{
    title?: string
    content?: string
    notes?: string
    backgroundColor?: string
    fabricData?: unknown
    previewImage?: string
  }>
}

type LiveSlidePayload = {
  title?: string
  content?: string
  notes?: string
  backgroundColor?: string
  previewImage?: string
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
  liveIsPresenter: boolean
  guestMode: boolean
}

const formatPresentationTimestamp = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString('nb-NO', { dateStyle: 'short', timeStyle: 'short' })
}

const MOBILE_BREAKPOINT = 768
// Hvor lenge «slettet»-toast med angre vises før den forsvinner av seg selv
const DELETE_UNDO_TIMEOUT_MS = 16_000

function parseLiveJoinCodeFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/live\/join\/([^/?#]+)/i)
  if (!match) return null
  const decoded = decodeURIComponent(match[1] || '').trim().toUpperCase()
  if (!decoded) return null
  return decoded.startsWith('LIVE-') ? decoded : `LIVE-${decoded}`
}

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
  const [openingPresentationId, setOpeningPresentationId] = useState<string | null>(null)

  const [user, setUser] = useState<UserRecord | null>(null)
  const [isAuthChecking, setIsAuthChecking] = useState(true)
  const [guestMode, setGuestMode] = useState(false)

  const [livePresentationId, setLivePresentationId] = useState<string | null>(null)
  const [liveJoinCode, setLiveJoinCode] = useState<string | null>(null)
  const [liveIsPresenter, setLiveIsPresenter] = useState(false)
  /** Hvilken presentasjon som akkurat nå starter live (API-kall pågår). */
  const [startingLivePresentationId, setStartingLivePresentationId] = useState<string | null>(null)
  const [isNewPresentationSession, setIsNewPresentationSession] = useState(false)
  const [hasSavedCurrentSession, setHasSavedCurrentSession] = useState(false)
  const [isAutosaveEnabled, setIsAutosaveEnabled] = useState(false)


  /** Lysbildevindu (sekundærskjerm / popup) — leses én gang ved første render. */
  const [liveProjectorPresentationId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    const p = new URLSearchParams(window.location.search)
    if (p.get('liveProjector') !== '1') return null
    return p.get('presentationId')
  })

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

  //Autosave timer(toggle autosave)
  const [editorHasUnsavedChanges, setEditorHasUnsavedChanges] = useState(false)
  const autosaveTimerRef = useRef<number | null>(null)


  const PAGE_STATE_KEY = 'proslides_page_state'

  //Rydder for autosave 
  const clearAutosaveTimer = () => {
    if (!autosaveTimerRef.current) return
    window.clearTimeout(autosaveTimerRef.current)
    autosaveTimerRef.current = null
  }

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

  const presentationToSummary = (presentation: Record<string, unknown>): PresentationSummary => {
    const slides = Array.isArray(presentation.slides) ? (presentation.slides as LiveSlidePayload[]) : []
    const firstSlide = slides[0]
    const createdRaw = presentation.created_at ?? presentation.createdAt
    const updatedRaw = presentation.updated_at ?? presentation.updatedAt ?? createdRaw
    const fallbackIso = new Date().toISOString()

    return {
      id: String(presentation.id || ''),
      title: String(presentation.title || 'Untitled Presentation'),
      created_at: String(createdRaw || fallbackIso),
      updated_at: String(updatedRaw || fallbackIso),
      slide_count: slides.length,
      first_slide: firstSlide
        ? {
            title: firstSlide.title || 'Lysbilde 1',
            content: firstSlide.content || '',
            notes: firstSlide.notes || '',
            backgroundColor: firstSlide.backgroundColor || '#ffffff',
            previewImage: firstSlide.previewImage,
          }
        : undefined,
    }
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
      notes: slide?.notes || '',
      backgroundColor: slide?.backgroundColor || '#ffffff',
      fabricData: slide?.fabricData || null,
      previewImage: slide?.previewImage || (index === 0 ? presentation?.first_slide?.previewImage : null),
    })),
  })

  // Sjekker om brukeren benytter en mobil enhet basert på skjermstørrelse og touch-mulighet.
  const isMobileDevice = useIsMobileDevice()

  // Aktiverer autosave hvis brukeren er på en ikke-mobil enhet og har åpnet editoren (forutsatt at det ikke allerede er aktivert).
  useEffect(() => {
    clearAutosaveTimer()

    if (!isAutosaveEnabled) return
    if (currentPage !== 'editor') return
    if (isSavingPresentation) return
    if (!editorHasUnsavedChanges) return

    autosaveTimerRef.current = window.setTimeout(() =>{
      void presentationEditorRef.current?.savePresentation?.()
      autosaveTimerRef.current = null
    }, 6000)
    return () => {
      clearAutosaveTimer()
    }
  }, [isAutosaveEnabled, currentPage, isSavingPresentation, editorHasUnsavedChanges])

  useEffect(() => {
  if (!user && !guestMode) return
  savePageState({
    currentPage,
    activePresentationId: activePresentation?.id ?? null,
    livePresentationId,
    liveJoinCode,
    liveIsPresenter,
    guestMode,
  })
}, [currentPage, activePresentation?.id, livePresentationId, liveJoinCode, liveIsPresenter, guestMode, user])

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
  const qrJoinCode = parseLiveJoinCodeFromPath(loc.pathname)

  if (qrJoinCode) {
    try {
      const data = await api.guestJoin(qrJoinCode)
      const presentationId = String(data.presentation_id)
      const nextPage: Page = data.session_started ? 'live' : 'lobby'
      saveSessionState(nextPage, presentationId, null, true, false)
      setLivePresentationId(presentationId)
      setLiveJoinCode(null)
      setLiveIsPresenter(false)
      setGuestMode(true)
      setCurrentPage(nextPage)
      window.history.replaceState({}, '', '/')
      setIsAuthChecking(false)
      return
    } catch {
      setCurrentPage('login')
      setIsAuthChecking(false)
      return
    }
  }

  if (saved?.guestMode) {
    setLivePresentationId(saved.presentationId)
    setLiveIsPresenter(false)
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
      setLiveIsPresenter(Boolean(saved.isPresenter ?? saved.joinCode))
      setCurrentPage(saved.page)
    } else if (savedPage) {
      setLivePresentationId(savedPage.livePresentationId)
      setLiveJoinCode(savedPage.liveJoinCode)
      setLiveIsPresenter(Boolean(savedPage.liveIsPresenter ?? savedPage.liveJoinCode))
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
        notes: '',
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

  // Håndterer åpningen av en eksisterende presentasjon ved å hente data fra backend og navigere til editoren, med tilstandshåndtering for innlastning og feil.
  const handleOpenPresentation = async (presentationId: string) => {
    if (openingPresentationId !== null) return

    setOpeningPresentationId(presentationId)
    setPresentationsError(null)
    
    try {
      const data = await api.getPresentation(presentationId)
      setActivePresentation(data.presentation)
      setIsNewPresentationSession(false)
      setHasSavedCurrentSession(false)
      setCurrentPage('editor')
    } catch {
      setPresentationsError('Kunne ikke åpne presentasjon')
    } finally {
      setOpeningPresentationId(null)
  }
}

  /* 
   * Håndterer lagring av presentasjonen ved å sende oppdaterte data til backend og oppdatere lokal state, 
   * med tilbakemelding til editoren når lagring er fullført. 
   * Navigerer ikke bort fra editoren, da dette kan kalles både fra manuell lagring og autosave.
   */
  const handleSavePresentation = async (payload: Record<string, unknown>) => {
    setIsSavingPresentation(true)
    try {
      const presentationId = (payload.id as string) || activePresentation?.id
      const data = presentationId
        ? await api.updatePresentation(presentationId, payload)
        : await api.createPresentation(payload)

      if (currentPage !== 'editor') {  
      setActivePresentation(data.presentation)
      }
      const summary = presentationToSummary(data.presentation as Record<string, unknown>)
      setPresentations((previous) => {
        const idx = previous.findIndex((item) => item.id === summary.id)
        if (idx === -1) return [summary, ...previous]
        const next = [...previous]
        next[idx] = { ...next[idx], ...summary }
        return next
      })
      setHasSavedCurrentSession(true)
      setIsNewPresentationSession(false)
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

  // Viser dialog for permanent sletting av en presentasjon fra papirkurven, og hvis bekreftet, sletter den for godt.
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
    isGuest: boolean,
    isPresenter: boolean
  ) => {
    sessionStorage.setItem(
      'proslides_session',
      JSON.stringify({
        page,
        presentationId,
        joinCode: joinCode ?? null,
        guestMode: isGuest,
        isPresenter,
      })
    )
  }

  // Fjerner all session-relatert state ved utlogging.
  const clearSessionState = () => sessionStorage.removeItem('proslides_session')

  // Håndterer oppstart av en live presentasjonsøkt ved å kommunisere med backend, sette relevant state og navigere til lobbyen.
  const handleStartLive = async (presentationId: string) => {
    setStartingLivePresentationId(presentationId)
    setPresentationsError(null)
    try {
      const data = await api.startSession(presentationId)
      setLivePresentationId(presentationId)
      setLiveJoinCode(data.join_code)
      setLiveIsPresenter(true)
      saveSessionState('lobby', presentationId, data.join_code, false, true)
      setCurrentPage('lobby')
    } catch {
      setPresentationsError('Kunne ikke starte live-økt')
    } finally {
      setStartingLivePresentationId(null)
    }
  }

  // Håndterer at en gjest blir med i en live presentasjonsøkt ved å sette relevant state og navigere til lobbyen.
  const handleGuestJoin = (presentationId: string | number) => {
    const normalizedPresentationId = String(presentationId)
    saveSessionState('lobby', normalizedPresentationId, null, true, false)
    setLivePresentationId(normalizedPresentationId)
    setLiveJoinCode(null)
    setLiveIsPresenter(false)
    setGuestMode(true)
    setCurrentPage('lobby')
  }

  // Håndterer utlogging ved å rydde all relevant state, både lokalt og i sessionStorage, og navigere til login-siden.
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
    setLiveIsPresenter(false)
    setIsNewPresentationSession(false)
    setHasSavedCurrentSession(false)
    setCurrentPage('login')
  }

  // Håndterer navigering "hjem" fra editoren, med sjekk for usaved changes og visning av dialog for å velge mellom å lagre, forkaste eller avbryte navigering.
  const handleGoHome =  () => {
    if (isSavingPresentation || isDiscardingPresentation) return

    const hasUnsavedChanges = presentationEditorRef.current?.hasUnsavedChanges?.() ?? false
        
    if (currentPage === 'editor' && hasUnsavedChanges) {
      setIsExitEditorDialogOpen(true)
      return
    }
    
    //Eksisterende presentasjon, ingen endringer - bare gå hjem
    setIsExitEditorDialogOpen(false)
    clearSessionState()
    setLiveJoinCode(null)
    setLivePresentationId(null)
    setLiveIsPresenter(false)
    setCurrentPage('home')
  }


  // Håndterer avslutning av en live presentasjonsøkt ved å kommunisere med backend for å avslutte økten, rydde session-relatert state og navigere hjem.
  const handleEndLiveSession = async () => {
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
  }

  // Håndterer oppdatering av brukerens profilnavn ved å sende oppdaterte data til backend og oppdatere lokal state.
  const handleUpdateProfileName = async (name: string) => {
    const data = await api.updateProfile({ name })
    setUser((previous) => ({ ...(previous || {}), ...(data?.user || {}), name }))
  }

  // Håndterer passordendring ved å sende nødvendig data til backend og oppdatere lokal state basert på responsen.
  const handleChangePassword = async (payload: {
    current_password?: string
    password: string
    password_confirmation: string
  }) => {
    const data = await api.changePassword({
      ...payload,
      current_password: payload.current_password ?? '',
    })
    if (data?.user) {
      setUser((previous) => ({ ...(previous || {}), ...data.user }))
    }
  }

  // Håndterer forkasting av en presentasjon og navigering hjem, med sjekk for pågående lagring eller forkasting.
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

  // Håndterer lagring av en presentasjon og navigering hjem, med sjekk for pågående lagring og om det faktisk var noe å lagre.
  const handleSaveAndGoHome = async () => {
    if (isSavingPresentation) return

    const didSave = await presentationEditorRef.current?.savePresentation?.()
    if (!didSave) return 
      
      setIsExitEditorDialogOpen(false)
      clearSessionState()
      setCurrentPage('home')
    
  }

  if (isAuthChecking) {
    if (liveProjectorPresentationId) {
      return <LivePresentationProjectorShell presentationId={liveProjectorPresentationId} />
    }
    return (
      <div className='grid min-h-screen place-items-center bg-background text-foreground'>
        Laster...
      </div>
    )
  }

  if (liveProjectorPresentationId) {
    return <LivePresentationProjectorShell presentationId={liveProjectorPresentationId} />
  }

  if (!user && !guestMode) {
    return <Login onLoginSuccess={handleLoginSuccess} onGuestJoin={handleGuestJoin} />
  }

  if (guestMode) {
    const leaveGuestSession = () => {
      clearSessionState()
      setGuestMode(false)
      setLivePresentationId(null)
      setLiveIsPresenter(false)
      setCurrentPage('login')
      api.logout()
    }

    // Gjestemodus: låst viewport-høyde (som innlogget live) slik at flex-1 og canvas får reell høyde å skalere i.
    return (
      <div className='flex h-dvh max-h-dvh min-h-0 flex-col overflow-hidden bg-background text-foreground'>
        <header className='shrink-0 border-b border-border/70 bg-card/80'>
          <div className='mx-auto flex w-full flex-wrap items-center gap-3 px-4 py-3'>
            <Badge variant='secondary'>Gjest</Badge>
            <span className='min-w-0 flex-1 text-sm text-muted-foreground'>ProSlides gjestemodus</span>
            <div className='ml-auto flex flex-shrink-0 items-center gap-2'>
              <ModeToggle />
              <Button variant='outline' size='sm' className={logoutStyleDestructiveButtonClassName} onClick={leaveGuestSession}>
                <LogOut className='h-4 w-4' />
                Forlat økt
              </Button>
            </div>
          </div>
        </header>

        {/* flex-1 + min-h-0: gir LivePresentation en reell høydebegrensning under live (ikke bare innholdshøyde). */}
        <main className='mx-auto flex min-h-0 w-full flex-1 flex-col px-4 py-4 sm:py-6'>
          {currentPage === 'lobby' ? (
            <div className='mx-auto w-full max-w-4xl'>
              <SessionLobby
                presentationId={livePresentationId}
                joinCode={null}
                isPresenter={false}
                onSessionStarted={() => {
                  saveSessionState('live', livePresentationId, null, true, false)
                  setCurrentPage('live')
                }}
                onSessionEnd={leaveGuestSession}
              />
            </div>
          ) : (
            <div className='flex min-h-0 min-w-0 flex-1 flex-col'>
              {/* Ekstra flex-beholder slik at høyde arves helt ned til LivePresentationCanvas */}
              <LivePresentation
                presentationId={livePresentationId}
                isPresenter={false}
                joinCode={null}
                onEndLiveSession={undefined}
                onSessionEnd={leaveGuestSession}
                onLeaveSession={leaveGuestSession}
              />
            </div>
          )}
        </main>
      </div>
    )
  }

  /*
   Både live-økt og editor har behov for låst viewport-høyde slik at flex-1 og canvas får reell høyde å skalere i,
   mens home og login kan ha vanlig min-h-screen som vokser med innhold.
  */
  const isLiveSessionPage =
    currentPage === 'phoneinteraction' || currentPage === 'lobby' || currentPage === 'live'

  return (
    <div
      className={cn(
        'bg-background text-foreground',
        currentPage === 'editor'
          ? 'flex h-dvh max-h-dvh min-h-0 flex-col overflow-hidden'
          : isLiveSessionPage
            ? isMobileDevice
              ? 'flex min-h-screen flex-col'
              : 'flex h-dvh max-h-dvh min-h-0 flex-col overflow-hidden'
          : 'min-h-screen',)}
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
                autosaveEnabled: isAutosaveEnabled,
                onToggleAutosave: () => setIsAutosaveEnabled((prev) => !prev),
              }
            : null
        }
      />

      <main
        className={cn(
          currentPage === 'editor'
            ? 'mx-auto flex min-h-0 w-full flex-1 flex-col overflow-hidden'
            : isLiveSessionPage
              ? 'flex min-h-0 w-full flex-1 flex-col overflow-hidden py-3'
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
                      className='group relative overflow-hidden border border-border bg-transparent text-card-foreground shadow-none transition-[border-color] duration-200 hover:border-primary/55 dark:border-white/20 dark:hover:border-primary/75'
                    >
                      <div
                        aria-hidden
                        className='pointer-events-none absolute inset-0 z-0 rounded-xl bg-card shadow-sm transition-[box-shadow,background-color] duration-200 dark:bg-[oklch(0.235_0.022_268)] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.07),0_2px_10px_rgba(0,0,0,0.28)] group-hover:bg-accent/45 group-hover:shadow-lg dark:group-hover:bg-[oklch(0.28_0.035_277)] dark:group-hover:shadow-[0_0_0_1px_rgba(167,139,250,0.4),0_6px_22px_rgba(0,0,0,0.38),0_0_28px_rgba(124,58,237,0.18)]'
                      />
                      <CardContent
                        className='relative z-10 space-y-4 rounded-lg p-4 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background'
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
                          <div className='aspect-video w-full overflow-hidden rounded-md border border-border bg-muted/20 dark:border-white/15'>
                            <img
                              src={presentation.first_slide.previewImage}
                              alt={`${presentation.title} forhåndsvisning`}
                              className='h-full w-full object-cover'
                            />
                          </div>
                        ) : (
                          <div className='aspect-video w-full rounded-md border border-border bg-muted/40 p-3 dark:border-white/15'>
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
                            {presentation.slide_count} lysbilde(r)
                          </p>
                          <p className='text-xs text-muted-foreground'>
                            Opprettet {formatPresentationTimestamp(presentation.created_at)}
                          </p>
                          <p className='text-xs text-muted-foreground'>
                            Sist endret{' '}
                            {formatPresentationTimestamp(
                              presentation.updated_at ?? presentation.created_at,
                            )}
                          </p>
                        </div>

                        <div className='grid grid-cols-3 gap-2'>
                          <Button
                            size='sm'
                            variant='outline'
                            className='flex items-center justify-center gap-1.5 transition-colors hover:border-border hover:bg-muted/55 hover:text-foreground dark:hover:bg-muted/35'
                            disabled={deletingPresentationIds[presentation.id] || openingPresentationId !== null}
                            aria-busy={openingPresentationId === presentation.id}
                            onClick={() => void handleOpenPresentation(presentation.id)}
                          >
                            {openingPresentationId === presentation.id ? (
                              <Loader2 className='h-3.5 w-3.5 shrink-0 animate-spin' aria-hidden />
                            ) : (
                              <Pencil className='h-3.5 w-3.5 shrink-0' aria-hidden />
                            )}
                            {openingPresentationId === presentation.id ? 'Redigerer…' : 'Rediger'}
                          </Button>
                          <Button
                            size='sm'
                            variant='outline'
                            className='flex items-center justify-center gap-1.5 border-emerald-500/30 bg-emerald-500/15 text-emerald-500 transition-colors hover:border-emerald-500/45 hover:bg-emerald-500/22 hover:text-emerald-600 dark:hover:bg-emerald-500/14 dark:hover:text-emerald-300'
                            disabled={
                              deletingPresentationIds[presentation.id] ||
                              startingLivePresentationId !== null
                            }
                            aria-busy={startingLivePresentationId === presentation.id}
                            onClick={() => void handleStartLive(presentation.id)}
                          >
                            {startingLivePresentationId === presentation.id ? (
                              <Loader2 className='h-3.5 w-3.5 shrink-0 animate-spin' aria-hidden />
                            ) : (
                              <MonitorPlay className='h-3.5 w-3.5 shrink-0' aria-hidden />
                            )}
                            {startingLivePresentationId === presentation.id ? 'Starter live…' : 'Start live'}
                          </Button>
                          <Button
                            size='sm'
                            variant='outline'
                            className={logoutStyleDestructiveButtonClassName}
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
                              variant='outline'
                              className={logoutStyleDestructiveButtonClassName}
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

        {currentPage === 'polls' && <PollPage onNavigate={(page) => setCurrentPage(page as Page)} user={user} />}

        {currentPage === 'phoneinteraction' && (
          <div className='mx-auto w-full max-w-4xl'>
            <PhoneInteraction
              onJoined={(joined: { presentationId: string; sessionStarted: boolean }) => {
                const { presentationId, sessionStarted } = joined
                setLivePresentationId(presentationId)
                setLiveJoinCode(null)
                setLiveIsPresenter(false)
                const nextPage: Page = sessionStarted ? 'live' : 'lobby'
                saveSessionState(nextPage, presentationId, null, false, false)
                setCurrentPage(nextPage)
              }}
            />
          </div>
        )}

        {currentPage === 'lobby' && (
          <div className='mx-auto w-full max-w-4xl'>
            <SessionLobby
              presentationId={livePresentationId}
              joinCode={liveJoinCode}
              isPresenter={liveIsPresenter}
              onSessionStarted={() => {
                saveSessionState('live', livePresentationId, liveJoinCode, false, liveIsPresenter)
                setCurrentPage('live')
              }}
              onSessionEnd={handleGoHome}
            />
          </div>
        )}

        {currentPage === 'live' && (
          <div className='flex h-full w-full min-h-0 flex-col px-2 sm:px-3'>
            <LivePresentation
              presentationId={livePresentationId}
              isPresenter={liveIsPresenter}
              joinCode={liveJoinCode}
              onEndLiveSession={handleEndLiveSession}
              onSessionEnd={handleGoHome}
              onLeaveSession={liveIsPresenter ? undefined : handleGoHome}
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
            onDirtyChange={setEditorHasUnsavedChanges}
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
                variant='destructive'
                onClick={handleDiscardAndGoHome}
                disabled={isSavingPresentation || isDiscardingPresentation}
                className='flex items-center justify-center gap-1.5'
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
              <Button variant='outline' onClick={confirmDeletePermanently} className={logoutStyleDestructiveButtonClassName}>
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
