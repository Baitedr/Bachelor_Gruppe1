import { useEffect, useMemo, useState } from 'react'
import { usePresentation } from '../../hooks/usePresentation'
import api from '../../services/api'
import LivePresentationAudience from './ui/LivePresentationAudience'
import LivePresentationPresenter from './ui/LivePresentationPresenter'

/**
 * Live session entry: loads presentation, subscribes via `usePresentation` (ActionCable),
 * and renders either presenter or audience UI. App routing still uses this single component.
 */
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

  if (loading) {
    return <div className='text-sm text-muted-foreground'>Laster presentasjon...</div>
  }

  if (!presentation) {
    return <div className='text-sm text-muted-foreground'>Presentasjon ikke funnet.</div>
  }

  if (!isPresenter) {
    return (
      <LivePresentationAudience
        presentationId={presentationId}
        presentation={presentation}
        currentSlide={currentSlide}
        currentSlideData={currentSlideData}
        participantCount={participantCount}
        hasActiveInteraction={hasActiveInteraction}
        resultsBoardType={resultsBoardType}
        resultsBoardItemId={resultsBoardItemId}
        activePoll={activePoll}
        activeQuestion={activeQuestion}
        questionResults={questionResults}
        submitPollAnswer={submitPollAnswer}
        submitQuestionAnswer={submitQuestionAnswer}
        audienceResults={audienceResults}
        activeQuestionChoiceResults={activeQuestionChoiceResults}
        activeQuestionType={activeQuestionType}
        hasAnsweredActivePoll={hasAnsweredActivePoll}
        hasAnsweredActiveQuestion={hasAnsweredActiveQuestion}
        totalVotes={totalVotes}
        totalQuestionAnswers={totalQuestionAnswers}
        questionAnswer={questionAnswer}
        setQuestionAnswer={setQuestionAnswer}
        submitOpenQuestionAnswer={submitOpenQuestionAnswer}
      />
    )
  }

  return (
    <LivePresentationPresenter
      presentation={presentation}
      joinCode={joinCode}
      onEndLiveSession={onEndLiveSession}
      participantCount={participantCount}
      currentSlide={currentSlide}
      currentSlideData={currentSlideData}
      navigateSlide={navigateSlide}
      activatePoll={activatePoll}
      activateQuestion={activateQuestion}
      pollResults={pollResults}
      questionResults={questionResults}
    />
  )
}

export default LivePresentation
