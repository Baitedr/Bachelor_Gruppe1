import { useCallback, useEffect, useMemo, useState } from 'react'
import { LogOut, MonitorUp, ZoomIn, ZoomOut } from 'lucide-react'
import { logoutStyleDestructiveButtonClassName } from '@/lib/utils'
import {
  getPresenterScreenChoices,
  openLiveProjectorWindow,
  type PresenterScreenChoice,
} from '@/lib/fullscreenDisplay'
import { Badge } from '../../ui/badge'
import { Button } from '../../ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card'
import { PresenterSlideViewport, type PresenterSlideData } from '../PresenterSlideViewport'
import type { SlideEmbedLiveContext } from '../../SlideEmbedOverlays'
import { usePresenterSlideDeck } from '../usePresenterSlideDeck'

const NOTES_ZOOM_MIN = 75
const NOTES_ZOOM_MAX = 160
const NOTES_ZOOM_STEP = 10

type PresentationRecord = {
  id?: string | number
  title: string
  slides: unknown[]
}

type PollAggregate = { results?: Record<string, number>; total?: number }
type QuestionAggregate = {
  results?: Record<string, number>
  total?: number
  recent_answers?: string[]
  question_type?: string
}

/**
 * Presenter live session: slide + Fabric liveboard mirror, tools sidebar, speaker notes.
 * Slide changes go through `navigateSlide` (ActionCable); same hook as audience.
 */
