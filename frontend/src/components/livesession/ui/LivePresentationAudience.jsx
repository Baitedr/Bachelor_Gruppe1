import { Button } from '../../ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card'
import { Textarea } from '../../ui/textarea'
import LivePresentationCanvas from '../LivePresentationCanvas'
import LiveResultsBoard from './LiveResultsBoard'

/**
 * Guest / joined-user live session: slide mirror + polls & questions.
 * Uses the same slide payload and `usePresentation` channel as the presenter; no separate routing.
 */
const LivePresentationAudience = ({
  presentationId,
  presentation,
  currentSlide,
  currentSlideData,
  participantCount,
  hasActiveInteraction,
  resultsBoardType,
  resultsBoardItemId,
  activePoll,
  activeQuestion,
  questionResults,
  submitPollAnswer,
  submitQuestionAnswer,
  audienceResults,
  activeQuestionChoiceResults,
  activeQuestionType,
  hasAnsweredActivePoll,
  hasAnsweredActiveQuestion,
  totalVotes,
  totalQuestionAnswers,
  questionAnswer,
  setQuestionAnswer,
  submitOpenQuestionAnswer,
}) => {
  if (hasActiveInteraction && resultsBoardType) {
    return (
      <div className='flex h-full min-h-0 w-full flex-col gap-3'>
        <LiveResultsBoard
          presentationId={presentationId}
          initialType={resultsBoardType}
          initialItemId={resultsBoardItemId}
        />
      </div>
    )
  }

  return (
    <div className='space-y-4'>
      <Card>
        <CardHeader className='flex flex-row flex-wrap items-center justify-between gap-3 pb-2'>
          <div className='flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1'>
            <CardTitle className='text-xl'>{presentation.title}</CardTitle>
            <p className='whitespace-nowrap text-sm text-muted-foreground'>
              Lysbilde {currentSlide + 1} av {presentation.slides.length}
            </p>
          </div>
          <div className='flex flex-shrink-0 flex-wrap items-center gap-2 lg:justify-self-end'>
            <span className='text-sm font-medium'>Deltakere:</span>
            <span className='rounded-md bg-secondary px-2 py-1 font-bold text-secondary-foreground'>
              {participantCount}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <div className='min-h-105 rounded-xl p-2 flex flex-col justify-center items-center bg-transparent'>
            <div className='w-full'>
              {currentSlideData ? (
                currentSlideData.fabricData ? (
                  <div className='min-h-0 w-full min-w-0 flex-1'>
                    <LivePresentationCanvas slideData={currentSlideData} presenterToolbar={null} />
                  </div>
                ) : (
                  <div className='flex w-full min-h-0 flex-1 flex-col items-center justify-center'>
                    <div className='relative w-full max-w-3xl px-4 text-center'>
                      {currentSlideData.title && (
                        <h2 className='text-3xl font-bold mb-6 text-foreground'>{currentSlideData.title}</h2>
                      )}
                      {currentSlideData.content && (
                        <div className='text-xl whitespace-pre-wrap text-foreground'>{currentSlideData.content}</div>
                      )}
                      {!currentSlideData.title && !currentSlideData.content && (
                        <p className='text-sm text-muted-foreground'>Dette lysbildet er tomt.</p>
                      )}
                    </div>
                  </div>
                )
              ) : (
                <p className='text-sm text-muted-foreground'>Ingen data for dette lysbildet.</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

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
                      {(questionResults[activeQuestion.id]?.recent_answers || []).slice(-5).map((answer, index) => (
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
    </div>
  )
}

export default LivePresentationAudience
