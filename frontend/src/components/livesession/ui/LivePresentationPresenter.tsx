import { useCallback, useEffect, useMemo, useState } from 'react'
import { LogOut, MonitorUp, Radio, ZoomIn, ZoomOut } from 'lucide-react'
import { cn, logoutStyleDestructiveButtonClassName } from '@/lib/utils'
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

/**
 * Presentatørflate for live-økt med verktøypanel og notater.
 * @author T3lluz
 */
const NOTES_ZOOM_MIN = 75
const NOTES_ZOOM_MAX = 160
const NOTES_ZOOM_STEP = 10

const styles = {
  root: 'flex h-full min-h-0 min-w-0 flex-col gap-3',
  stageCard: 'flex min-h-0 flex-1 flex-col overflow-visible',
  stageHeaderBase:
    'border-b-2 border-border bg-card/85 px-3 pb-2 pt-3 shadow-sm backdrop-blur-[2px] sm:px-4 dark:border-border dark:bg-transparent dark:shadow-none dark:backdrop-blur-none',
  stageHeaderWithCode:
    'grid grid-cols-1 gap-2 lg:grid-cols-[minmax(0,auto)_minmax(0,1fr)_auto] lg:items-center lg:gap-x-4',
  stageHeaderNoCode: 'flex flex-row flex-wrap items-center justify-between gap-3 pb-2',
  titleWrap: 'flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1',
  titleText: 'text-xl',
  slideMeta: 'whitespace-nowrap text-sm text-muted-foreground',
  codeRow: 'flex min-w-0 items-center justify-center gap-1.5 text-center text-sm leading-none lg:px-2',
  codeLabel: 'shrink-0 font-medium text-foreground/85',
  codeBadge:
    'truncate rounded-md bg-muted/70 px-2 py-0.5 font-mono text-sm font-semibold tracking-wide text-foreground ring-1 ring-border dark:bg-muted/50',
  actionsWrap: 'flex flex-shrink-0 flex-wrap items-center gap-2 lg:justify-self-end',
  projectorButton: 'gap-2',
  iconSmall: 'h-4 w-4',
  participantsBadge: 'inline-flex items-center gap-2 rounded-lg border border-border bg-muted/55 px-2.5 py-1 shadow-sm dark:bg-muted/35',
  participantsLabel: 'text-sm font-semibold text-foreground',
  participantsCount:
    'min-w-[1.5rem] rounded-md bg-background px-2 py-0.5 text-center text-sm font-bold tabular-nums text-foreground ring-1 ring-border dark:bg-card',
  content: 'flex min-h-0 flex-1 flex-col px-2 pb-2 pt-3 sm:px-3 sm:pb-3 sm:pt-4',
  contentGrid:
    'grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_clamp(272px,28vw,400px)] lg:gap-5 xl:gap-6',
  slideViewportWrap: 'relative flex min-h-0 h-full min-w-0 flex-col overflow-visible',
  sidebar: 'flex h-full min-h-0 w-full min-w-0 flex-col gap-3 sm:gap-3.5 lg:gap-4',
  toolsCard: 'flex shrink-0 flex-col overflow-hidden shadow-sm',
  toolsHeader: 'flex-shrink-0 space-y-0 border-b border-border px-3 pb-2 pt-2.5 sm:px-3.5 sm:pb-2.5 sm:pt-3',
  toolsHeaderRow: 'flex items-center justify-between gap-2',
  toolsTitle: 'text-sm font-semibold leading-tight',
  toolsHeaderActions: 'flex items-center gap-2',
  liveBadgeBase: 'gap-1.5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
  liveBadgeActive: 'shadow-sm shadow-primary/20',
  pingWrap: 'relative flex h-1.5 w-1.5',
  pingPulse: 'absolute inline-flex h-full w-full animate-ping rounded-full bg-primary-foreground/55',
  pingDot: 'relative inline-flex h-1.5 w-1.5 rounded-full bg-primary-foreground',
  toolsContent: 'space-y-2.5 p-3 pt-2.5 sm:p-3.5 sm:pt-3',
  interactionCardBase:
    'overflow-hidden border border-border bg-muted/30 shadow-sm transition-[border-color,background-color] duration-200 dark:bg-muted/20',
  interactionCardLive: 'border-primary/45 bg-primary/[0.07] dark:border-primary/40 dark:bg-primary/[0.11]',
  liveStatusBar: 'flex items-center gap-2 border-b border-border/70 bg-primary/10 px-3 py-2 dark:border-border/50 dark:bg-primary/15',
  liveStatusDotWrap: 'relative flex h-2 w-2 shrink-0',
  liveStatusPulse: 'absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75',
  liveStatusDot: 'relative inline-flex h-2 w-2 rounded-full bg-primary',
  liveStatusIcon: 'h-3.5 w-3.5 shrink-0 text-primary',
  liveStatusText: 'min-w-0 flex-1 text-xs font-medium leading-snug text-primary',
  interactionCardContent: 'space-y-2.5 px-3 pb-3 pt-2 sm:px-3.5 sm:pb-3.5',
  actionButtonBase: 'h-auto w-full justify-start whitespace-normal break-words py-2.5 text-left text-sm leading-snug',
  actionButtonLive: 'border-primary/40 bg-card/90 text-foreground hover:bg-accent',
  actionButtonIdle: 'border-border bg-background/80 text-primary hover:bg-primary/10',
  resultsBox: 'space-y-1.5 rounded-md border border-border/80 bg-muted/50 px-2.5 py-2 text-sm dark:bg-muted/35',
  resultsTitle: 'font-medium text-foreground',
  resultsLine: 'text-muted-foreground',
  recentAnswersWrap: 'space-y-2',
  recentAnswerCard: 'rounded-md border border-border/80 bg-muted/50 px-3 py-2 text-sm font-medium leading-snug text-foreground dark:bg-muted/35',
  notesPanel: 'flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm',
  notesHeader: 'shrink-0 border-b border-border px-3 py-2.5',
  notesHeaderRow: 'flex items-center justify-between gap-2',
  notesTitle: 'min-w-0 text-base font-bold leading-tight tracking-tight text-foreground',
  notesZoomControls:
    'flex shrink-0 items-center gap-0.5 rounded-md border border-border bg-background/90 p-0.5 shadow-sm backdrop-blur-sm',
  notesZoomBtn: 'h-7 w-7 text-foreground',
  notesZoomIcon: 'h-3.5 w-3.5',
  notesZoomBadge: 'h-7 min-w-[2.75rem] justify-center rounded-sm px-1.5 font-mono text-[10px] tabular-nums',
  notesBody: 'min-h-0 flex-1 overflow-y-auto p-3 text-sm',
  notesText: 'whitespace-pre-wrap leading-relaxed text-foreground dark:text-white',
  notesEmpty: 'text-sm italic text-foreground/80',
} as const

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
  question_type?: 'single_choice' | 'open_text'
}

