import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LogOut, Maximize2, Minimize2 } from 'lucide-react'
import { cn, logoutStyleDestructiveButtonClassName } from '@/lib/utils'
import { exitFullscreenDoc, getFullscreenElement, requestFullscreenEl } from '@/lib/fullscreenDisplay'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ModeToggle } from '@/components/ui/mode-toggle'
import { Textarea } from '@/components/ui/textarea'
import LivePresentationCanvas from '../LivePresentationCanvas'
import LiveResultsBoard from './LiveResultsBoard'
import type { SlideEmbedLiveContext } from '@/features/editor/SlideEmbedOverlays'
import { useIsMobileDevice } from '@/hooks/useIsMobileDevice'

/**
 * Publikumsflate under live-økt (slidevisning + interaksjoner + liveboard).
 * @author T3lluz
 */
type PollOption = { id: string | number; text: string }
type ActivePoll = { id: string | number; question: string; options: PollOption[] }
type ActiveQuestion = {
  id: string | number
  prompt: string
  type?: string
  options?: PollOption[]
}

type LiveboardPollMeta = { id: string | number; question?: string }
type LiveboardQuestionMeta = {
  id: string | number
  prompt?: string
  type?: 'single_choice' | 'open_text'
  options?: { id: string | number; text: string }[]
}

type SlideLike = Record<string, unknown> & {
  title?: string
  content?: string
  fabricData?: { [key: string]: unknown; width?: number; height?: number }
  polls?: unknown[]
  questions?: unknown[]
}

type PresentationShape = {
  title: string
  slides: SlideLike[]
}

