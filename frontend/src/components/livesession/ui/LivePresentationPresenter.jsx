import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, LogOut, ZoomIn, ZoomOut } from 'lucide-react'
import { logoutStyleDestructiveButtonClassName } from '@/lib/utils'
import { Badge } from '../../ui/badge'
import { Button } from '../../ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card'
import LivePresentationCanvas from '../LivePresentationCanvas'
import LiveResultsBoard from './LiveResultsBoard'

const NOTES_ZOOM_MIN = 75
const NOTES_ZOOM_MAX = 160
const NOTES_ZOOM_STEP = 10

/** Ligger over lysbilde/liveboard; variant «liveboard» = annen tekst (samme steg som «hopp over resultat»). */
const PresenterSlideNavToolbar = ({ onPrev, onNext, canPrev, canNext, variant = 'slide' }) => {
  const prevLabel = variant === 'liveboard' ? 'Tilbake til lysbilde' : 'Forrige lysbilde'
  const nextLabel = 'Neste lysbilde'
  return (
    <div
      role='toolbar'
      aria-label='Lysbilde navigasjon'
      className='absolute bottom-2 left-2 z-10 flex items-center gap-px rounded-full border border-white/20 bg-black/55 p-0.5 shadow-md backdrop-blur-md dark:border-white/25 dark:bg-black/65'
    >
      <Button
        type='button'
        variant='ghost'
        size='icon'
        className='h-8 w-8 shrink-0 rounded-full border-0 bg-transparent p-0 text-white shadow-none hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white/45 focus-visible:ring-offset-0 disabled:pointer-events-none disabled:opacity-30'
        onClick={onPrev}
        disabled={!canPrev}
        aria-label={prevLabel}
      >
        <ChevronLeft className='h-4.5 w-4.5' strokeWidth={2} aria-hidden />
      </Button>
      <Button
        type='button'
        variant='ghost'
        size='icon'
        className='h-8 w-8 shrink-0 rounded-full border-0 bg-transparent p-0 text-white shadow-none hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white/45 focus-visible:ring-offset-0 disabled:pointer-events-none disabled:opacity-30'
        onClick={onNext}
        disabled={!canNext}
        aria-label={nextLabel}
      >
        <ChevronRight className='h-4.5 w-4.5' strokeWidth={2} aria-hidden />
      </Button>
    </div>
  )
}

const slideHasInteractiveTools = (slideData) =>
  Boolean(slideData && ((slideData.polls?.length || 0) > 0 || (slideData.questions?.length || 0) > 0))

/** Sant hvis noe er aktivert eller det finnes minst ett svar på dette lysbildet. */
const slideHasEngagement = (slideData, pollResults, questionResults, activePoll, activeQuestion) => {
  if (activePoll || activeQuestion) return true
  if (!slideData) return false
  for (const p of slideData.polls || []) {
    if ((pollResults[p.id]?.total || 0) > 0) return true
  }
  for (const q of slideData.questions || []) {
    if ((questionResults[q.id]?.total || 0) > 0) return true
  }
  return false
}

/**
 * LiveResultsBoard bruker egen usePresentation; type poll/question + initialItemId fordi «both» krever aktiv poll/spørsmål.
 * Ytre beholder uten ekstra tema — kortet i LiveResultsBoard styrer utseendet.
 */
