import { useEffect, useMemo, useState } from 'react'
import { usePresentation } from '../../hooks/usePresentation'
import {
  normalizePresentationVariables,
  resolveFabricDataWithVariables,
  resolveTextWithVariables,
  type PresentationVariable,
} from '../../lib/utils'
import api from '../../services/api'
import LivePresentationAudience from './ui/LivePresentationAudience'
import LivePresentationPresenter from './ui/LivePresentationPresenter'

type SlideRecord = Record<string, unknown> & {
  background?: Record<string, unknown>
}

type PresentationRecord = {
  id?: string | number
  title: string
  slides: SlideRecord[]
  variables?: PresentationVariable[]
}

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
  onLeaveSession,
}: {
  presentationId: string | number
  isPresenter: boolean
  joinCode: string | null
  onEndLiveSession?: () => void
  onSessionEnd?: () => void
  onLeaveSession?: () => void
}) => {
  const [presentation, setPresentation] = useState<PresentationRecord | null>(null)
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
        setPresentation(response.presentation as PresentationRecord)
      } catch (error) {
        console.error('feil ved innlasting av presentasjon', error)
      } finally {
        setLoading(false)
      }
    }

    void loadPresentation()
  }, [presentationId])

  const rawSlideData = presentation?.slides?.[currentSlide]
  const presentationVariables = useMemo(() => {
    const currentSlideVariables =
      (rawSlideData?.variables as unknown[]) ||
      (rawSlideData?.background as { variables?: unknown[] } | undefined)?.variables ||
      []
    const firstSlide = presentation?.slides?.[0] as SlideRecord | undefined
    const firstSlideVariables =
      (firstSlide?.variables as unknown[]) ||
      (firstSlide?.background as { variables?: unknown[] } | undefined)?.variables ||
      []

    return normalizePresentationVariables(
      presentation?.variables || currentSlideVariables || firstSlideVariables || [],
    )
  }, [presentation?.variables, presentation?.slides, rawSlideData])
  const mergedSlideData = rawSlideData?.background
    ? ({ ...rawSlideData, ...rawSlideData.background } as typeof rawSlideData)
    : rawSlideData
  const currentSlideData = mergedSlideData
    ? ({
        ...mergedSlideData,
        title: resolveTextWithVariables(mergedSlideData.title, presentationVariables),
        content: resolveTextWithVariables(mergedSlideData.content, presentationVariables),
        fabricData: resolveFabricDataWithVariables(mergedSlideData.fabricData, presentationVariables),
      } as typeof mergedSlideData)
    : mergedSlideData

  const activePollResult = activePoll && typeof activePoll === 'object' && activePoll !== null && 'id' in activePoll
    ? pollResults[String((activePoll as { id: string | number }).id)]
    : null
  const totalVotes = activePollResult?.total || 0
  const activePollId =
    activePoll && typeof activePoll === 'object' && activePoll !== null && 'id' in activePoll
      ? String((activePoll as { id: string | number }).id)
      : ''
  const hasAnsweredActivePoll = Boolean(activePoll && submittedPollIds[activePollId])
  const activeQuestionResult =
    activeQuestion && typeof activeQuestion === 'object' && activeQuestion !== null && 'id' in activeQuestion
      ? questionResults[String((activeQuestion as { id: string | number }).id)]
      : null
  const totalQuestionAnswers = activeQuestionResult?.total || 0
  const activeQuestionType = activeQuestionResult?.question_type || 'open_text'
  const activeQuestionId =
    activeQuestion && typeof activeQuestion === 'object' && activeQuestion !== null && 'id' in activeQuestion
      ? String((activeQuestion as { id: string | number }).id)
      : ''
  const hasAnsweredActiveQuestion = Boolean(activeQuestion && submittedQuestionIds[activeQuestionId])

  const hasActivePoll = Boolean(activePoll)
  const hasActiveQuestion = Boolean(activeQuestion)
  const hasActiveInteraction = hasActivePoll || hasActiveQuestion

  const audienceResults = useMemo(() => {
    if (!activePoll || typeof activePoll !== 'object' || activePoll === null || !('options' in activePoll)) return []
    const opts = (activePoll as { options: Array<{ id: string | number; text: string }> }).options
    return opts.map((option) => {
      const votes = activePollResult?.results?.[option.text] || 0
      const percent = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0
      return { id: option.id, text: option.text, votes, percent }
    })
  }, [activePoll, activePollResult, totalVotes])

  const activeQuestionChoiceResults = useMemo(() => {
    if (!activeQuestion || activeQuestionType !== 'single_choice') return []
    const q = activeQuestion as { options?: Array<{ id: string | number; text: string }> }
    return (q.options || []).map((option) => {
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
    if (!activeQuestion || typeof activeQuestion !== 'object' || activeQuestion === null || !('id' in activeQuestion))
      return

    const trimmedAnswer = questionAnswer.trim()
    if (!trimmedAnswer) return

    submitQuestionAnswer((activeQuestion as { id: string | number }).id, trimmedAnswer)
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
