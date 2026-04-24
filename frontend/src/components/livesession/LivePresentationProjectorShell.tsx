import { useCallback, useEffect, useMemo, useState } from 'react'
import { Maximize, Minimize } from 'lucide-react'
import { usePresentation } from '../../hooks/usePresentation'
import { exitFullscreenDoc, getFullscreenElement, requestFullscreenEl } from '../../lib/fullscreenDisplay'
import {
  normalizePresentationVariables,
  resolveFabricDataWithVariables,
  resolveTextWithVariables,
  type PresentationVariable,
} from '../../lib/utils'
import api from '../../services/api'
import { Button } from '../ui/button'
import { PresenterSlideViewport, type PresenterSlideData } from './PresenterSlideViewport'
import { usePresenterSlideDeck } from './usePresenterSlideDeck'

type SlideRecord = Record<string, unknown> & {
  background?: Record<string, unknown>
}

type PresentationRecord = {
  id?: string | number
  title: string
  slides: SlideRecord[]
  variables?: PresentationVariable[]
}

type LiveQuestionType = 'single_choice' | 'open_text'
type NormalizedQuestionAggregate = {
  results?: Record<string, number>
  total?: number
  recent_answers?: string[]
  question_type?: LiveQuestionType
}

/**
 * Lettvekts vindu bare for lysbilde (åpnes fra presentatørmenyen).
 * Samme WebSocket som hovedvinduet — fungerer på tvers av nettlesere/OS.
 */
