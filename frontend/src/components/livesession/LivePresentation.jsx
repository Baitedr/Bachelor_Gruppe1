import { useEffect, useMemo, useState } from 'react'
import { usePresentation } from '../../hooks/usePresentation'
import api from '../../services/api'
import { resolveTextWithVariables } from '../../lib/utils'
import LivePresentationAudience from './ui/LivePresentationAudience'
import LivePresentationPresenter from './ui/LivePresentationPresenter'

/**
 * Inngang for live-økt: laster presentasjon, kobler til kanal via `usePresentation` (ActionCable),
 * og rendrer enten presentatør- eller publikumsvisning. App.tsx bruker denne én komponent for begge roller.
 */
const LivePresentation = ({
  presentationId,
  isPresenter,
  joinCode,
  onEndLiveSession,
  onSessionEnd,
  /** Publikum: kalles fra fullskjerm-verktøylinje («Forlat økt»). */
  onLeaveSession,
}) => {
  const [presentation, setPresentation] = useState(null)
  const [loading, setLoading] = useState(true)

  const {
    currentSlide,
    activePoll,
    pollResults,
    participantCount,
    navigateSlide,
    liveboardForSlideIndex,
    showLiveboard,
    dismissLiveboard,
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
  // Slides kan ha bakgrunnsfelter i background; flates ut slik at canvas/tekst får samme form som i editoren.
  const currentSlideData = useMemo(() => {
    if (!rawSlideData) return rawSlideData

    const merged = rawSlideData?.background
      ? { ...rawSlideData, ...rawSlideData.background }
      : rawSlideData
    // Variabler kan være definert på presentasjonsnivå eller slide-nivå; slide-variabler har forrang.
    const variables = merged?.variables || presentation?.variables || []

    return {
      ...merged,
      title: resolveTextWithVariables(merged?.title || '', variables),
      content: resolveTextWithVariables(merged?.content || '', variables),
      variables,
    }
  }, [presentation?.variables, rawSlideData])

  const activePollResult = activePoll ? pollResults[activePoll.id] : null
  const totalVotes = activePollResult?.total || 0
  const hasAnsweredActivePoll = Boolean(activePoll && submittedPollIds?.[activePoll.id])
  const activeQuestionResult = activeQuestion ? questionResults[activeQuestion.id] : null
  const totalQuestionAnswers = activeQuestionResult?.total || 0
  const activeQuestionType = activeQuestionResult?.question_type || activeQuestion?.type || 'open_text'
  const hasAnsweredActiveQuestion = Boolean(activeQuestion && submittedQuestionIds?.[activeQuestion.id])

  const hasActivePoll = Boolean(activePoll)
  const hasActiveQuestion = Boolean(activeQuestion)
  // Publikum viser fullskjerms-overlay med stemme/svar når minst én av disse er aktiv fra presentatør.
  const hasActiveInteraction = hasActivePoll || hasActiveQuestion

  // Prosentandeler per svaralternativ for poll (brukes i gjestevisning etter at brukeren har stemt).
  const audienceResults = useMemo(() => {
    if (!activePoll) return []
    return activePoll.options.map((option) => {
      const votes = activePollResult?.results?.[option.text] || 0
      const percent = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0
      return { id: option.id, text: option.text, votes, percent }
    })
  }, [activePoll, activePollResult, totalVotes])

  // Samme idé for flervalgsspørsmål: tellinger fra kanalen mappet til søyler.
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
    // Ytre wrapper: sikrer at gjestevisningen får definert høyde nedover flex-kjeden (min-h-0 er kritisk for canvas).
    return (
      <div className='flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden'>
        <LivePresentationAudience
          presentation={presentation}
          currentSlide={currentSlide}
          currentSlideData={currentSlideData}
          participantCount={participantCount}
          liveboardForSlideIndex={liveboardForSlideIndex}
          hasActiveInteraction={hasActiveInteraction}
          activePoll={activePoll}
          activeQuestion={activeQuestion}
          pollResults={pollResults}
          questionResults={questionResults}
          sessionEnded={sessionEnded}
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
          onLeaveSession={onLeaveSession}
        />
      </div>
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
      liveboardForSlideIndex={liveboardForSlideIndex}
      showLiveboard={showLiveboard}
      dismissLiveboard={dismissLiveboard}
      activePoll={activePoll}
      activeQuestion={activeQuestion}
      activatePoll={activatePoll}
      activateQuestion={activateQuestion}
      pollResults={pollResults}
      questionResults={questionResults}
      sessionEnded={sessionEnded}
    />
  )
}

export default LivePresentation
