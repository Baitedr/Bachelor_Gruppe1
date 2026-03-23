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
  }>
}

type TrashItem = {
  id: string
  presentation: PresentationSummary
  deletedAt: string
}

const MOBILE_BREAKPOINT = 768
const DELETE_UNDO_TIMEOUT_MS = 10_000

function App() {
  const [presentations, setPresentations] = useState<PresentationSummary[]>([])
  const [deletingPresentationIds, setDeletingPresentationIds] = useState<Record<string, boolean>>({})
  const [trashedPresentations, setTrashedPresentations] = useState<TrashItem[]>([])
  const [deleteUndoToast, setDeleteUndoToast] = useState<{ trashId: string; title: string } | null>(null)
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

  const undoToastTimerRef = useRef<number | null>(null)

  const presentationEditorRef = useRef<PresentationEditorHandle | null>(null)

  const clearUndoToastTimer = () => {
    if (!undoToastTimerRef.current) return
    window.clearTimeout(undoToastTimerRef.current)
    undoToastTimerRef.current = null
  }

  // Hjelpefunksjon for å generere en "clean" payload når vi gjenoppretter en presentasjon fra papirkurven.
  const toRestorablePresentationPayload = (presentation: PresentationSummary) => ({
    title: presentation?.title || 'Gjenopprettet presentasjon',
    slides: (presentation?.slides || []).map((slide, index) => ({
      title: slide?.title || `Lysbilde ${index + 1}`,
      content: slide?.content || '',
      backgroundColor: slide?.backgroundColor || '#ffffff',
      fabricData: slide?.fabricData || null,
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
    // Sjekker om det finnes en aktiv økt eller token ved oppstart
    const restoreSession = async () => {
      const savedRaw = sessionStorage.getItem('proslides_session')
      const saved = savedRaw ? JSON.parse(savedRaw) : null

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

  useEffect(() => {
    return () => clearUndoToastTimer()
  }, [])

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

      setTrashedPresentations((previous) => [trashedItem, ...previous])
      setDeleteUndoToast({
        trashId,
        title: restorablePresentation?.title || 'Presentasjon',
      })

      clearUndoToastTimer()
      undoToastTimerRef.current = window.setTimeout(() => {
        setDeleteUndoToast(null)
        undoToastTimerRef.current = null
      }, DELETE_UNDO_TIMEOUT_MS)

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

      if (deleteUndoToast?.trashId === trashId) {
        clearUndoToastTimer()
        setDeleteUndoToast(null)
      }

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

    if (deleteUndoToast?.trashId === trashId) {
      clearUndoToastTimer()
      setDeleteUndoToast(null)
    }

    setPermanentDeleteDialog(null)
  }

  const dismissDeleteUndoToast = () => {
    clearUndoToastTimer()
    setDeleteUndoToast(null)
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
    clearUndoToastTimer()
    clearSessionState()
    setUser(null)
    setPresentations([])
    setTrashedPresentations([])
    setDeleteUndoToast(null)
    setActivePresentation(null)
    setIsNewPresentationSession(false)
    setHasSavedCurrentSession(false)
    setCurrentPage('login')
  }

  const handleGoHome = async () => {
    if (currentPage === 'editor') {
      const hasUnsavedChanges = presentationEditorRef.current?.hasUnsavedChanges?.() ?? false
        

      // Hvis bruker endret på noe så blir det vist en dialog box
      if (!hasUnsavedChanges) {
        setIsExitEditorDialogOpen(true)
        return
      }

      //Hvis det er en ny presentasjon som aldri blir gjort noe med - forkast
      if (isNewPresentationSession && !hasSavedCurrentSession && activePresentation?.id) {
        await handleDiscardAndGoHome()
        return
      }

      clearSessionState()
        setCurrentPage('home');
        return
    }

    //Eksisterende presentasjon, ingen endringer - bare gå hjem
    clearSessionState()
    setLiveJoinCode(null)
    setLivePresentationId(null)
    setCurrentPage('home')
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
    if (didSave) {
      setIsExitEditorDialogOpen(false)
      clearSessionState()
      setCurrentPage('home')
    }
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
    <div className='min-h-screen bg-background text-foreground'>
      <Navbar
        currentPage={currentPage}
        userEmail={user?.email}
        onGoHome={handleGoHome}
        onJoinLive={() => setCurrentPage('phoneinteraction')}
        onLogout={handleLogout}
      />

      <main className='mx-auto w-full px-4 py-6'>
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
                    <Card key={presentation.id} className='border-border/70'>
                      <CardContent className='space-y-4 p-4'>
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
                          <div className='min-w-0 flex-1'>
                            <p className='line-clamp-1 text-sm font-medium'>
                              {trashedItem.presentation?.title || 'Uten navn'}
                            </p>
                            <p className='text-xs text-muted-foreground'>
                              Slettet {new Date(trashedItem.deletedAt).toLocaleTimeString()}
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
          />
        )}
      </main>

      {deleteUndoToast && (
        <Card className='fixed bottom-4 right-4 z-50 w-[min(92vw,420px)] border-border/70 shadow-xl'>
          <CardContent className='flex flex-wrap items-center gap-3 p-4'>
            <p className='text-sm'>Slettet "{deleteUndoToast.title}".</p>
            <div className='ml-auto flex gap-2'>
              <Button size='sm' variant='outline' onClick={() => handleRestorePresentation(deleteUndoToast.trashId)}>
                Angre
              </Button>
              <Button size='sm' variant='ghost' onClick={dismissDeleteUndoToast}>
                Lukk
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

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