export default function LivePresentationProjectorShell({ presentationId }: { presentationId: string }) {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('auth_token') : null
  const [presentation, setPresentation] = useState<PresentationRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(Boolean(getFullscreenElement()))

  const {
    currentSlide,
    pollResults,
    questionResults,
    navigateSlide,
    liveboardForSlideIndex,
    showLiveboard,
    dismissLiveboard,
    sessionEnded,
    activePoll,
    activeQuestion,
  } = usePresentation(presentationId, token)

  useEffect(() => {
    if (!token) {
      setLoading(false)
      setLoadError('Du er ikke innlogget. Lukk dette vinduet og logg inn i hovedvinduet.')
      return
    }
    const load = async () => {
      try {
        const response = await api.joinPresentation(presentationId)
        setPresentation(response.presentation as PresentationRecord)
        setLoadError(null)
      } catch {
        setLoadError('Kunne ikke laste presentasjonen.')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [presentationId, token])

  useEffect(() => {
    const syncFullscreen = () => setIsFullscreen(Boolean(getFullscreenElement()))
    document.addEventListener('fullscreenchange', syncFullscreen)
    document.addEventListener('webkitfullscreenchange', syncFullscreen)
    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreen)
      document.removeEventListener('webkitfullscreenchange', syncFullscreen)
    }
  }, [])

  useEffect(() => {
    if (!sessionEnded) return
    window.close()
  }, [sessionEnded])

  const rawSlideData = presentation?.slides?.[currentSlide]
  const presentationVariables = normalizePresentationVariables(
    presentation?.variables ||
      ((rawSlideData?.variables as unknown[]) ||
        (rawSlideData?.background as { variables?: unknown[] } | undefined)?.variables ||
        (presentation?.slides?.[0]?.background as { variables?: unknown[] } | undefined)?.variables ||
        []),
  )
  const mergedSlideData = rawSlideData?.background
    ? { ...rawSlideData, ...rawSlideData.background }
    : rawSlideData
  const currentSlideData = (mergedSlideData
    ? {
        ...mergedSlideData,
        title: resolveTextWithVariables(mergedSlideData.title, presentationVariables),
        content: resolveTextWithVariables(mergedSlideData.content, presentationVariables),
        fabricData: resolveFabricDataWithVariables(mergedSlideData.fabricData, presentationVariables),
      }
    : mergedSlideData) as PresenterSlideData

  const normalizedQuestionResults = useMemo<Record<string, NormalizedQuestionAggregate>>(() => {
    const entries = Object.entries(questionResults).map(([questionId, aggregate]) => {
      const rawType = aggregate?.question_type
      const normalizedType: LiveQuestionType | undefined =
        rawType === 'single_choice' || rawType === 'open_text' ? rawType : undefined

      return [
        questionId,
        {
          ...aggregate,
          question_type: normalizedType,
        },
      ] as const
    })

    return Object.fromEntries(entries)
  }, [questionResults])

  const {
    handleNextSlide,
    handlePrevSlide,
    navCanGoNext,
    navCanGoPrev,
    inLiveboardPhase,
    offerLiveboard,
    slideCount,
  } = usePresenterSlideDeck({
    presentation,
    currentSlide,
    currentSlideData,
    navigateSlide,
    liveboardForSlideIndex,
    showLiveboard,
    dismissLiveboard,
    pollResults,
    questionResults: normalizedQuestionResults,
    activePoll,
    activeQuestion,
  })

  useEffect(() => {
    if (!presentation) return

    const isTypingTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false
      if (target.isContentEditable) return true
      const tag = target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
      if (target.closest('button, [href], input, textarea, select, [contenteditable="true"]')) return true
      return false
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return
      if (e.repeat && (e.code === 'ArrowRight' || e.code === 'ArrowLeft' || e.code === 'Space')) return

      if (e.code === 'ArrowRight' || e.code === 'Space') {
        const canAdvance =
          presentation &&
          (currentSlide < slideCount - 1 ||
            (currentSlide === slideCount - 1 && !inLiveboardPhase && offerLiveboard))
        if (canAdvance) {
          e.preventDefault()
          handleNextSlide()
        }
      } else if (e.code === 'ArrowLeft') {
        if (inLiveboardPhase || currentSlide > 0) {
          e.preventDefault()
          handlePrevSlide()
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    presentation,
    currentSlide,
    slideCount,
    inLiveboardPhase,
    offerLiveboard,
    handleNextSlide,
    handlePrevSlide,
  ])

  const tryClose = useCallback(() => {
    window.close()
  }, [])

  const toggleFullscreen = useCallback(async () => {
    try {
      if (getFullscreenElement()) {
        await exitFullscreenDoc()
        return
      }
      await requestFullscreenEl(document.documentElement, { navigationUI: 'hide' })
    } catch {
      // Ignore fullscreen errors (blocked by browser policy/user gesture requirements).
    }
  }, [])

  if (!token || loadError) {
    return (
      <div className='flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center text-foreground'>
        <p className='max-w-md text-sm text-muted-foreground'>{loadError || 'Ingen tilgang.'}</p>
        <Button type='button' variant='outline' onClick={tryClose}>
          Lukk vindu
        </Button>
      </div>
    )
  }

  if (loading || !presentation) {
    return (
      <div className='flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground'>
        Laster lysbildevindu…
      </div>
    )
  }

  return (
    <div className='relative h-screen w-full overflow-hidden bg-background text-foreground'>
      <div className='pointer-events-none absolute right-3 top-3 z-20'>
        <Button
          type='button'
          variant='secondary'
          size='sm'
          className={
            'group pointer-events-auto gap-2 overflow-hidden border-border bg-card text-foreground shadow-sm hover:bg-accent hover:text-accent-foreground dark:border-secondary dark:bg-secondary dark:text-secondary-foreground dark:shadow-none dark:hover:bg-secondary/85 dark:hover:text-secondary-foreground transition-[width,padding] duration-200 ' +
            (isFullscreen ? 'h-9 w-9 px-0 hover:w-44 hover:px-3 focus-visible:w-44 focus-visible:px-3' : 'h-9 px-3')
          }
          onClick={() => void toggleFullscreen()}
          title={isFullscreen ? 'Avslutt fullskjerm' : 'Fullskjerm'}
          aria-label={isFullscreen ? 'Avslutt fullskjerm' : 'Fullskjerm'}
        >
          {isFullscreen ? <Minimize className='h-4 w-4' aria-hidden /> : <Maximize className='h-4 w-4' aria-hidden />}
          <span
            className={
              'whitespace-nowrap text-xs ' +
              (isFullscreen
                ? 'max-w-0 translate-x-1 opacity-0 transition-all duration-200 group-hover:max-w-40 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:max-w-40 group-focus-visible:translate-x-0 group-focus-visible:opacity-100'
                : 'max-w-40 opacity-100')
            }
          >
            {isFullscreen ? 'Avslutt fullskjerm' : 'Fullskjerm'}
          </span>
        </Button>
      </div>
      <main className='h-full w-full overflow-hidden'>
        <PresenterSlideViewport
          currentSlideData={currentSlideData}
          inLiveboardPhase={inLiveboardPhase}
          sessionEnded={sessionEnded}
          pollResults={pollResults}
          questionResults={normalizedQuestionResults}
          onPrev={handlePrevSlide}
          onNext={handleNextSlide}
          canPrev={navCanGoPrev}
          canNext={navCanGoNext}
          navControlsMode='hover'
          className='h-full w-full'
        />
      </main>
    </div>
  )
}
