import { useEffect, useMemo, useState } from 'react'
import { usePresentation } from '../../hooks/usePresentation'
import api from '../../services/api'
import { Button } from '../ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Textarea } from '../ui/textarea'
import LivePresentationCanvas from './LivePresentationCanvas'

const LivePresentation = ({ presentationId, isPresenter, onSessionEnd }) => {
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

  if (loading) {
    return <div className='text-sm text-muted-foreground'>Laster presentasjon...</div>
  }

  if (!presentation) {
    return <div className='text-sm text-muted-foreground'>Presentasjon ikke funnet.</div>
  }

  return (
    <div className='space-y-4'>
      <Card>
        <CardHeader className='pb-4 flex flex-row items-center justify-between'>
          <div>
            <CardTitle className='text-xl'>{presentation.title}</CardTitle>
            <p className='text-sm text-muted-foreground'>
              Lysbilde {currentSlide + 1} av {presentation.slides.length}
            </p>
          </div>
          <div className='flex items-center gap-2'>
            <span className='text-sm font-medium'>Deltakere:</span>
            <span className='px-2 py-1 bg-secondary text-secondary-foreground rounded-md font-bold'>
              {participantCount}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <div
            className='min-h-105 rounded-xl border border-border p-6 flex flex-col justify-center items-center'
            style={{ backgroundColor: currentSlideData?.backgroundColor || 'hsl(var(--card))' }}
          >
            {currentSlideData ? (
              currentSlideData.fabricData ? (
                <LivePresentationCanvas slideData={currentSlideData} />
              ) : (
                <div className='w-full grow text-center flex flex-col justify-center items-center'>
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
                </div>
              )
            ) : (
              <p className='text-sm text-muted-foreground'>Ingen data for dette lysbildet.</p>
            )}
          </div>
        </CardContent>
      </Card>

      {isPresenter ? (
        <Card>
          <CardContent className='space-y-4 p-4'>
            <div className='flex flex-wrap gap-2'>
              <Button onClick={handlePrevSlide} disabled={currentSlide === 0} variant='outline'>
                Forrige
              </Button>
              <Button
                onClick={handleNextSlide}
                disabled={currentSlide === presentation.slides.length - 1}
                variant='outline'
              >
                Neste
              </Button>
            </div>

            {currentSlideData?.polls?.map((poll) => (
              <div key={poll.id} className='space-y-2 rounded-lg border border-border p-3'>
                <Button onClick={() => activatePoll(poll.id)}>Aktiver poll: {poll.question}</Button>
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
                <div key={question.id} className='space-y-2 rounded-lg border border-border p-3'>
                  <Button onClick={() => activateQuestion(question.id)}>
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
          </CardContent>
        </Card>
      ) : (
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
