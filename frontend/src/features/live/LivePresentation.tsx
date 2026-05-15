import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePresentation } from '@/hooks/usePresentation'
import {
  normalizePresentationVariables,
  resolveFabricDataWithVariables,
  resolveTextWithVariables,
  type PresentationVariable,
} from '@/lib/utils'
import api from '@/services/api'
import LivePresentationAudience from './ui/LivePresentationAudience'
import LivePresentationPresenter from './ui/LivePresentationPresenter'
import type { PresenterSlideData } from './PresenterSlideViewport'

/**
 * Hovedcontainer for live-presentasjon (presentatør + publikum).
 * @author T3lluz
 */
type SlideRecord = Record<string, unknown> & {
  background?: Record<string, unknown>
}

type PresentationRecord = {
  id?: string | number
  title: string
  slides: SlideRecord[]
  variables?: PresentationVariable[]
}

type LiveQuestionType = 'single_choice' | 'open_text'

type PollOption = { id: string | number; text: string }
type ActivePoll = { id: string | number; question: string; options: PollOption[] }
type ActiveQuestion = {
  id: string | number
  prompt: string
  type?: string
  options?: PollOption[]
}

type NormalizedQuestionAggregate = {
  results?: Record<string, number>
  total?: number
  recent_answers?: string[]
  question_type?: LiveQuestionType
}

const styles = {
  loadingText: 'text-sm text-muted-foreground',
  missingText: 'text-sm text-muted-foreground',
  audienceRoot: 'flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden',
} as const

// Typeguard som sikrer at payload faktisk ser ut som en aktiv poll.
const isActivePoll = (value: unknown): value is ActivePoll => {
  if (!value || typeof value !== 'object') return false
  const poll = value as Record<string, unknown>
  return (
    (typeof poll.id === 'string' || typeof poll.id === 'number') &&
    typeof poll.question === 'string' &&
    Array.isArray(poll.options)
  )
}

// Typeguard for aktivt spørsmål fra kanalpayload.
const isActiveQuestion = (value: unknown): value is ActiveQuestion => {
  if (!value || typeof value !== 'object') return false
  const question = value as Record<string, unknown>
  return (
    (typeof question.id === 'string' || typeof question.id === 'number') &&
    typeof question.prompt === 'string'
  )
}

