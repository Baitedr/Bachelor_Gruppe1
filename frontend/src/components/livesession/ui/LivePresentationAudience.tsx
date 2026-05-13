import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LogOut, Maximize2, Minimize2 } from 'lucide-react'
import { cn, logoutStyleDestructiveButtonClassName } from '@/lib/utils'
import { exitFullscreenDoc, getFullscreenElement, requestFullscreenEl } from '@/lib/fullscreenDisplay'
import { Button } from '../../ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card'
import { ModeToggle } from '../../ui/mode-toggle'
import { Textarea } from '../../ui/textarea'
import LivePresentationCanvas from '../LivePresentationCanvas'
import LiveResultsBoard from './LiveResultsBoard'
import type { SlideEmbedLiveContext } from '../../SlideEmbedOverlays'
import { useIsMobileDevice } from '@/hooks/useIsMobileDevice'

type PollOption = { id: string | number; text: string }
type ActivePoll = { id: string | number; question: string; options: PollOption[] }
type ActiveQuestion = {
  id: string | number
  prompt: string
  type?: string
  options?: PollOption[]
}

type SlideLike = Record<string, unknown> & {
  title?: string
  content?: string
  fabricData?: { [key: string]: unknown; width?: number; height?: number }  // ← was: unknown
  polls?: unknown[]
  questions?: unknown[]
}

type PresentationShape = {
  title: string
  slides: SlideLike[]
}

/**
 * Publikumsvisning under live-økt: lysbilde, avstemning/spørsmål og liveboard.
 * Slidefeltet bruker CSS-grid med minmax(0,1fr) (samme prinsipp som presentatør) slik at
 * beholderen får en reell høyde — da kan LivePresentationCanvas/ResizeObserver fylle vinduet proporsjonalt.
 */