/** Aktiv poll slik den kommer fra ActionCable — samme form som i LivePresentation. */
type WireActivePoll = { id: string | number; question: string; options: unknown[] }

/** Sjekker om verdien er en aktiv poll slik at vi kan sammenligne id med lysbildets poll-kort. */
const isWireActivePoll = (value: unknown): value is WireActivePoll => {
  if (!value || typeof value !== 'object') return false
  const poll = value as Record<string, unknown>
  return (
    (typeof poll.id === 'string' || typeof poll.id === 'number') &&
    typeof poll.question === 'string' &&
    Array.isArray(poll.options)
  )
}

/** Aktivt spørsmål fra kanalen — trengs for å markere hvilket kort som sendes til publikum. */
type WireActiveQuestion = { id: string | number; prompt: string }

/** Sjekker om verdien er et aktivt spørsmål (åpent eller flervalg). */
const isWireActiveQuestion = (value: unknown): value is WireActiveQuestion => {
  if (!value || typeof value !== 'object') return false
  const q = value as Record<string, unknown>
  return (typeof q.id === 'string' || typeof q.id === 'number') && typeof q.prompt === 'string'
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
  stopInteractions,
  interactionAcceptingAnswers,
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
  stopInteractions: () => void
  interactionAcceptingAnswers: boolean
  pollResults: Record<string, PollAggregate>
  questionResults: Record<string, QuestionAggregate>
  sessionEnded: boolean
  embedLive: SlideEmbedLiveContext
}) => {
  // Zoom lar presentatør justere notattekst uten å påvirke publikum.
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
    // Leser tilgjengelige skjermer slik at projektorvindu åpnes på riktig display.
    void getPresenterScreenChoices().then(setScreenChoices)
  }, [])

  // Åpner separat projektorvindu; prioriterer ekstern skjerm hvis tilgjengelig.
  const onOpenProjectorWindow = useCallback(() => {
    const pid = presentation?.id
    if (pid == null) return
    const currentScreen = window.screen as Screen & { availLeft?: number; availTop?: number }

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
        availLeft: currentScreen.availLeft ?? window.screenX ?? 0,
        availTop: currentScreen.availTop ?? window.screenY ?? 0,
        availWidth: window.screen.availWidth,
        availHeight: window.screen.availHeight,
      }
    openLiveProjectorWindow(String(pid), selectedChoice)
  }, [presentation?.id, screenChoices])

  // Notater fra aktiv slide rendres i eget panel for presentatør.
  const presenterNotes = (currentSlideData?.notes || '').trim()

  /** Id for poll som faktisk broadcastes — brukes til «på lufta»-ramme på riktig kort. */
  const liveWirePollId = useMemo(
    () => (isWireActivePoll(activePoll) ? String(activePoll.id) : null),
    [activePoll],
  )
  /** Id for spørsmål som vises for publikum akkurat nå. */
  const liveWireQuestionId = useMemo(
    () => (isWireActiveQuestion(activeQuestion) ? String(activeQuestion.id) : null),
    [activeQuestion],
  )
  const anyAudienceInteractionLive = Boolean(liveWirePollId || liveWireQuestionId)

  const slideViewportProps = useMemo(
    // Samler props for slideviewport for å redusere støy i JSX.
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
    // Global tastaturnavigasjon for rask frem/tilbake under presentasjon.
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
    <div className={styles.root}>
      <Card className={styles.stageCard}>
        <CardHeader
          className={cn(
            styles.stageHeaderBase,
            joinCode ? styles.stageHeaderWithCode : styles.stageHeaderNoCode,
          )}
        >
          <div className={styles.titleWrap}>
            <CardTitle className={styles.titleText}>{presentation.title}</CardTitle>
            <p className={styles.slideMeta}>
              Lysbilde {currentSlide + 1} av {slideCount}
            </p>
          </div>
          {joinCode && (
            <p className={styles.codeRow}>
              <span className={styles.codeLabel}>Live-kode:</span>
              <span className={styles.codeBadge}>
                {joinCode}
              </span>
            </p>
          )}
          <div className={styles.actionsWrap}>
            {/* Toppverktøy: projektor, deltakerteller, avslutt økt. */}
            <Button type='button' variant='outline' size='sm' className={styles.projectorButton} onClick={onOpenProjectorWindow}>
              <MonitorUp className={styles.iconSmall} aria-hidden />
              Projektorvindu
            </Button>
            <div className={styles.participantsBadge}>
              <span className={styles.participantsLabel}>Deltakere</span>
              <span className={styles.participantsCount}>
                {participantCount}
              </span>
            </div>
            {joinCode && onEndLiveSession && (
              <Button
                variant='outline'
                size='sm'
                className={logoutStyleDestructiveButtonClassName}
                onClick={onEndLiveSession}
              >
                <LogOut className={styles.iconSmall} aria-hidden />
                Avslutt økt
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className={styles.content}>
          <div className={styles.contentGrid}>
            <div className={styles.slideViewportWrap}>
              <PresenterSlideViewport {...slideViewportProps} />
            </div>
            <aside className={styles.sidebar}>
              {/* Verktøy: naturlig høyde (ingen egen scrollbar) — notater under tar resten av sidekolonnen */}
              <Card className={styles.toolsCard}>
                <CardHeader className={styles.toolsHeader}>
                  <div className={styles.toolsHeaderRow}>
                    <CardTitle className={styles.toolsTitle}>Spørsmål og verktøy</CardTitle>
                    <div className={styles.toolsHeaderActions}>
                      <Badge
                        variant={anyAudienceInteractionLive ? 'default' : 'secondary'}
                        className={cn(
                          styles.liveBadgeBase,
                          anyAudienceInteractionLive && styles.liveBadgeActive,
                        )}
                      >
                        {anyAudienceInteractionLive ? (
                          <>
                            <span className={styles.pingWrap} aria-hidden>
                              <span className={styles.pingPulse} />
                              <span className={styles.pingDot} />
                            </span>
                            Live
                          </>
                        ) : (
                          'Live'
                        )}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className={styles.toolsContent}>
                  {/* Poll-kort: aktivering + live-indikator + resultatsammendrag */}
                  {currentSlideData?.polls?.map((poll) => {
                    const pollIsLive = liveWirePollId === String(poll.id)
                    return (
                      <Card
                        key={poll.id}
                        className={cn(
                          // Én ramme + lett skygge: tydelig kant mot verktøypanelet uten dobbel ring
                          styles.interactionCardBase,
                          pollIsLive && styles.interactionCardLive,
                        )}
                      >
                        {pollIsLive ? (
                          <div
                            className={styles.liveStatusBar}
                            role='status'
                            aria-live='polite'
                          >
                            <span className={styles.liveStatusDotWrap} aria-hidden>
                              <span className={styles.liveStatusPulse} />
                              <span className={styles.liveStatusDot} />
                            </span>
                            <Radio className={styles.liveStatusIcon} aria-hidden />
                            <p className={styles.liveStatusText}>
                              {interactionAcceptingAnswers ? 'Avstemningen er aktiv hos deltakere' : 'Avstemningen er stengt for svar'}
                            </p>
                            <Button
                              type='button'
                              variant='outline'
                              size='sm'
                              className={logoutStyleDestructiveButtonClassName}
                              onClick={stopInteractions}
                              disabled={!interactionAcceptingAnswers}
                            >
                              {interactionAcceptingAnswers ? 'Stopp' : 'Stoppet'}
                            </Button>
                          </div>
                        ) : null}
                        <CardContent className={styles.interactionCardContent}>
                          <Button
                            className={cn(
                              styles.actionButtonBase,
                              pollIsLive ? styles.actionButtonLive : styles.actionButtonIdle,
                            )}
                            variant='outline'
                            onClick={() => activatePoll(poll.id)}
                          >
                            Aktiver avstemning: {poll.question}
                          </Button>
                          {pollResults[String(poll.id)] && (
                            <div className={styles.resultsBox}>
                              <p className={styles.resultsTitle}>
                                Resultater ({pollResults[String(poll.id)].total} stemmer)
                              </p>
                              {Object.entries(pollResults[String(poll.id)].results || {}).map(([answer, count]) => (
                                <p key={answer} className={styles.resultsLine}>
                                  {answer}: {count}
                                </p>
                              ))}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    )
                  })}

                  {/* Spørsmålskort: tilsvarende flyt som poll, men støtter åpne svar */}
                  {currentSlideData?.questions?.map((question) => {
                    const result = questionResults[String(question.id)]
                    const total = result?.total || 0
                    const questionType = result?.question_type || question.type || 'open_text'
                    const questionIsLive = liveWireQuestionId === String(question.id)

                    return (
                      <Card
                        key={question.id}
                        className={cn(
                          styles.interactionCardBase,
                          questionIsLive && styles.interactionCardLive,
                        )}
                      >
                        {questionIsLive ? (
                          <div
                            className={styles.liveStatusBar}
                            role='status'
                            aria-live='polite'
                          >
                            <span className={styles.liveStatusDotWrap} aria-hidden>
                              <span className={styles.liveStatusPulse} />
                              <span className={styles.liveStatusDot} />
                            </span>
                            <Radio className={styles.liveStatusIcon} aria-hidden />
                            <p className={styles.liveStatusText}>
                              {interactionAcceptingAnswers ? 'Spørsmålet er aktiv hos deltakere' : 'Spørsmålet er stengt for svar'}
                            </p>
                            <Button
                              type='button'
                              variant='outline'
                              size='sm'
                              className={logoutStyleDestructiveButtonClassName}
                              onClick={stopInteractions}
                              disabled={!interactionAcceptingAnswers}
                            >
                              {interactionAcceptingAnswers ? 'Stopp' : 'Stoppet'}
                            </Button>
                          </div>
                        ) : null}
                        <CardContent className={styles.interactionCardContent}>
                          <Button
                            className={cn(
                              styles.actionButtonBase,
                              questionIsLive ? styles.actionButtonLive : styles.actionButtonIdle,
                            )}
                            variant='outline'
                            onClick={() => activateQuestion(question.id)}
                          >
                            Aktiver spørsmål: {question.prompt}
                          </Button>

                          {result && (
                            <div className={styles.resultsBox}>
                              <p className={styles.resultsTitle}>Resultater ({total} svar)</p>
                              {questionType === 'single_choice' ? (
                                (question.options || []).map((option) => {
                                  const count = result.results?.[option.text] || 0
                                  const percent = total > 0 ? Math.round((count / total) * 100) : 0

                                  return (
                                    <p key={option.id} className={styles.resultsLine}>
                                      {option.text}: {count} ({percent}%)
                                    </p>
                                  )
                                })
                              ) : (
                                <div className={styles.recentAnswersWrap}>
                                  {(result.recent_answers || []).slice(-5).map((answer, index) => (
                                    <p
                                      key={`${question.id}-${index}`}
                                      className={styles.recentAnswerCard}
                                    >
                                      {answer}
                                    </p>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    )
                  })}
                  {!currentSlideData?.polls?.length && !currentSlideData?.questions?.length && (
                    <p className={styles.slideMeta}>Ingen spørsmål eller avstemninger på dette lysbildet.</p>
                  )}
                </CardContent>
              </Card>
              <div className={styles.notesPanel}>
                {/* Notatpanel er kun synlig for presentatør. */}
                <div className={styles.notesHeader}>
                  <div className={styles.notesHeaderRow}>
                    <h3 className={styles.notesTitle}>Notater</h3>
                    <div
                      className={styles.notesZoomControls}
                      role='group'
                      aria-label='Tekststorrelse for notater'
                    >
                      <Button
                        type='button'
                        variant='ghost'
                        size='icon'
                        className={styles.notesZoomBtn}
                        onClick={() => setNotesZoomPercent((z) => Math.max(NOTES_ZOOM_MIN, z - NOTES_ZOOM_STEP))}
                        disabled={notesZoomPercent <= NOTES_ZOOM_MIN}
                        aria-label='Zoom ut notater'
                      >
                        <ZoomOut className={styles.notesZoomIcon} aria-hidden />
                      </Button>
                      <Badge
                        variant='secondary'
                        className={styles.notesZoomBadge}
                      >
                        {notesZoomPercent}%
                      </Badge>
                      <Button
                        type='button'
                        variant='ghost'
                        size='icon'
                        className={styles.notesZoomBtn}
                        onClick={() => setNotesZoomPercent((z) => Math.min(NOTES_ZOOM_MAX, z + NOTES_ZOOM_STEP))}
                        disabled={notesZoomPercent >= NOTES_ZOOM_MAX}
                        aria-label='Zoom inn notater'
                      >
                        <ZoomIn className={styles.notesZoomIcon} aria-hidden />
                      </Button>
                    </div>
                  </div>
                </div>
                <div className={styles.notesBody}>
                  {presenterNotes ? (
                    <p
                      className={styles.notesText}
                      style={{ fontSize: `${notesZoomPercent}%` }}
                    >
                      {presenterNotes}
                    </p>
                  ) : (
                    <p className={styles.notesEmpty}>Ingen notater for dette lysbildet.</p>
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
