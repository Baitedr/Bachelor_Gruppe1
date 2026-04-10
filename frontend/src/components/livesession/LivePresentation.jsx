import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react'
import { usePresentation } from '../../hooks/usePresentation'
import api from '../../services/api'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Textarea } from '../ui/textarea'
import LivePresentationCanvas from './LivePresentationCanvas'
import LiveResultsBoard from './LiveResultsBoard'

const NOTES_ZOOM_MIN = 75
const NOTES_ZOOM_MAX = 160
const NOTES_ZOOM_STEP = 10

/** Sits inside the slide bounds (canvas wrapper or text slide box), not the full grid cell. */
const PresenterSlideNavToolbar = ({ onPrev, onNext, canPrev, canNext }) => (
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
      aria-label='Forrige lysbilde'
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
      aria-label='Neste lysbilde'
    >
      <ChevronRight className='h-4.5 w-4.5' strokeWidth={2} aria-hidden />
    </Button>
  </div>
)

const LivePresentation = ({
  presentationId,
  isPresenter,
  joinCode,
  onEndLiveSession,
  onSessionEnd,
}) => {
  const [presentation, setPresentation] = useState(null)
  const [loading, setLoading] = useState(true)

  const {
    currentSlide,
    activePoll,
    pollResults,
    participantCount,
    navigateSlide,
    activatePoll,
    submitPollAnswer,
    sessionEnded,
    submittedPollIds,
    activeQuestion,
    questionResults,
    activateQuestion,
    submitQuestionAnswer,
    submittedQuestionIds,
  } = usePresentation(presentationId, localStorage.getItem('auth_token'))
  const [questionAnswer, setQuestionAnswer] = useState('')
  const [notesZoomPercent, setNotesZoomPercent] = useState(100)

  useEffect(() => {
    if (sessionEnded && onSessionEnd) onSessionEnd()
  }, [sessionEnded, onSessionEnd])

  useEffect(() => {
    const loadPresentation = async () => {
      try {
        const response = await api.joinPresentation(presentationId)
        setPresentation(response.presentation)
      } catch (error) {
        console.error('feil ved innlasting av presentasjon', error)
      } finally {
        setLoading(false)
      }
    }

    loadPresentation()
  }, [presentationId])

  const handleNextSlide = () => {
    if (presentation && currentSlide < presentation.slides.length - 1) {
      navigateSlide(currentSlide + 1)
    }
  }

  const handlePrevSlide = () => {
    if (currentSlide > 0) {
      navigateSlide(currentSlide - 1)
    }
  }

  useEffect(() => {
    if (!isPresenter || !presentation) return

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

      if (e.code === 'ArrowRight' || e.code === 'Space') {
        if (presentation && currentSlide < presentation.slides.length - 1) {
          e.preventDefault()
          navigateSlide(currentSlide + 1)
        }
      } else if (e.code === 'ArrowLeft') {
        if (currentSlide > 0) {
          e.preventDefault()
          navigateSlide(currentSlide - 1)
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isPresenter, presentation, currentSlide, navigateSlide])

  // derived values (safe even when presentation is null)
  const rawSlideData = presentation?.slides?.[currentSlide]
  const currentSlideData = rawSlideData?.background
    ? { ...rawSlideData, ...rawSlideData.background }
    : rawSlideData

  const activePollResult = activePoll ? pollResults[activePoll.id] : null
  const totalVotes = activePollResult?.total || 0
  const hasAnsweredActivePoll = Boolean(activePoll && submittedPollIds?.[activePoll.id])
  const activeQuestionResult = activeQuestion ? questionResults[activeQuestion.id] : null
  const totalQuestionAnswers = activeQuestionResult?.total || 0
  const activeQuestionType = activeQuestionResult?.question_type || activeQuestion?.type || 'open_text'
  const hasAnsweredActiveQuestion = Boolean(activeQuestion && submittedQuestionIds?.[activeQuestion.id])

  const hasActivePoll = Boolean(activePoll)
  const hasActiveQuestion = Boolean(activeQuestion)
  const hasActiveInteraction = hasActivePoll || hasActiveQuestion

  const resultsBoardType =
  hasActivePoll && hasActiveQuestion
    ? 'both'
    : hasActivePoll
    ? 'poll'
    : hasActiveQuestion
    ? 'question'
    : null
    const resultsBoardItemId =
    resultsBoardType === 'poll'
    ? activePoll?.id
    : resultsBoardType === 'question'
    ? activeQuestion?.id
    : null

  const audienceResults = useMemo(() => {
    if (!activePoll) return []
    return activePoll.options.map((option) => {
      const votes = activePollResult?.results?.[option.text] || 0
      const percent = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0
      return { id: option.id, text: option.text, votes, percent }
    })
  }, [activePoll, activePollResult, totalVotes])

  const activeQuestionChoiceResults = useMemo(() => {
    if (!activeQuestion || activeQuestionType !== 'single_choice') return []

    return (activeQuestion.options || []).map((option) => {
      const count = activeQuestionResult?.results?.[option.text] || 0
      const percent = totalQuestionAnswers > 0 ? Math.round((count / totalQuestionAnswers) * 100) : 0
      return {
        id: option.id,
        text: option.text,
        count,
        percent,
      }
    })
  }, [activeQuestion, activeQuestionResult, activeQuestionType, totalQuestionAnswers])

  const submitOpenQuestionAnswer = () => {
    if (!activeQuestion) return

    const trimmedAnswer = questionAnswer.trim()
    if (!trimmedAnswer) return

    submitQuestionAnswer(activeQuestion.id, trimmedAnswer)
    setQuestionAnswer('')
  }

  const presenterNotes = (currentSlideData?.notes || '').trim()

  if (loading) {
    return <div className='text-sm text-muted-foreground'>Laster presentasjon...</div>
  }

  if (!presentation) {
    return <div className='text-sm text-muted-foreground'>Presentasjon ikke funnet.</div>
  }

  if (!isPresenter && hasActiveInteraction && resultsBoardType) {
  return (
    <div className='flex h-full min-h-0 w-full flex-col gap-3'>
    <LiveResultsBoard presentationId={presentationId} initialType={resultsBoardType} initialItemId={resultsBoardItemId} />
    </div>
    )
  }

  return (
    <div className={isPresenter ? 'flex h-full min-h-0 flex-col gap-3 overflow-hidden' : 'space-y-4'}>
      <Card className={isPresenter ? 'flex min-h-0 flex-1 flex-col overflow-hidden' : ''}>
        <CardHeader
          className={
            (isPresenter ? 'px-3 pb-2 pt-3 sm:px-4 ' : '') +
            (isPresenter && joinCode
              ? 'grid grid-cols-1 gap-2 lg:grid-cols-[minmax(0,auto)_minmax(0,1fr)_auto] lg:items-center lg:gap-x-4'
              : 'flex flex-row flex-wrap items-center justify-between gap-3 pb-2')
          }
        >
          <div className='flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1'>
            <CardTitle className='text-xl'>{presentation.title}</CardTitle>
            <p className='whitespace-nowrap text-sm text-muted-foreground'>
              Lysbilde {currentSlide + 1} av {presentation.slides.length}
            </p>
          </div>
          {isPresenter && joinCode && (
            <p className='flex min-w-0 items-center justify-center gap-1.5 text-center text-sm leading-none text-muted-foreground lg:px-2'>
              <span className='shrink-0'>Live-kode:</span>
              <span className='truncate font-mono text-sm font-semibold tracking-wide text-foreground'>
                {joinCode}
              </span>
            </p>
          )}
          <div className='flex flex-shrink-0 flex-wrap items-center gap-2 lg:justify-self-end'>
            <span className='text-sm font-medium'>Deltakere:</span>
            <span className='rounded-md bg-secondary px-2 py-1 font-bold text-secondary-foreground'>
              {participantCount}
            </span>
            {isPresenter && joinCode && onEndLiveSession && (
              <Button variant='destructive' size='sm' onClick={() => onEndLiveSession()}>
                Avslutt økt
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent
          className={
            isPresenter ? 'flex min-h-0 flex-1 flex-col px-2 pb-2 pt-0 sm:px-3 sm:pb-3' : ''
          }
        >
          <div
            className={
              isPresenter
                ? 'grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)] gap-1 rounded-lg bg-transparent p-0 sm:p-0.5 lg:grid-cols-[minmax(0,1fr)_clamp(272px,28vw,400px)] lg:gap-4 xl:gap-5'
                : 'min-h-105 rounded-xl p-2 flex flex-col justify-center items-center bg-transparent'
            }
          >
            <div
              className={
                isPresenter ? 'relative flex min-h-0 h-full min-w-0 flex-col' : 'w-full'
              }
            >
              {currentSlideData ? (
                currentSlideData.fabricData ? (
                  <div className='min-h-0 w-full min-w-0 flex-1'>
                    <LivePresentationCanvas
                      slideData={currentSlideData}
                      presenterToolbar={
                        isPresenter ? (
                          <PresenterSlideNavToolbar
                            onPrev={handlePrevSlide}
                            onNext={handleNextSlide}
                            canPrev={currentSlide > 0}
                            canNext={currentSlide < presentation.slides.length - 1}
                          />
                        ) : null
                      }
                    />
                  </div>
                ) : (
                  <div className='flex w-full min-h-0 flex-1 flex-col items-center justify-center'>
                    <div className='relative w-full max-w-3xl px-4 text-center'>
                      {currentSlideData.title && (
                        <h2 className='text-3xl font-bold mb-6 text-foreground'>{currentSlideData.title}</h2>
                      )}
                      {currentSlideData.content && (
                        <div className='text-xl whitespace-pre-wrap text-foreground'>
                          {currentSlideData.content}
                        </div>
                      )}
                      {!currentSlideData.title && !currentSlideData.content && (
                        <p className='text-sm text-muted-foreground'>Dette lysbildet er tomt.</p>
                      )}
                      {isPresenter && (
                        <PresenterSlideNavToolbar
                          onPrev={handlePrevSlide}
                          onNext={handleNextSlide}
                          canPrev={currentSlide > 0}
                          canNext={currentSlide < presentation.slides.length - 1}
                        />
                      )}
                    </div>
                  </div>
                )
              ) : (
                <p className='text-sm text-muted-foreground'>Ingen data for dette lysbildet.</p>
              )}
            </div>
            {isPresenter && (
              <aside className='flex h-full min-h-0 w-full min-w-0 flex-col gap-2 rounded-lg bg-gradient-to-b from-card via-card/90 to-card/60 p-2 sm:gap-2.5 sm:p-2.5 lg:gap-3 lg:p-3'>
                <div className='max-h-[min(50%,22rem)] shrink-0 overflow-y-auto rounded-lg border border-border bg-background/50 p-3'>
                  <div className='mb-2 flex items-center justify-between'>
                    <h3 className='text-sm font-semibold text-foreground'>Sporsmal og verktoy</h3>
                    <span className='rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary'>
                      Live
                    </span>
                  </div>
                  <div className='space-y-2 pr-1'>
                    {currentSlideData?.polls?.map((poll) => (
                      <div key={poll.id} className='space-y-2 rounded-lg bg-card/90 p-2.5'>
                        <Button
                          className='h-auto w-full justify-start whitespace-normal break-words py-2 text-left leading-snug bg-primary/10 text-primary hover:bg-primary/20'
                          variant='ghost'
                          onClick={() => activatePoll(poll.id)}
                        >
                          Aktiver poll: {poll.question}
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
                        <div key={question.id} className='space-y-2 rounded-lg bg-card/90 p-2.5'>
                          <Button
                            className='h-auto w-full justify-start whitespace-normal break-words py-2 text-left leading-snug bg-primary/10 text-primary hover:bg-primary/20'
                            variant='ghost'
                            onClick={() => activateQuestion(question.id)}
                          >
                            Aktiver sporsmal: {question.prompt}
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
                                <>
                                  {(result.recent_answers || []).slice(-5).map((answer, index) => (
                                    <p key={`${question.id}-${index}`} className='text-muted-foreground'>
                                      {answer}
                                    </p>
                                  ))}
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                    {!currentSlideData?.polls?.length && !currentSlideData?.questions?.length && (
                      <p className='text-sm text-muted-foreground'>Ingen sporsmal eller polls pa dette lysbildet.</p>
                    )}
                  </div>
                </div>
                <div className='flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card/40 shadow-sm'>
                  <div className='shrink-0 border-b border-border/80 bg-muted/30 px-3 py-2.5'>
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
                  <div className='min-h-0 flex-1 overflow-y-auto bg-muted/20 p-3 text-sm'>
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
            )}
          </div>
        </CardContent>
      </Card>

      {isPresenter ? null : (
        <div className='space-y-4'>
          {activePoll && (
            <Card>
              <CardHeader className='pb-2'>
                <CardTitle className='text-lg'>{activePoll.question}</CardTitle>
              </CardHeader>
              <CardContent className='space-y-3'>
                {!hasAnsweredActivePoll ? (
                  activePoll.options.map((option) => (
                    <Button
                      key={option.id}
                      className='w-full justify-start'
                      variant='outline'
                      onClick={() => submitPollAnswer(activePoll.id, option.text)}
                    >
                      {option.text}
                    </Button>
                  ))
                ) : (
                  <div className='space-y-2'>
                    <p className='text-sm text-muted-foreground'>
                      Stemmen din er registrert. Resultater oppdateres i sanntid:
                    </p>
                    {audienceResults.map((option) => (
                      <div key={option.id} className='space-y-1'>
                        <div className='flex justify-between text-sm'>
                          <span>{option.text}</span>
                          <span className='text-muted-foreground'>
                            {option.votes} ({option.percent}%)
                          </span>
                        </div>
                        <div className='h-2 w-full rounded bg-muted overflow-hidden'>
                          <div
                            className='h-full bg-primary transition-all duration-300'
                            style={{ width: `${option.percent}%` }}
                          />
                        </div>
                      </div>
                    ))}
                    <p className='text-xs text-muted-foreground'>Totalt antall stemmer: {totalVotes}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {activeQuestion && (
            <Card>
              <CardHeader className='pb-2'>
                <CardTitle className='text-lg'>{activeQuestion.prompt}</CardTitle>
              </CardHeader>
              <CardContent className='space-y-3'>
                {!hasAnsweredActiveQuestion ? (
                  activeQuestionType === 'single_choice' ? (
                    (activeQuestion.options || []).map((option) => (
                      <Button
                        key={option.id}
                        className='w-full justify-start'
                        variant='outline'
                        onClick={() => submitQuestionAnswer(activeQuestion.id, option.text)}
                      >
                        {option.text}
                      </Button>
                    ))
                  ) : (
                    <div className='space-y-2'>
                      <Textarea
                        value={questionAnswer}
                        onChange={(event) => setQuestionAnswer(event.target.value)}
                        placeholder='Skriv svaret ditt her...'
                      />
                      <Button onClick={submitOpenQuestionAnswer} disabled={!questionAnswer.trim()}>
                        Send svar
                      </Button>
                    </div>
                  )
                ) : (
                  <div className='space-y-2'>
                    <p className='text-sm text-muted-foreground'>
                      Svaret ditt er registrert. Resultater oppdateres i sanntid:
                    </p>

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
                            <div className='h-2 w-full rounded bg-muted overflow-hidden'>
                              <div
                                className='h-full bg-primary transition-all duration-300'
                                style={{ width: `${option.percent}%` }}
                              />
                            </div>
                          </div>
                        ))}
                        <p className='text-xs text-muted-foreground'>Totalt antall svar: {totalQuestionAnswers}</p>
                      </>
                    ) : (
                      <div className='space-y-1'>
                        {(activeQuestionResult?.recent_answers || []).slice(-5).map((answer, index) => (
                          <p key={`answer-${index}`} className='text-sm text-muted-foreground'>
                            {answer}
                          </p>
                        ))}
                        <p className='text-xs text-muted-foreground'>Totalt antall svar: {totalQuestionAnswers}</p>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}

export default LivePresentation