const LivePresentationAudience = ({
  presentation,
  currentSlide,
  currentSlideData,
  participantCount,
  liveboardForSlideIndex,
  hasActiveInteraction,
  activePoll,
  activeQuestion,
  pollResults,
  questionResults,
  sessionEnded,
  submitPollAnswer,
  submitQuestionAnswer,
  audienceResults,
  activeQuestionChoiceResults,
  activeQuestionType,
  hasAnsweredActivePoll,
  hasAnsweredActiveQuestion,
  interactionAcceptingAnswers,
  totalVotes,
  totalQuestionAnswers,
  questionAnswer,
  setQuestionAnswer,
  submitOpenQuestionAnswer,
  onLeaveSession,
  embedLive,
}: {
  presentation: PresentationShape
  currentSlide: number
  currentSlideData: SlideLike | null | undefined
  participantCount: number
  liveboardForSlideIndex: number | null
  hasActiveInteraction: boolean
  activePoll: ActivePoll | null
  activeQuestion: ActiveQuestion | null
  pollResults: Record<string, { results?: Record<string, number>; total?: number }>
  questionResults: Record<
    string,
    { results?: Record<string, number>; total?: number; recent_answers?: string[]; question_type?: 'single_choice' | 'open_text' }
  >
  sessionEnded: boolean
  submitPollAnswer: (pollId: string | number, answer: string) => void
  submitQuestionAnswer: (questionId: string | number, answer: string) => void
  audienceResults: Array<{ id: string | number; text: string; votes: number; percent: number }>
  activeQuestionChoiceResults: Array<{ id: string | number; text: string; count: number; percent: number }>
  activeQuestionType: 'single_choice' | 'open_text'
  hasAnsweredActivePoll: boolean
  hasAnsweredActiveQuestion: boolean
  interactionAcceptingAnswers: boolean
  totalVotes: number
  totalQuestionAnswers: number
  questionAnswer: string
  setQuestionAnswer: (v: string) => void
  submitOpenQuestionAnswer: () => void
  onLeaveSession?: () => void
  embedLive: SlideEmbedLiveContext
}) => {
  const stageRef = useRef<HTMLDivElement | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const isMobileDevice = useIsMobileDevice()

  useEffect(() => {
    const sync = () => setIsFullscreen(Boolean(getFullscreenElement()))
    document.addEventListener('fullscreenchange', sync)
    document.addEventListener('webkitfullscreenchange', sync)
    return () => {
      document.removeEventListener('fullscreenchange', sync)
      document.removeEventListener('webkitfullscreenchange', sync)
    }
  }, [])

  const toggleFullscreen = useCallback(async () => {
    const el = stageRef.current
    if (!el) return
    try {
      if (getFullscreenElement()) await exitFullscreenDoc()
      else await requestFullscreenEl(el)
    } catch {
      // Mobil/eldre nettlesere uten element-fullskjerm — ignorer stille
    }
  }, [])

  const slideCount = presentation.slides.length

  const liveboardSlideData = useMemo(() => {
    if (liveboardForSlideIndex == null) return null
    const li = Number(liveboardForSlideIndex)
    const cs = Number(currentSlide)
    if (li === cs && currentSlideData) return currentSlideData

    const raw = presentation?.slides?.[li]
    if (!raw) return currentSlideData ?? null
    const bg = raw.background as Record<string, unknown> | undefined
    if (bg && typeof bg === 'object' && !Array.isArray(bg)) {
      return { ...raw, ...bg } as SlideLike
    }
    return raw
  }, [presentation, liveboardForSlideIndex, currentSlide, currentSlideData])

  const inLiveboardResults =
    liveboardForSlideIndex != null &&
    Number(liveboardForSlideIndex) === Number(currentSlide) &&
    liveboardSlideData != null

  const slideBody = useMemo(() => {
    if (!currentSlideData) {
      return (
        <div className='flex h-full min-h-[12rem] w-full items-center justify-center rounded-lg border border-dashed border-border/60 p-6'>
          <p className='text-sm text-muted-foreground'>Ingen data for dette lysbildet.</p>
        </div>
      )
    }

    if (currentSlideData.fabricData) {
      return (
        <div className='flex min-h-0 h-full min-w-0 w-full flex-1 flex-col overflow-visible'>
          <LivePresentationCanvas slideData={currentSlideData} embedLive={embedLive} presenterToolbar={null} />
        </div>
      )
    }

    return (
      <div className='flex h-full min-h-0 w-full flex-col items-center justify-center overflow-auto p-2 sm:p-3'>
        <div className='w-full max-w-3xl rounded-lg bg-card p-6 shadow-[0_22px_50px_-12px_rgba(15,23,42,0.28),0_10px_28px_-8px_rgba(15,23,42,0.14),0_2px_8px_-2px_rgba(15,23,42,0.08)] dark:shadow-[0_24px_56px_-10px_rgba(0,0,0,0.65),0_12px_32px_-8px_rgba(0,0,0,0.45)]'>
          <div className='relative w-full max-w-3xl px-2 text-center sm:px-4'>
            {currentSlideData.title && (
              <h2 className='mb-4 text-balance text-2xl font-bold text-foreground sm:mb-6 sm:text-3xl md:text-4xl'>
                {String(currentSlideData.title)}
              </h2>
            )}
            {currentSlideData.content && (
              <div className='whitespace-pre-wrap text-balance text-lg text-foreground sm:text-xl md:text-2xl'>
                {String(currentSlideData.content)}
              </div>
            )}
            {!currentSlideData.title && !currentSlideData.content && (
              <p className='text-sm text-muted-foreground'>Dette lysbildet er tomt.</p>
            )}
          </div>
        </div>
      </div>
    )
  }, [currentSlideData, embedLive])

  const typedActivePoll = activePoll as ActivePoll | null
  const typedActiveQuestion = activeQuestion as ActiveQuestion | null

  const pollSection = !typedActivePoll ? null : (
    <section className='space-y-4 rounded-lg border border-border bg-card p-4 shadow-sm sm:p-6'>
      <div>
        <p className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>Avstemning</p>
        <h3 className='mt-1 text-lg font-semibold leading-snug sm:text-xl'>{typedActivePoll.question}</h3>
      </div>
      {!hasAnsweredActivePoll && interactionAcceptingAnswers ? (
        <div className='grid gap-2 sm:gap-3'>
          {typedActivePoll.options.map((option) => (
            <Button
              key={option.id}
              className='h-auto min-h-11 w-full justify-start whitespace-normal py-3 text-left text-base'
              variant='outline'
              onClick={() => submitPollAnswer(typedActivePoll.id, option.text)}
            >
              {option.text}
            </Button>
          ))}
        </div>
      ) : (
        <div className='space-y-3'>
          {!interactionAcceptingAnswers && !hasAnsweredActivePoll ? (
            <p className='text-sm text-muted-foreground'>Svar er stengt av presentatøren. Du kan ikke stemme lenger.</p>
          ) : (
            <p className='text-sm text-muted-foreground'>Stemmen din er registrert. Resultater oppdateres fortløpende.</p>
          )}
          {audienceResults.map((option) => (
            <div key={option.id} className='space-y-1'>
              <div className='flex justify-between text-sm'>
                <span>{option.text}</span>
                <span className='text-muted-foreground'>
                  {option.votes} ({option.percent}%)
                </span>
              </div>
              <div className='h-2.5 w-full overflow-hidden rounded-full bg-muted'>
                <div className='h-full bg-primary transition-all duration-300' style={{ width: `${option.percent}%` }} />
              </div>
            </div>
          ))}
          <p className='text-xs text-muted-foreground'>Totalt antall stemmer: {totalVotes}</p>
        </div>
      )}
    </section>
  )

  const questionSection = !typedActiveQuestion ? null : (
    <section className='space-y-4 rounded-lg border border-border bg-card p-4 shadow-sm sm:p-6'>
      <div>
        <p className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>Spørsmål</p>
        <h3 className='mt-1 text-lg font-semibold leading-snug sm:text-xl'>{typedActiveQuestion.prompt}</h3>
      </div>
      {!hasAnsweredActiveQuestion && interactionAcceptingAnswers ? (
        activeQuestionType === 'single_choice' ? (
          <div className='grid gap-2 sm:gap-3'>
            {(typedActiveQuestion.options || []).map((option) => (
              <Button
                key={option.id}
                className='h-auto min-h-11 w-full justify-start whitespace-normal py-3 text-left text-base'
                variant='outline'
                onClick={() => submitQuestionAnswer(typedActiveQuestion.id, option.text)}
              >
                {option.text}
              </Button>
            ))}
          </div>
        ) : (
          <div className='space-y-3'>
            <Textarea
              value={questionAnswer}
              onChange={(event) => setQuestionAnswer(event.target.value)}
              placeholder='Skriv svaret ditt her...'
              className='min-h-[8rem] resize-y text-base'
            />
            <Button className='w-full sm:w-auto' onClick={submitOpenQuestionAnswer} disabled={!questionAnswer.trim()}>
              Send svar
            </Button>
          </div>
        )
      ) : (
        <div className='space-y-3'>
          {!interactionAcceptingAnswers && !hasAnsweredActiveQuestion ? (
            <p className='text-sm text-muted-foreground'>Svar er stengt av presentatøren. Du kan ikke svare lenger.</p>
          ) : (
            <p className='text-sm text-muted-foreground'>Svaret ditt er registrert. Resultater oppdateres fortløpende.</p>
          )}
          {activeQuestionType === 'single_choice' ? (
            <>
              {activeQuestionChoiceResults.map((option) => (
                <div key={option.id} className='space-y-1'>
                  <div className='flex justify-between text-sm'>
                    <span>{option.text}</span>
                    <span className='text-muted-foreground'>
                      {option.count} ({option.percent}%)
                    </span>
                  </div>
                  <div className='h-2.5 w-full overflow-hidden rounded-full bg-muted'>
                    <div className='h-full bg-primary transition-all duration-300' style={{ width: `${option.percent}%` }} />
                  </div>
                </div>
              ))}
              <p className='text-xs text-muted-foreground'>Totalt antall svar: {totalQuestionAnswers}</p>
            </>
          ) : (
            <div className='space-y-2'>
              {(questionResults[String(typedActiveQuestion.id)]?.recent_answers || []).slice(-5).map((answer, index) => (
                <p
                  key={`answer-${index}`}
                  className='rounded-md border border-border bg-muted/50 px-3 py-2 text-sm font-medium leading-snug text-foreground'
                >
                  {answer}
                </p>
              ))}
              <p className='text-xs text-muted-foreground'>Totalt antall svar: {totalQuestionAnswers}</p>
            </div>
          )}
        </div>
      )}
    </section>
  )

  const mobileInteractionView = (
    <div className='flex w-full flex-col gap-4 p-4'>
      <div className='flex items-baseline gap-2'>
        <span className='text-lg font-semibold'>{presentation.title}</span>
        <span className='text-xs text-muted-foreground'>Lysbilde {currentSlide + 1} av {slideCount}</span>
      </div>
      {hasActiveInteraction ? (
        <>
          {pollSection}
          {questionSection}
        </>
      ) : inLiveboardResults ? (
        <div className='flex flex-col gap-4'>
          {((liveboardSlideData as SlideLike)?.polls || []).map((poll) => {
            const p = poll as { id: string | number; question?: string }
            return (
              <LiveResultsBoard
                key={`lb-poll-${p.id}`}
                initialType='poll'
                initialItemId={p.id}
                pollMeta={p}
                pollResults={pollResults}
                questionResults={questionResults}
                sessionEnded={sessionEnded}
              />
            )
          })}
          {((liveboardSlideData as SlideLike)?.questions || []).map((question) => {
            const q = question as { id: string | number; prompt?: string; type?: 'single_choice' | 'open_text'; options?: { id: string | number; text: string }[] }
            return (
              <LiveResultsBoard
                key={`lb-q-${q.id}`}
                initialType='question'
                initialItemId={q.id}
                questionMeta={q}
                pollResults={pollResults}
                questionResults={questionResults}
                sessionEnded={sessionEnded}
              />
            )
          })}
        </div>
      ) : (
        <div className='rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground'>
          Venter på aktivitet fra presentatøren…
        </div>
      )}
    </div>
  )

  return (
    <div className='flex h-full min-h-0 min-w-0 w-full flex-col gap-3'>
      {isMobileDevice && mobileInteractionView}
      {!isMobileDevice && (
      <Card
        ref={stageRef}
        className={cn(
          'relative flex min-h-0 min-w-0 flex-1 flex-col overflow-visible',
          isFullscreen && 'rounded-none border-0 shadow-none bg-background dark:bg-card',
        )}
      >
        <CardHeader
          className={cn(
            'flex shrink-0 flex-row flex-wrap items-center justify-between gap-2 sm:gap-3',
            isFullscreen
              ? 'border-b-2 border-border bg-muted px-3 py-2 shadow-sm sm:px-4 dark:border-border dark:bg-card dark:shadow-md'
              : 'border-b-2 border-border bg-card/80 px-3 pb-2 pt-3 shadow-sm backdrop-blur-[2px] sm:px-4 dark:border-border dark:bg-transparent dark:shadow-none dark:backdrop-blur-none',
          )}
        >
          <div className='flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 sm:gap-x-3'>
            <CardTitle className={cn('truncate', isFullscreen ? 'text-base sm:text-lg' : 'text-xl')}>
              {presentation.title}
            </CardTitle>
            <p
              className={cn(
                'whitespace-nowrap',
                isFullscreen
                  ? 'text-xs font-medium text-foreground sm:text-sm'
                  : 'text-xs font-medium text-foreground/80 sm:text-sm sm:text-foreground/85',
              )}
            >
              Lysbilde {currentSlide + 1} av {slideCount}
            </p>
          </div>
          <div className='flex flex-shrink-0 flex-wrap items-center gap-2'>
            <div
              className={cn(
                'inline-flex items-center gap-2 rounded-lg border border-border bg-muted/55 px-2 py-1 shadow-sm dark:bg-muted/35',
                isFullscreen && 'bg-muted/70 dark:bg-muted/40',
              )}
            >
              <span
                className={cn('font-semibold text-foreground', isFullscreen ? 'text-xs sm:text-sm' : 'text-sm')}
              >
                Deltakere
              </span>
              <span className='min-w-[1.5rem] rounded-md bg-background px-2 py-0.5 text-center text-sm font-bold tabular-nums text-foreground ring-1 ring-border dark:bg-card'>
                {participantCount}
              </span>
            </div>
            {isFullscreen ? <ModeToggle /> : null}
            {onLeaveSession && isFullscreen ? (
              <Button
                type='button'
                variant='outline'
                size='sm'
                className={logoutStyleDestructiveButtonClassName}
                onClick={onLeaveSession}
                aria-label='Forlat økt'
              >
                <LogOut className='h-4 w-4' aria-hidden />
                Forlat økt
              </Button>
            ) : null}
            <Button
              type='button'
              variant='secondary'
              size='sm'
              className={cn(
                'gap-1.5',
                isFullscreen &&
                  'border-border bg-card text-foreground shadow-sm hover:bg-accent hover:text-accent-foreground dark:border-secondary dark:bg-secondary dark:text-secondary-foreground dark:shadow-none dark:hover:bg-secondary/85 dark:hover:text-secondary-foreground',
              )}
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? 'Avslutt fullskjerm' : 'Fullskjerm presentasjon'}
            >
              {isFullscreen ? <Minimize2 className='h-4 w-4' aria-hidden /> : <Maximize2 className='h-4 w-4' aria-hidden />}
              <span className='hidden sm:inline'>{isFullscreen ? 'Avslutt' : 'Fullskjerm'}</span>
            </Button>
          </div>
        </CardHeader>

        <CardContent
          className={cn(
            'flex min-h-0 flex-1 flex-col',
            isFullscreen
              ? 'bg-background px-3 pb-3 pt-2 sm:px-4 sm:pb-4 sm:pt-3 dark:bg-transparent'
              : 'px-2 pb-2 pt-3 sm:px-3 sm:pb-3 sm:pt-4',
          )}
        >
          <div className='relative flex min-h-0 min-w-0 flex-1 flex-col overflow-visible'>
            <div className='grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)]'>
              <div className='relative flex min-h-0 h-full min-w-0 flex-col overflow-visible'>{slideBody}</div>
            </div>

            {inLiveboardResults && (
              <div
                className='absolute inset-0 z-20 flex flex-col overflow-hidden bg-background/95 backdrop-blur-sm'
                role='dialog'
                aria-label='Live resultater'
              >
                <div className='flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain p-4'>
                  <div className='flex w-full flex-col gap-4'>
                    {((liveboardSlideData as SlideLike)?.polls || []).map((poll) => {
                      const p = poll as { id: string | number; question?: string }
                      return (
                        <LiveResultsBoard
                          key={`lb-poll-${p.id}`}
                          initialType='poll'
                          initialItemId={p.id}
                          pollMeta={p}
                          pollResults={pollResults}
                          questionResults={questionResults}
                          sessionEnded={sessionEnded}
                        />
                      )
                    })}
                    {((liveboardSlideData as SlideLike)?.questions || []).map((question) => {
                      const q = question as { id: string | number; prompt?: string; type?: 'single_choice' | 'open_text'; options?: { id: string | number; text: string }[] }
                      return (
                        <LiveResultsBoard
                          key={`lb-q-${q.id}`}
                          initialType='question'
                          initialItemId={q.id}
                          questionMeta={q}
                          pollResults={pollResults}
                          questionResults={questionResults}
                          sessionEnded={sessionEnded}
                        />
                      )
                    })}
                  </div>
                </div>
              </div>
            )}

            {!inLiveboardResults && hasActiveInteraction && (
              <div
                className='absolute inset-0 z-20 flex flex-col overflow-hidden bg-background/95 backdrop-blur-sm'
                role='dialog'
                aria-label='Aktiv deltakelse'
              >
                <div className='flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain p-3 sm:p-5 md:p-6'>
                  <div className='mx-auto my-auto flex w-full max-w-2xl flex-col gap-5 py-4 sm:py-8'>
                    {pollSection}
                    {questionSection}
                  </div>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      )}
    </div>
  )
}

export default LivePresentationAudience