/** Live-visning: laster presentasjon, kanal via usePresentation, presentatør eller publikum. */
const LivePresentation = ({
  presentationId,
  isPresenter,
  joinCode,
  onEndLiveSession,
  onSessionEnd,
  onLeaveSession,
  autoStartPresenterSession = false,
}: {
  presentationId: string | number
  isPresenter: boolean
  joinCode: string | null
  onEndLiveSession?: () => void
  onSessionEnd?: () => void
  onLeaveSession?: () => void
  /** Presentatør uten lobby: start_session på kanalen én gang når data er klart. */
  autoStartPresenterSession?: boolean
}) => {
  // Lokal presentasjonsmodell hentes via API før live-hooken får vist innhold.
  const [presentation, setPresentation] = useState<PresentationRecord | null>(null)
  const [loading, setLoading] = useState(true)

  // Hooken håndterer all sanntidsstate for live-økten.
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
    sessionStarted,
    startSession,
    submittedPollIds,
    activeQuestion,
    questionResults,
    activateQuestion,
    submitQuestionAnswer,
    submittedQuestionIds,
    embedPlayback,
    broadcastEmbedPlayback,
    stopInteractions,
    interactionAcceptingAnswers,
  } = usePresentation(presentationId, localStorage.getItem('auth_token'))
  // Midlertidig tekstsvar for åpne spørsmål (publikum).
  const [questionAnswer, setQuestionAnswer] = useState('')
  /** Hindrer dobbel `start_session` dersom samme render-effekt fyres flere ganger. */
  const autoPresenterStartedRef = useRef(false)

  // Vedvarende nøkkel for publikumsvolum mellom økter.
  const AUDIENCE_EMBED_VOL_KEY = 'proslides-audience-embed-volume-v1'
  const [audienceVolLevel, setAudienceVolLevelState] = useState(90)
  const [audienceVolMuted, setAudienceVolMuted] = useState(false)
  const [audienceVolHydrated, setAudienceVolHydrated] = useState(false)

  // Volumtilstand for publikum ved avspilling av innebygde videoer.
  useEffect(() => {
    if (isPresenter) return
    try {
      const raw = localStorage.getItem(AUDIENCE_EMBED_VOL_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as { level?: unknown; muted?: unknown }
        const n = typeof parsed.level === 'number' ? parsed.level : Number(parsed.level)
        if (Number.isFinite(n)) setAudienceVolLevelState(Math.max(0, Math.min(100, Math.round(n))))
        if (parsed.muted === true) setAudienceVolMuted(true)
      }
    } catch {
      // ignorer korrupt lagring
    } finally {
      setAudienceVolHydrated(true)
    }
  }, [isPresenter])

  // Persistér volumvalg lokalt for neste live-økt.
  useEffect(() => {
    if (isPresenter || !audienceVolHydrated) return
    try {
      localStorage.setItem(
        AUDIENCE_EMBED_VOL_KEY,
        JSON.stringify({ level: audienceVolLevel, muted: audienceVolMuted }),
      )
    } catch {
      // private mode / full disk
    }
  }, [isPresenter, audienceVolHydrated, audienceVolLevel, audienceVolMuted])

  // Setter volum innenfor intervallet 0-100.
  const setAudienceVolLevel = useCallback((value: number) => {
    const next = Math.max(0, Math.min(100, Math.round(value)))
    setAudienceVolLevelState(next)
    if (next > 0) setAudienceVolMuted(false)
  }, [])

  // Veksler mute uten å miste sist brukte volum.
  const toggleAudienceMute = useCallback(() => {
    setAudienceVolMuted((prevMuted) => {
      if (prevMuted) {
        setAudienceVolLevelState((lev) => (lev === 0 ? 85 : lev))
        return false
      }
      return true
    })
  }, [])

  const audienceVolumeUi = useMemo(
    // Pakker volum-API i ett objekt for enkel prop-passing til publikumskomponenten.
    () => ({
      level: audienceVolLevel,
      muted: audienceVolMuted,
      setLevel: setAudienceVolLevel,
      toggleMute: toggleAudienceMute,
    }),
    [audienceVolLevel, audienceVolMuted, setAudienceVolLevel, toggleAudienceMute],
  )

  useEffect(() => {
    // Sender callback videre når backend markerer økten som avsluttet.
    if (sessionEnded && onSessionEnd) onSessionEnd()
  }, [sessionEnded, onSessionEnd])

  useEffect(() => {
    // Auto-start skal kun skje én gang per presentasjon/session-oppsett.
    autoPresenterStartedRef.current = false
  }, [presentationId, autoStartPresenterSession])

  useEffect(() => {
    // Auto-start av presenter etter at initial data er klar og hook er tilkoblet.
    if (!autoStartPresenterSession || !isPresenter) return
    if (loading || !presentation) return
    if (sessionStarted) return
    if (autoPresenterStartedRef.current) return
    const timer = window.setTimeout(() => {
      startSession()
      autoPresenterStartedRef.current = true
    }, 80)
    return () => window.clearTimeout(timer)
  }, [
    autoStartPresenterSession,
    isPresenter,
    loading,
    presentation,
    sessionStarted,
    startSession,
  ])

  useEffect(() => {
    // Last inn presentasjonen via samme endpoint som vanlige deltakere bruker.
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
    // Variabler kan ligge globalt, på aktiv slide eller på første slide (legacy-fallback).
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
  const currentSlideData: PresenterSlideData = mergedSlideData
    ? ({
        ...mergedSlideData,
        title: resolveTextWithVariables(mergedSlideData.title, presentationVariables),
        content: resolveTextWithVariables(mergedSlideData.content, presentationVariables),
        fabricData: resolveFabricDataWithVariables(mergedSlideData.fabricData, presentationVariables),
      } as PresenterSlideData)
    : null

  const typedActivePoll = isActivePoll(activePoll) ? activePoll : null
  const typedActiveQuestion = isActiveQuestion(activeQuestion) ? activeQuestion : null

  const normalizedQuestionResults = useMemo<Record<string, NormalizedQuestionAggregate>>(() => {
    // Normaliserer backend-typer for trygg rendering i UI-komponentene.
    const entries = Object.entries(questionResults).map(([questionId, aggregate]) => {
      const rawType = aggregate?.question_type
      const normalizedType: LiveQuestionType | undefined =
        rawType === 'single_choice' || rawType === 'open_text' ? rawType : undefined

      return [
        questionId,
        {
          ...aggregate,
          question_type: normalizedType,
        },
      ] as const
    })

    return Object.fromEntries(entries)
  }, [questionResults])

  // Rå resultater for aktiv poll, slått opp med stabil string-id.
  const activePollResult = typedActivePoll
    ? pollResults[String(typedActivePoll.id)]
    : null
  const totalVotes = activePollResult?.total || 0
  const activePollId = typedActivePoll ? String(typedActivePoll.id) : ''
  // Brukes for å bytte fra svarskjema til resultatskjema etter innsending.
  const hasAnsweredActivePoll = Boolean(typedActivePoll && submittedPollIds[activePollId])
  // Tilsvarende oppslag for aktivt spørsmål.
  const activeQuestionResult = typedActiveQuestion
    ? normalizedQuestionResults[String(typedActiveQuestion.id)]
    : null
  const totalQuestionAnswers = activeQuestionResult?.total || 0
  const activeQuestionType: LiveQuestionType = activeQuestionResult?.question_type || 'open_text'
  const activeQuestionId = typedActiveQuestion ? String(typedActiveQuestion.id) : ''
  const hasAnsweredActiveQuestion = Boolean(typedActiveQuestion && submittedQuestionIds[activeQuestionId])

  // Samleflagg som styrer om interaksjons-overlay skal vises for publikum.
  const hasActivePoll = Boolean(typedActivePoll)
  const hasActiveQuestion = Boolean(typedActiveQuestion)
  const hasActiveInteraction = hasActivePoll || hasActiveQuestion

  const audienceResults = useMemo(() => {
    // Konverterer rå stemmetall til visningsklare rader med prosent.
    if (!typedActivePoll) return []
    const opts = typedActivePoll.options
    return opts.map((option) => {
      const votes = activePollResult?.results?.[option.text] || 0
      const percent = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0
      return { id: option.id, text: option.text, votes, percent }
    })
  }, [typedActivePoll, activePollResult, totalVotes])

  const activeQuestionChoiceResults = useMemo(() => {
    // Samme transformasjon for flervalg-spørsmål.
    if (!typedActiveQuestion || activeQuestionType !== 'single_choice') return []
    return (typedActiveQuestion.options || []).map((option) => {
      const count = activeQuestionResult?.results?.[option.text] || 0
      const percent = totalQuestionAnswers > 0 ? Math.round((count / totalQuestionAnswers) * 100) : 0
      return {
        id: option.id,
        text: option.text,
        count,
        percent,
      }
    })
  }, [typedActiveQuestion, activeQuestionResult, activeQuestionType, totalQuestionAnswers])

  const submitOpenQuestionAnswer = () => {
    // Beskytter mot tomme svar og innsending når presentatør har stengt svar.
    if (!typedActiveQuestion) return
    if (!interactionAcceptingAnswers) return

    const trimmedAnswer = questionAnswer.trim()
    if (!trimmedAnswer) return

    submitQuestionAnswer(typedActiveQuestion.id, trimmedAnswer)
    setQuestionAnswer('')
  }

  const embedLivePresenter = useMemo(
    // Presenter sender styringshendelser for video/iframe-avspilling.
    () => ({
      role: 'presenter' as const,
      slideIndex: currentSlide,
      embedPlayback,
      broadcastEmbedPlayback,
    }),
    [currentSlide, embedPlayback, broadcastEmbedPlayback],
  )

  const embedLiveAudience = useMemo(
    // Publikum mottar playback-state + lokalt volumgrensesnitt.
    () => ({
      role: 'audience' as const,
      slideIndex: currentSlide,
      embedPlayback,
      audienceHostedVolume: audienceVolMuted ? 0 : audienceVolLevel,
      audienceVolumeUi,
    }),
    [currentSlide, embedPlayback, audienceVolLevel, audienceVolMuted, audienceVolumeUi],
  )

  if (loading) {
    // Tydelig fallback mens vi henter presentasjonens første payload.
    return <div className={styles.loadingText}>Laster presentasjon...</div>
  }

  if (!presentation) {
    // Guard mot ugyldig id / manglende tilgang.
    return <div className={styles.missingText}>Presentasjon ikke funnet.</div>
  }

  if (!isPresenter) {
    // Publikum får kun publikumsvisning med svarinnsending og overlays.
    return (
      <div className={styles.audienceRoot}>
        <LivePresentationAudience
          presentation={presentation}
          currentSlide={currentSlide}
          currentSlideData={currentSlideData}
          participantCount={participantCount}
          liveboardForSlideIndex={liveboardForSlideIndex}
          hasActiveInteraction={hasActiveInteraction}
          activePoll={typedActivePoll}
          activeQuestion={typedActiveQuestion}
          pollResults={pollResults}
          questionResults={normalizedQuestionResults}
          sessionEnded={sessionEnded}
          submitPollAnswer={submitPollAnswer}
          submitQuestionAnswer={submitQuestionAnswer}
          audienceResults={audienceResults}
          activeQuestionChoiceResults={activeQuestionChoiceResults}
          activeQuestionType={activeQuestionType}
          hasAnsweredActivePoll={hasAnsweredActivePoll}
          hasAnsweredActiveQuestion={hasAnsweredActiveQuestion}
          interactionAcceptingAnswers={interactionAcceptingAnswers}
          totalVotes={totalVotes}
          totalQuestionAnswers={totalQuestionAnswers}
          questionAnswer={questionAnswer}
          setQuestionAnswer={setQuestionAnswer}
          submitOpenQuestionAnswer={submitOpenQuestionAnswer}
          onLeaveSession={onLeaveSession}
          embedLive={embedLiveAudience}
        />
      </div>
    )
  }

  // Presentatør får full kontrollvisning med navigasjon, verktøy og notater.
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
      stopInteractions={stopInteractions}
      interactionAcceptingAnswers={interactionAcceptingAnswers}
      pollResults={pollResults}
      questionResults={normalizedQuestionResults}
      sessionEnded={sessionEnded}
      embedLive={embedLivePresenter}
    />
  )
}

export default LivePresentation