const LivePresentationPresenter = ({
  presentation,
  joinCode,
  onEndLiveSession,
  participantCount,
  currentSlide,
  currentSlideData,
  navigateSlide,
  liveboardForSlideIndex,
  showLiveboard,
  dismissLiveboard,
  activePoll,
  activeQuestion,
  activatePoll,
  activateQuestion,
  pollResults,
  questionResults,
  sessionEnded,
  embedLive,
}: {
  presentation: PresentationRecord
  joinCode: string | null
  onEndLiveSession?: () => void
  participantCount: number
  currentSlide: number
  currentSlideData: PresenterSlideData
  navigateSlide: (index: number, options?: { resumeLiveboard?: boolean }) => void
  liveboardForSlideIndex: number | null
  showLiveboard: (slideIndex: number) => void
  dismissLiveboard: () => void
  activePoll: unknown
  activeQuestion: unknown
  activatePoll: (pollId: string | number) => void
  activateQuestion: (questionId: string | number) => void
  pollResults: Record<string, PollAggregate>
  questionResults: Record<string, QuestionAggregate>
  sessionEnded: boolean
  embedLive: SlideEmbedLiveContext
}) => {
  const [notesZoomPercent, setNotesZoomPercent] = useState(100)
  const [screenChoices, setScreenChoices] = useState<PresenterScreenChoice[]>([])

  const {
    handleNextSlide,
    handlePrevSlide,
    navCanGoNext,
    navCanGoPrev,
    inLiveboardPhase,
    offerLiveboard,
  } = usePresenterSlideDeck({
    presentation,
    currentSlide,
    currentSlideData,
    navigateSlide,
    liveboardForSlideIndex,
    showLiveboard,
    dismissLiveboard,
    pollResults,
    questionResults,
    activePoll,
    activeQuestion,
  })

  useEffect(() => {
    void getPresenterScreenChoices().then(setScreenChoices)
  }, [])

  const onOpenProjectorWindow = useCallback(() => {
    const pid = presentation?.id
    if (pid == null) return

    const externalChoice = screenChoices.find((choice) => {
      const anyScreen = choice.screen as (Screen & { isInternal?: boolean }) | null
      return anyScreen?.isInternal === false
    })
    const selectedChoice: PresenterScreenChoice =
      externalChoice ??
      screenChoices[0] ?? {
        id: 'fallback-current',
        label: 'Skjermen der nettleservinduet er',
        screen: null,
        availLeft: window.screen.availLeft,
        availTop: window.screen.availTop,
        availWidth: window.screen.availWidth,
        availHeight: window.screen.availHeight,
      }
    openLiveProjectorWindow(String(pid), selectedChoice)
  }, [presentation?.id, screenChoices])

  const presenterNotes = (currentSlideData?.notes || '').trim()

  const slideViewportProps = useMemo(
    () => ({
      currentSlideData,
      inLiveboardPhase,
      sessionEnded,
      pollResults,
      questionResults,
      onPrev: handlePrevSlide,
      onNext: handleNextSlide,
      canPrev: navCanGoPrev,
      canNext: navCanGoNext,
      embedLive,
    }),
    [
      currentSlideData,
      inLiveboardPhase,
      sessionEnded,
      pollResults,
      questionResults,
      handlePrevSlide,
      handleNextSlide,
      navCanGoPrev,
      navCanGoNext,
      embedLive,
    ],
  )

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

      const slideCount = presentation.slides.length
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
    inLiveboardPhase,
    offerLiveboard,
    handleNextSlide,
    handlePrevSlide,
  ])

  const slideCount = presentation.slides.length

  return (
    <div className='flex h-full min-h-0 min-w-0 flex-col gap-3'>
      <Card className='flex min-h-0 flex-1 flex-col overflow-visible'>
        <CardHeader
          className={
            'border-b-2 border-border bg-card/85 px-3 pb-2 pt-3 shadow-sm backdrop-blur-[2px] sm:px-4 dark:border-border dark:bg-transparent dark:shadow-none dark:backdrop-blur-none ' +
            (joinCode
              ? 'grid grid-cols-1 gap-2 lg:grid-cols-[minmax(0,auto)_minmax(0,1fr)_auto] lg:items-center lg:gap-x-4'
              : 'flex flex-row flex-wrap items-center justify-between gap-3 pb-2')
          }
        >
          <div className='flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1'>
            <CardTitle className='text-xl'>{presentation.title}</CardTitle>
            <p className='whitespace-nowrap text-sm text-muted-foreground'>
              Lysbilde {currentSlide + 1} av {slideCount}
            </p>
          </div>
          {joinCode && (
            <p className='flex min-w-0 items-center justify-center gap-1.5 text-center text-sm leading-none lg:px-2'>
              <span className='shrink-0 font-medium text-foreground/85'>Live-kode:</span>
              <span className='truncate rounded-md bg-muted/70 px-2 py-0.5 font-mono text-sm font-semibold tracking-wide text-foreground ring-1 ring-border dark:bg-muted/50'>
                {joinCode}
              </span>
            </p>
          )}
          <div className='flex flex-shrink-0 flex-wrap items-center gap-2 lg:justify-self-end'>
            <Button type='button' variant='outline' size='sm' className='gap-2' onClick={onOpenProjectorWindow}>
              <MonitorUp className='h-4 w-4' aria-hidden />
              Projektorvindu
            </Button>
            <div className='inline-flex items-center gap-2 rounded-lg border border-border bg-muted/55 px-2.5 py-1 shadow-sm dark:bg-muted/35'>
              <span className='text-sm font-semibold text-foreground'>Deltakere</span>
              <span className='min-w-[1.5rem] rounded-md bg-background px-2 py-0.5 text-center text-sm font-bold tabular-nums text-foreground ring-1 ring-border dark:bg-card'>
                {participantCount}
              </span>
            </div>
            {joinCode && onEndLiveSession && (
              <Button variant='outline' size='sm' className={logoutStyleDestructiveButtonClassName} onClick={() => onEndLiveSession()}>
                <LogOut className='h-4 w-4' aria-hidden />
                Avslutt økt
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className='flex min-h-0 flex-1 flex-col px-2 pb-2 pt-3 sm:px-3 sm:pb-3 sm:pt-4'>
          <div className='grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_clamp(272px,28vw,400px)] lg:gap-5 xl:gap-6'>
            <div className='relative flex min-h-0 h-full min-w-0 flex-col overflow-visible'>
              <PresenterSlideViewport {...slideViewportProps} />
            </div>
            <aside className='flex h-full min-h-0 w-full min-w-0 flex-col gap-3 sm:gap-3.5 lg:gap-4'>
              <div className='max-h-[min(50%,22rem)] shrink-0 overflow-y-auto rounded-lg border border-border bg-card p-3 shadow-sm'>
                <div className='mb-2 flex items-center justify-between'>
                  <h3 className='text-sm font-semibold text-foreground'>Spørsmål og verktøy</h3>
                  <span className='rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary'>Live</span>
                </div>
                <div className='space-y-2 pr-1'>
                  {currentSlideData?.polls?.map((poll) => (
                    <div
                      key={poll.id}
                      className='space-y-2 rounded-lg border border-border bg-muted/45 p-2.5 shadow-sm dark:border-border dark:bg-muted/25 dark:shadow-none'
                    >
                      <Button
                        className='h-auto w-full justify-start whitespace-normal break-words bg-primary/10 py-2 text-left leading-snug text-primary hover:bg-primary/20'
                        variant='ghost'
                        onClick={() => activatePoll(poll.id)}
                      >
                        Aktiver avstemning: {poll.question}
                      </Button>
                      {pollResults[String(poll.id)] && (
                        <div className='space-y-1 text-sm'>
                          <p className='font-medium'>Resultater ({pollResults[String(poll.id)].total} stemmer)</p>
                          {Object.entries(pollResults[String(poll.id)].results || {}).map(([answer, count]) => (
                            <p key={answer} className='text-muted-foreground'>
                              {answer}: {count}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}

                  {currentSlideData?.questions?.map((question) => {
                    const result = questionResults[String(question.id)]
                    const total = result?.total || 0
                    const questionType = result?.question_type || question.type || 'open_text'

                    return (
                      <div
                        key={question.id}
                        className='space-y-2 rounded-lg border border-border bg-muted/45 p-2.5 shadow-sm dark:border-border dark:bg-muted/25 dark:shadow-none'
                      >
                        <Button
                          className='h-auto w-full justify-start whitespace-normal break-words bg-primary/10 py-2 text-left leading-snug text-primary hover:bg-primary/20'
                          variant='ghost'
                          onClick={() => activateQuestion(question.id)}
                        >
                          Aktiver spørsmål: {question.prompt}
                        </Button>

                        {result && (
                          <div className='space-y-1 text-sm'>
                            <p className='font-medium'>Resultater ({total} svar)</p>
                            {questionType === 'single_choice' ? (
                              (question.options || []).map((option) => {
                                const count = result.results?.[option.text] || 0
                                const percent = total > 0 ? Math.round((count / total) * 100) : 0

                                return (
                                  <p key={option.id} className='text-muted-foreground'>
                                    {option.text}: {count} ({percent}%)
                                  </p>
                                )
                              })
                            ) : (
                              <div className='space-y-2'>
                                {(result.recent_answers || []).slice(-5).map((answer, index) => (
                                  <p
                                    key={`${question.id}-${index}`}
                                    className='rounded-md border border-border bg-muted/50 px-3 py-2 text-sm font-medium leading-snug text-foreground'
                                  >
                                    {answer}
                                  </p>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {!currentSlideData?.polls?.length && !currentSlideData?.questions?.length && (
                    <p className='text-sm text-muted-foreground'>Ingen spørsmål eller avstemninger på dette lysbildet.</p>
                  )}
                </div>
              </div>
              <div className='flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm'>
                <div className='shrink-0 border-b border-border px-3 py-2.5'>
                  <div className='flex items-center justify-between gap-2'>
                    <h3 className='min-w-0 text-base font-bold leading-tight tracking-tight text-foreground'>Notater</h3>
                    <div
                      className='flex shrink-0 items-center gap-0.5 rounded-md border border-border bg-background/90 p-0.5 shadow-sm backdrop-blur-sm'
                      role='group'
                      aria-label='Tekststorrelse for notater'
                    >
                      <Button
                        type='button'
                        variant='ghost'
                        size='icon'
                        className='h-7 w-7 text-foreground'
                        onClick={() => setNotesZoomPercent((z) => Math.max(NOTES_ZOOM_MIN, z - NOTES_ZOOM_STEP))}
                        disabled={notesZoomPercent <= NOTES_ZOOM_MIN}
                        aria-label='Zoom ut notater'
                      >
                        <ZoomOut className='h-3.5 w-3.5' aria-hidden />
                      </Button>
                      <Badge
                        variant='secondary'
                        className='h-7 min-w-[2.75rem] justify-center rounded-sm px-1.5 font-mono text-[10px] tabular-nums'
                      >
                        {notesZoomPercent}%
                      </Badge>
                      <Button
                        type='button'
                        variant='ghost'
                        size='icon'
                        className='h-7 w-7 text-foreground'
                        onClick={() => setNotesZoomPercent((z) => Math.min(NOTES_ZOOM_MAX, z + NOTES_ZOOM_STEP))}
                        disabled={notesZoomPercent >= NOTES_ZOOM_MAX}
                        aria-label='Zoom inn notater'
                      >
                        <ZoomIn className='h-3.5 w-3.5' aria-hidden />
                      </Button>
                    </div>
                  </div>
                </div>
                <div className='min-h-0 flex-1 overflow-y-auto p-3 text-sm'>
                  {presenterNotes ? (
                    <p
                      className='whitespace-pre-wrap leading-relaxed text-foreground dark:text-white'
                      style={{ fontSize: `${notesZoomPercent}%` }}
                    >
                      {presenterNotes}
                    </p>
                  ) : (
                    <p className='text-sm italic text-foreground/80'>Ingen notater for dette lysbildet.</p>
                  )}
                </div>
              </div>
            </aside>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default LivePresentationPresenter