const styles = {
  slideEmptyWrap: 'flex h-full min-h-[12rem] w-full items-center justify-center rounded-lg border border-dashed border-border/60 p-6',
  mutedText: 'text-sm text-muted-foreground',
  slideCanvasWrap: 'flex min-h-0 h-full min-w-0 w-full flex-1 flex-col overflow-visible',
  slideTextStage: 'flex h-full min-h-0 w-full flex-col items-center justify-center overflow-auto p-2 sm:p-3',
  slideTextCard:
    'w-full max-w-3xl rounded-lg bg-card p-6 shadow-[0_22px_50px_-12px_rgba(15,23,42,0.28),0_10px_28px_-8px_rgba(15,23,42,0.14),0_2px_8px_-2px_rgba(15,23,42,0.08)] dark:shadow-[0_24px_56px_-10px_rgba(0,0,0,0.65),0_12px_32px_-8px_rgba(0,0,0,0.45)]',
  slideTextInner: 'relative w-full max-w-3xl px-2 text-center sm:px-4',
  slideTitle: 'mb-4 text-balance text-2xl font-bold text-foreground sm:mb-6 sm:text-3xl md:text-4xl',
  slideContent: 'whitespace-pre-wrap text-balance text-lg text-foreground sm:text-xl md:text-2xl',
  liveboardList: 'flex flex-col gap-4',
  interactionSection: 'space-y-4 rounded-lg border border-border bg-card p-4 shadow-sm sm:p-6',
  interactionTag: 'text-xs font-medium uppercase tracking-wide text-muted-foreground',
  interactionTitle: 'mt-1 text-lg font-semibold leading-snug sm:text-xl',
  interactionChoices: 'grid gap-2 sm:gap-3',
  interactionChoiceButton: 'h-auto min-h-11 w-full justify-start whitespace-normal py-3 text-left text-base',
  interactionState: 'space-y-3',
  optionRowWrap: 'space-y-1',
  optionRowHead: 'flex justify-between text-sm',
  optionRowValue: 'text-muted-foreground',
  optionBarTrack: 'h-2.5 w-full overflow-hidden rounded-full bg-muted',
  optionBarFill: 'h-full bg-primary transition-all duration-300',
  interactionCountText: 'text-xs text-muted-foreground',
  questionInput: 'min-h-[8rem] resize-y text-base',
  questionSubmit: 'w-full sm:w-auto',
  answerCard: 'rounded-md border border-border bg-muted/50 px-3 py-2 text-sm font-medium leading-snug text-foreground',
  answersList: 'space-y-2',
  mobileWrap: 'flex w-full flex-col gap-4 p-4',
  mobileHead: 'flex items-baseline gap-2',
  mobileTitle: 'text-lg font-semibold',
  mobileSlideMeta: 'text-xs text-muted-foreground',
  mobileIdleCard: 'rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground',
  root: 'flex h-full min-h-0 min-w-0 w-full flex-col gap-3',
  stageCard: 'relative flex min-h-0 min-w-0 flex-1 flex-col overflow-visible',
  stageCardFullscreen: 'rounded-none border-0 bg-background shadow-none dark:bg-card',
  stageHeader: 'flex shrink-0 flex-row flex-wrap items-center justify-between gap-2 sm:gap-3',
  stageHeaderFullscreen: 'border-b-2 border-border bg-muted px-3 py-2 shadow-sm sm:px-4 dark:border-border dark:bg-card dark:shadow-md',
  stageHeaderDefault:
    'border-b-2 border-border bg-card/80 px-3 pb-2 pt-3 shadow-sm backdrop-blur-[2px] sm:px-4 dark:border-border dark:bg-transparent dark:shadow-none dark:backdrop-blur-none',
  titleWrap: 'flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 sm:gap-x-3',
  stageTitleBase: 'truncate',
  stageTitleFullscreen: 'text-base sm:text-lg',
  stageTitleDefault: 'text-xl',
  participantWrap: 'flex flex-shrink-0 flex-wrap items-center gap-2',
  participantBadgeBase: 'inline-flex items-center gap-2 rounded-lg border border-border bg-muted/55 px-2 py-1 shadow-sm dark:bg-muted/35',
  participantBadgeFullscreen: 'bg-muted/70 dark:bg-muted/40',
  participantLabelBase: 'font-semibold text-foreground',
  participantLabelSmall: 'text-xs sm:text-sm',
  participantLabelDefault: 'text-sm',
  participantCount:
    'min-w-[1.5rem] rounded-md bg-background px-2 py-0.5 text-center text-sm font-bold tabular-nums text-foreground ring-1 ring-border dark:bg-card',
  leaveIcon: 'h-4 w-4',
  fullscreenToggleBase: 'gap-1.5',
  fullscreenToggleFull:
    'border-border bg-card text-foreground shadow-sm hover:bg-accent hover:text-accent-foreground dark:border-secondary dark:bg-secondary dark:text-secondary-foreground dark:shadow-none dark:hover:bg-secondary/85 dark:hover:text-secondary-foreground',
  fullscreenToggleLabel: 'hidden sm:inline',
  fullscreenToggleIcon: 'h-4 w-4',
  bodyWrap: 'flex min-h-0 flex-1 flex-col',
  bodyFullscreen: 'bg-background px-3 pb-3 pt-2 sm:px-4 sm:pb-4 sm:pt-3 dark:bg-transparent',
  bodyDefault: 'px-2 pb-2 pt-3 sm:px-3 sm:pb-3 sm:pt-4',
  contentWrap: 'relative flex min-h-0 min-w-0 flex-1 flex-col overflow-visible',
  slideGrid: 'grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)]',
  slideCell: 'relative flex min-h-0 h-full min-w-0 flex-col overflow-visible',
  overlayRoot: 'absolute inset-0 z-20 flex flex-col overflow-hidden bg-background/95 backdrop-blur-sm',
  overlayScrollLiveboard: 'flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain p-4',
  overlayScrollInteraction: 'flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain p-3 sm:p-5 md:p-6',
  overlayInteractionCenter: 'mx-auto my-auto flex w-full max-w-2xl flex-col gap-5 py-4 sm:py-8',
} as const

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
  // Stage-ref brukes når vi ber nettleseren om element-fullskjerm.
  const stageRef = useRef<HTMLDivElement | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const isMobileDevice = useIsMobileDevice()

  useEffect(() => {
    // Holder lokal fullskjermstatus i sync med browser events.
    const sync = () => setIsFullscreen(Boolean(getFullscreenElement()))
    document.addEventListener('fullscreenchange', sync)
    document.addEventListener('webkitfullscreenchange', sync)
    return () => {
      document.removeEventListener('fullscreenchange', sync)
      document.removeEventListener('webkitfullscreenchange', sync)
    }
  }, [])

  // Veksler element-fullskjerm for publikumskortet.
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
    // Velger korrekt slidegrunnlag for liveboard-visning (kan være annen enn currentSlideData).
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
    // Rendrer slideinnhold i tre varianter: tom, fabric-canvas eller ren tekst.
    if (!currentSlideData) {
      return (
        <div className={styles.slideEmptyWrap}>
          <p className={styles.mutedText}>Ingen data for dette lysbildet.</p>
        </div>
      )
    }

    if (currentSlideData.fabricData) {
      return (
        <div className={styles.slideCanvasWrap}>
          <LivePresentationCanvas slideData={currentSlideData} embedLive={embedLive} presenterToolbar={null} />
        </div>
      )
    }

    return (
      <div className={styles.slideTextStage}>
        <div className={styles.slideTextCard}>
          <div className={styles.slideTextInner}>
            {currentSlideData.title && (
              <h2 className={styles.slideTitle}>
                {String(currentSlideData.title)}
              </h2>
            )}
            {currentSlideData.content && (
              <div className={styles.slideContent}>
                {String(currentSlideData.content)}
              </div>
            )}
            {!currentSlideData.title && !currentSlideData.content && (
              <p className={styles.mutedText}>Dette lysbildet er tomt.</p>
            )}
          </div>
        </div>
      </div>
    )
  }, [currentSlideData, embedLive])

  const liveboardPolls = (((liveboardSlideData as SlideLike)?.polls || []) as unknown[]).map(
    (poll) => poll as LiveboardPollMeta,
  )
  const liveboardQuestions = (((liveboardSlideData as SlideLike)?.questions || []) as unknown[]).map(
    (question) => question as LiveboardQuestionMeta,
  )

  const renderLiveboardCards = () => (
    // Gjør samme rendering tilgjengelig både på mobil og desktop-overlay.
    <div className={styles.liveboardList}>
      {liveboardPolls.map((poll) => (
        <LiveResultsBoard
          key={`lb-poll-${poll.id}`}
          initialType='poll'
          initialItemId={poll.id}
          pollMeta={poll}
          pollResults={pollResults}
          questionResults={questionResults}
          sessionEnded={sessionEnded}
        />
      ))}
      {liveboardQuestions.map((question) => (
        <LiveResultsBoard
          key={`lb-q-${question.id}`}
          initialType='question'
          initialItemId={question.id}
          questionMeta={question}
          pollResults={pollResults}
          questionResults={questionResults}
          sessionEnded={sessionEnded}
        />
      ))}
    </div>
  )

  // Gjenbrukbar poll-seksjon som brukes både i mobil og desktop overlay.
  const pollSection = !activePoll ? null : (
    // Poll-overlay: viser enten stemmeknapper eller løpende resultater.
    <section className={styles.interactionSection}>
      <div>
        <p className={styles.interactionTag}>Avstemning</p>
        <h3 className={styles.interactionTitle}>{activePoll.question}</h3>
      </div>
      {!hasAnsweredActivePoll && interactionAcceptingAnswers ? (
        <div className={styles.interactionChoices}>
          {activePoll.options.map((option) => (
            <Button
              key={option.id}
              className={styles.interactionChoiceButton}
              variant='outline'
              onClick={() => submitPollAnswer(activePoll.id, option.text)}
            >
              {option.text}
            </Button>
          ))}
        </div>
      ) : (
        <div className={styles.interactionState}>
          {!interactionAcceptingAnswers && !hasAnsweredActivePoll ? (
            <p className={styles.mutedText}>Svar er stengt av presentatøren. Du kan ikke stemme lenger.</p>
          ) : (
            <p className={styles.mutedText}>Stemmen din er registrert. Resultater oppdateres fortløpende.</p>
          )}
          {audienceResults.map((option) => (
            <div key={option.id} className={styles.optionRowWrap}>
              <div className={styles.optionRowHead}>
                <span>{option.text}</span>
                <span className={styles.optionRowValue}>
                  {option.votes} ({option.percent}%)
                </span>
              </div>
              <div className={styles.optionBarTrack}>
                <div className={styles.optionBarFill} style={{ width: `${option.percent}%` }} />
              </div>
            </div>
          ))}
          <p className={styles.interactionCountText}>Totalt antall stemmer: {totalVotes}</p>
        </div>
      )}
    </section>
  )

  // Gjenbrukbar spørsmålsseksjon for både flervalg og åpne svar.
  const questionSection = !activeQuestion ? null : (
    // Spørsmåls-overlay: støtter både flervalg og åpne tekstsvar.
    <section className={styles.interactionSection}>
      <div>
        <p className={styles.interactionTag}>Spørsmål</p>
        <h3 className={styles.interactionTitle}>{activeQuestion.prompt}</h3>
      </div>
      {!hasAnsweredActiveQuestion && interactionAcceptingAnswers ? (
        activeQuestionType === 'single_choice' ? (
          <div className={styles.interactionChoices}>
            {(activeQuestion.options || []).map((option) => (
              <Button
                key={option.id}
                className={styles.interactionChoiceButton}
                variant='outline'
                onClick={() => submitQuestionAnswer(activeQuestion.id, option.text)}
              >
                {option.text}
              </Button>
            ))}
          </div>
        ) : (
          <div className={styles.interactionState}>
            <Textarea
              value={questionAnswer}
              onChange={(event) => setQuestionAnswer(event.target.value)}
              placeholder='Skriv svaret ditt her...'
              className={styles.questionInput}
            />
            <Button className={styles.questionSubmit} onClick={submitOpenQuestionAnswer} disabled={!questionAnswer.trim()}>
              Send svar
            </Button>
          </div>
        )
      ) : (
        <div className={styles.interactionState}>
          {!interactionAcceptingAnswers && !hasAnsweredActiveQuestion ? (
            <p className={styles.mutedText}>Svar er stengt av presentatøren. Du kan ikke svare lenger.</p>
          ) : (
            <p className={styles.mutedText}>Svaret ditt er registrert. Resultater oppdateres fortløpende.</p>
          )}
          {activeQuestionType === 'single_choice' ? (
            <>
              {activeQuestionChoiceResults.map((option) => (
                <div key={option.id} className={styles.optionRowWrap}>
                  <div className={styles.optionRowHead}>
                    <span>{option.text}</span>
                    <span className={styles.optionRowValue}>
                      {option.count} ({option.percent}%)
                    </span>
                  </div>
                  <div className={styles.optionBarTrack}>
                    <div className={styles.optionBarFill} style={{ width: `${option.percent}%` }} />
                  </div>
                </div>
              ))}
              <p className={styles.interactionCountText}>Totalt antall svar: {totalQuestionAnswers}</p>
            </>
          ) : (
            <div className={styles.answersList}>
              {(questionResults[String(activeQuestion.id)]?.recent_answers || []).slice(-5).map((answer, index) => (
                <p key={`answer-${index}`} className={styles.answerCard}>
                  {answer}
                </p>
              ))}
              <p className={styles.interactionCountText}>Totalt antall svar: {totalQuestionAnswers}</p>
            </div>
          )}
        </div>
      )}
    </section>
  )

  // Defensive: kun ÉN aktiv interaksjonsseksjon kan vises om gangen. Hooken garanterer
  // allerede at activePoll/activeQuestion er gjensidig utelukkende (via felles intern
  // ActiveInteractionState), men ved å håndheve det også i renderingen får vi belt-and-
  // suspenders mot fremtidige regresjoner. Poll prioriteres hvis begge skulle ende
  // truthy i state (skal ikke kunne skje).
  const activeInteractionSection = activePoll
    ? pollSection
    : activeQuestion
      ? questionSection
      : null

  const mobileInteractionView = (
    // Mobil får egen, lineær layout for bedre lesbarhet og touch-flyt.
    <div className={styles.mobileWrap}>
      <div className={styles.mobileHead}>
        <span className={styles.mobileTitle}>{presentation.title}</span>
        <span className={styles.mobileSlideMeta}>Lysbilde {currentSlide + 1} av {slideCount}</span>
      </div>
      {hasActiveInteraction && activeInteractionSection ? (
        activeInteractionSection
      ) : inLiveboardResults ? (
        renderLiveboardCards()
      ) : (
        <div className={styles.mobileIdleCard}>
          Venter på aktivitet fra presentatøren…
        </div>
      )}
    </div>
  )

  return (
    <div className={styles.root}>
      {isMobileDevice && mobileInteractionView}
      {!isMobileDevice && (
        // Desktop-visning med slide som base og overlays for aktiv interaksjon/liveboard.
        <Card
          ref={stageRef}
          className={cn(
            styles.stageCard,
            isFullscreen && styles.stageCardFullscreen,
          )}
        >
          <CardHeader
            className={cn(
              styles.stageHeader,
              isFullscreen ? styles.stageHeaderFullscreen : styles.stageHeaderDefault,
            )}
          >
            <div className={styles.titleWrap}>
              {/* Overskrift + stegteller gir publikum kontekst om hvor i presentasjonen de er. */}
              <CardTitle className={cn(styles.stageTitleBase, isFullscreen ? styles.stageTitleFullscreen : styles.stageTitleDefault)}>
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
            <div className={styles.participantWrap}>
              {/* Deltakerbadge speiler live-antall i samme kanal. */}
              <div
                className={cn(
                  styles.participantBadgeBase,
                  isFullscreen && styles.participantBadgeFullscreen,
                )}
              >
                <span
                  className={cn(
                    styles.participantLabelBase,
                    isFullscreen ? styles.participantLabelSmall : styles.participantLabelDefault,
                  )}
                >
                  Deltakere
                </span>
                <span className={styles.participantCount}>
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
                  <LogOut className={styles.leaveIcon} aria-hidden />
                  Forlat økt
                </Button>
              ) : null}
              <Button
                type='button'
                variant='secondary'
                size='sm'
                className={cn(
                  styles.fullscreenToggleBase,
                  isFullscreen && styles.fullscreenToggleFull,
                )}
                onClick={toggleFullscreen}
                aria-label={isFullscreen ? 'Avslutt fullskjerm' : 'Fullskjerm presentasjon'}
              >
                {isFullscreen ? (
                  <Minimize2 className={styles.fullscreenToggleIcon} aria-hidden />
                ) : (
                  <Maximize2 className={styles.fullscreenToggleIcon} aria-hidden />
                )}
                <span className={styles.fullscreenToggleLabel}>{isFullscreen ? 'Avslutt' : 'Fullskjerm'}</span>
              </Button>
            </div>
          </CardHeader>

          <CardContent
            className={cn(
              styles.bodyWrap,
              isFullscreen ? styles.bodyFullscreen : styles.bodyDefault,
            )}
          >
            <div className={styles.contentWrap}>
              {/* Selve slideflaten ligger alltid i bakgrunnen; overlays legges over ved behov. */}
              <div className={styles.slideGrid}>
                <div className={styles.slideCell}>{slideBody}</div>
              </div>

              {inLiveboardResults && (
                // Overlay for "resultatfase" når presentatør har åpnet liveboard.
                <div
                  className={styles.overlayRoot}
                  role='dialog'
                  aria-label='Live resultater'
                >
                  <div className={styles.overlayScrollLiveboard}>
                    {renderLiveboardCards()}
                  </div>
                </div>
              )}

              {!inLiveboardResults && hasActiveInteraction && activeInteractionSection && (
                // Overlay for aktiv poll/spørsmål mens svar samles inn. Rendrer kun
                // ÉN seksjon — se kommentar om `activeInteractionSection` over.
                <div
                  className={styles.overlayRoot}
                  role='dialog'
                  aria-label='Aktiv deltakelse'
                >
                  <div className={styles.overlayScrollInteraction}>
                    <div className={styles.overlayInteractionCenter}>
                      {activeInteractionSection}
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