const PresenterLiveboardPanel = ({ presentationId, currentSlideData, onPrev, onNext, canPrev, canNext }) => (
  <div className='relative flex h-full min-h-0 w-full flex-col'>
    <div className='min-h-0 flex-1 overflow-y-auto p-4'>
      <div className='flex w-full flex-col gap-4'>
        {(currentSlideData?.polls || []).map((poll) => (
          <LiveResultsBoard
            key={`lb-poll-${poll.id}`}
            presentationId={presentationId}
            initialType='poll'
            initialItemId={poll.id}
          />
        ))}
        {(currentSlideData?.questions || []).map((question) => (
          <LiveResultsBoard
            key={`lb-q-${question.id}`}
            presentationId={presentationId}
            initialType='question'
            initialItemId={question.id}
          />
        ))}
      </div>
    </div>
    <PresenterSlideNavToolbar
      variant='liveboard'
      onPrev={onPrev}
      onNext={onNext}
      canPrev={canPrev}
      canNext={canNext}
    />
  </div>
)

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
}) => {
  const [notesZoomPercent, setNotesZoomPercent] = useState(100)
  /** Lysbildeindekser brukeren har forlatt via «neste» fra resultatsiden — da skal tilbake fra neste lysbilde åpne liveboard igjen. */
  const slidesAdvancedFromLiveboardRef = useRef(new Set())

  const slideCount = presentation.slides.length
  /** Synket med publikum via ActionCable (samme som liveboardForSlideIndex i hook). */
  const inLiveboardPhase =
    liveboardForSlideIndex != null && Number(liveboardForSlideIndex) === Number(currentSlide)

  const offerLiveboard = useMemo(
    () =>
      slideHasInteractiveTools(currentSlideData) &&
      slideHasEngagement(currentSlideData, pollResults, questionResults, activePoll, activeQuestion),
    [currentSlideData, pollResults, questionResults, activePoll, activeQuestion],
  )

  const handleNextSlide = useCallback(() => {
    if (!presentation) return

    // På siste lysbilde: etter resultatside (liveboard) finnes ingen «neste lysbilde».
    if (currentSlide >= slideCount - 1 && inLiveboardPhase) return

    if (inLiveboardPhase) {
      slidesAdvancedFromLiveboardRef.current.add(Number(currentSlide))
      navigateSlide(currentSlide + 1)
      return
    }

    if (offerLiveboard) {
      showLiveboard(currentSlide)
      return
    }

    if (currentSlide < slideCount - 1) {
      navigateSlide(currentSlide + 1)
    }
  }, [
    presentation,
    slideCount,
    currentSlide,
    inLiveboardPhase,
    offerLiveboard,
    navigateSlide,
    showLiveboard,
  ])

  const handlePrevSlide = useCallback(() => {
    if (inLiveboardPhase) {
      slidesAdvancedFromLiveboardRef.current.delete(Number(currentSlide))
      dismissLiveboard()
      return
    }
    if (currentSlide > 0) {
      const prevIdx = currentSlide - 1
      if (slidesAdvancedFromLiveboardRef.current.has(prevIdx)) {
        navigateSlide(prevIdx, { resumeLiveboard: true })
      } else {
        navigateSlide(prevIdx)
      }
    }
  }, [inLiveboardPhase, currentSlide, navigateSlide, dismissLiveboard])

  const navCanGoNext =
    currentSlide < slideCount - 1 ||
    (currentSlide === slideCount - 1 && !inLiveboardPhase && offerLiveboard)
  const navCanGoPrev = inLiveboardPhase || currentSlide > 0

  useEffect(() => {
    if (!presentation) return

    const isTypingTarget = (target) => {
      if (!(target instanceof HTMLElement)) return false
      if (target.isContentEditable) return true
      const tag = target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
      if (target.closest('button, [href], input, textarea, select, [contenteditable="true"]')) return true
      return false
    }

    const onKeyDown = (e) => {
      if (isTypingTarget(e.target)) return
      // Unngår dobbel navigasjon når tasten holdes inne (gjentakelse).
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

  const presenterNotes = (currentSlideData?.notes || '').trim()

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
          {/* Deltakertelling: tydelig kant og kontrast i lyst modus (ikke bare bg-secondary). */}
          <div className='flex flex-shrink-0 flex-wrap items-center gap-2 lg:justify-self-end'>
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
              {currentSlideData ? (
                inLiveboardPhase ? (
                  <div className='min-h-0 w-full min-w-0 flex-1 overflow-hidden rounded-lg bg-card shadow-[0_22px_50px_-12px_rgba(15,23,42,0.28),0_10px_28px_-8px_rgba(15,23,42,0.14),0_2px_8px_-2px_rgba(15,23,42,0.08)] dark:shadow-[0_24px_56px_-10px_rgba(0,0,0,0.65),0_12px_32px_-8px_rgba(0,0,0,0.45)]'>
                    <PresenterLiveboardPanel
                      presentationId={presentation.id}
                      currentSlideData={currentSlideData}
                      onPrev={handlePrevSlide}
                      onNext={handleNextSlide}
                      canPrev={navCanGoPrev}
                      canNext={navCanGoNext}
                    />
                  </div>
                ) : currentSlideData.fabricData ? (
                  <div className='flex min-h-0 h-full min-w-0 flex-1 flex-col overflow-visible'>
                    <LivePresentationCanvas
                      slideData={currentSlideData}
                      presenterToolbar={
                        <PresenterSlideNavToolbar
                          onPrev={handlePrevSlide}
                          onNext={handleNextSlide}
                          canPrev={navCanGoPrev}
                          canNext={navCanGoNext}
                        />
                      }
                    />
                  </div>
                ) : (
                  <div className='flex w-full min-h-0 flex-1 flex-col items-center justify-center'>
                    <div className='relative w-full max-w-3xl rounded-lg bg-card px-4 py-8 text-center shadow-[0_22px_50px_-12px_rgba(15,23,42,0.28),0_10px_28px_-8px_rgba(15,23,42,0.14),0_2px_8px_-2px_rgba(15,23,42,0.08)] dark:shadow-[0_24px_56px_-10px_rgba(0,0,0,0.65),0_12px_32px_-8px_rgba(0,0,0,0.45)]'>
                      {currentSlideData.title && (
                        <h2 className='text-3xl font-bold mb-6 text-foreground'>{currentSlideData.title}</h2>
                      )}
                      {currentSlideData.content && (
                        <div className='text-xl whitespace-pre-wrap text-foreground'>{currentSlideData.content}</div>
                      )}
                      {!currentSlideData.title && !currentSlideData.content && (
                        <p className='text-sm text-muted-foreground'>Dette lysbildet er tomt.</p>
                      )}
                      <PresenterSlideNavToolbar
                        onPrev={handlePrevSlide}
                        onNext={handleNextSlide}
                        canPrev={navCanGoPrev}
                        canNext={navCanGoNext}
                      />
                    </div>
                  </div>
                )
              ) : (
                <div className='flex h-full min-h-[12rem] w-full items-center justify-center rounded-lg border border-dashed border-border/60 p-6'>
                  <p className='text-sm text-muted-foreground'>Ingen data for dette lysbildet.</p>
                </div>
              )}
            </div>
            <aside className='flex h-full min-h-0 w-full min-w-0 flex-col gap-3 sm:gap-3.5 lg:gap-4'>
              <div className='max-h-[min(50%,22rem)] shrink-0 overflow-y-auto rounded-lg border border-border bg-card p-3 shadow-sm'>
                <div className='mb-2 flex items-center justify-between'>
                  <h3 className='text-sm font-semibold text-foreground'>Spørsmål og verktøy</h3>
                  <span className='rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary'>
                    Live
                  </span>
                </div>
                <div className='space-y-2 pr-1'>
                  {currentSlideData?.polls?.map((poll) => (
                    <div
                      key={poll.id}
                      className='space-y-2 rounded-lg border border-border bg-muted/45 p-2.5 shadow-sm dark:border-border dark:bg-muted/25 dark:shadow-none'
                    >
                      <Button
                        className='h-auto w-full justify-start whitespace-normal break-words py-2 text-left leading-snug bg-primary/10 text-primary hover:bg-primary/20'
                        variant='ghost'
                        onClick={() => activatePoll(poll.id)}
                      >
                        Aktiver avstemning: {poll.question}
                      </Button>
                      {pollResults[poll.id] && (
                        <div className='space-y-1 text-sm'>
                          <p className='font-medium'>Resultater ({pollResults[poll.id].total} stemmer)</p>
                          {Object.entries(pollResults[poll.id].results).map(([answer, count]) => (
                            <p key={answer} className='text-muted-foreground'>
                              {answer}: {count}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}

                  {currentSlideData?.questions?.map((question) => {
                    const result = questionResults[question.id]
                    const total = result?.total || 0
                    const questionType = result?.question_type || question.type || 'open_text'

                    return (
                      <div
                        key={question.id}
                        className='space-y-2 rounded-lg border border-border bg-muted/45 p-2.5 shadow-sm dark:border-border dark:bg-muted/25 dark:shadow-none'
                      >
                        <Button
                          className='h-auto w-full justify-start whitespace-normal break-words py-2 text-left leading-snug bg-primary/10 text-primary hover:bg-primary/20'
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
                    <h3 className='min-w-0 text-base font-bold leading-tight tracking-tight text-foreground'>
                      Notater
                    </h3>
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
                        onClick={() =>
                          setNotesZoomPercent((z) => Math.max(NOTES_ZOOM_MIN, z - NOTES_ZOOM_STEP))
                        }
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
                        onClick={() =>
                          setNotesZoomPercent((z) => Math.min(NOTES_ZOOM_MAX, z + NOTES_ZOOM_STEP))
                        }
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
