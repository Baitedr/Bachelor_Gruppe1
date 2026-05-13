import { useCallback, useEffect, useRef, useState } from 'react'
import { createConsumer } from '@rails/actioncable'
import api from '../services/api'
import type { EmbedPlaybackPayload } from '../lib/embedLiveShared'

/** Kanal/JSON kan gi indeks som tall eller streng; må matche strengt mellom liveboard og currentSlide. */
const normalizeSlideIndex = (value: unknown): number | null => {
  if (value === null || value === undefined) return null
  const n = typeof value === 'number' ? value : parseInt(String(value), 10)
  return Number.isFinite(n) && n >= 0 ? n : null
}

const normalizeParticipantCount = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, parsed)
}

type CableReceived = {
  type?: string
  slide_index?: unknown
  resume_liveboard?: boolean | string
  clear_interactions?: boolean
  poll?: unknown
  poll_id?: string
  results?: Record<string, number>
  total?: number
  count?: number
  participant_count?: number
  session_started?: boolean
  session_ended?: boolean
  question?: unknown
  question_id?: string
  recent_answers?: string[]
  question_type?: string
  interaction_type?: string
  interaction_id?: string | number
  embed_key?: string
  state?: string
  time?: unknown
  seq?: unknown
}

export const usePresentation = (presentationId: string | number | null, token: string | null) => {
  const [currentSlide, setCurrentSlide] = useState(0)
  const [activePoll, setActivePoll] = useState<unknown>(null)
  const [pollResults, setPollResults] = useState<Record<string, { results?: Record<string, number>; total?: number }>>({})
  const [sessionEnded, setSessionEnded] = useState(false)
  const [participantCount, setParticipantCount] = useState(0)
  const [sessionStarted, setSessionStarted] = useState(false)
  const [submittedPollIds, setSubmittedPollIds] = useState<Record<string, boolean>>({})
  const [activeQuestion, setActiveQuestion] = useState<unknown>(null)
  const [questionResults, setQuestionResults] = useState<
    Record<
      string,
      {
        results?: Record<string, number>
        total?: number
        recent_answers?: string[]
        question_type?: string
      }
    >
  >({})
  const [submittedQuestionIds, setSubmittedQuestionIds] = useState<Record<string, boolean>>({})
  /** Når satt og lik currentSlide: alle klienter viser liveboard-resultater for dette lysbildet (synket via ActionCable). */
  const [liveboardForSlideIndex, setLiveboardForSlideIndex] = useState<number | null>(null)

  /** Synkronisert YouTube/Vimeo-avspilling (presentatør → alle klienter). */
  const [embedPlayback, setEmbedPlayback] = useState<EmbedPlaybackPayload | null>(null)
  const [interactionAcceptingAnswers, setInteractionAcceptingAnswers] = useState(true)

  const cableRef = useRef<ReturnType<typeof createConsumer> | null>(null)
  const subscriptionRef = useRef<{ perform: (action: string, data: object) => void; unsubscribe: () => void } | null>(
    null,
  )
  const lastRealtimeSessionStateAtRef = useRef<number>(0)

  useEffect(() => {
    if (!presentationId || !token) return

    setSessionEnded(false)
    setSessionStarted(false)
    setParticipantCount(0)

    const wsBase =
      import.meta.env.VITE_WS_URL ||
      `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`
    const consumer = createConsumer(`${wsBase}/cable?token=${token}`)
    cableRef.current = consumer

    const subscription = consumer.subscriptions.create(
      { channel: 'PresentationChannel', presentation_id: presentationId },
      {
        received(data: CableReceived) {
          switch (data.type) {
            case 'slide_change': {
              const idx = normalizeSlideIndex(data.slide_index)
              if (idx !== null) setCurrentSlide(idx)
              setActivePoll(null)
              setActiveQuestion(null)
              setInteractionAcceptingAnswers(true)
              setEmbedPlayback(null)
              const resume = data.resume_liveboard === true || data.resume_liveboard === 'true'
              if (resume && idx !== null) {
                setLiveboardForSlideIndex(idx)
              } else {
                setLiveboardForSlideIndex(null)
              }
              break
            }
            case 'liveboard_started': {
              if (data.clear_interactions !== false) {
                setActivePoll(null)
                setActiveQuestion(null)
                setInteractionAcceptingAnswers(true)
              }
              const lbIdx = normalizeSlideIndex(data.slide_index)
              if (lbIdx !== null) setLiveboardForSlideIndex(lbIdx)
              break
            }
            case 'liveboard_dismissed':
              setLiveboardForSlideIndex(null)
              break
            case 'interactions_cleared':
              setActivePoll(null)
              setActiveQuestion(null)
              setInteractionAcceptingAnswers(true)
              break
            case 'interactions_stopped':
              setInteractionAcceptingAnswers(false)
              break
            case 'poll_activated':
              setActivePoll(data.poll)
              setActiveQuestion(null)
              setInteractionAcceptingAnswers(true)
              break
            case 'poll_results':
              setPollResults((prev) => ({
                ...prev,
                [String(data.poll_id)]: {
                  results: data.results || {},
                  total: data.total || 0,
                },
              }))
              break
            case 'participant_joined':
              setParticipantCount(normalizeParticipantCount(data.count))
              lastRealtimeSessionStateAtRef.current = Date.now()
              break
            case 'session_state':
              setParticipantCount(normalizeParticipantCount(data.participant_count))
              setSessionStarted(Boolean(data.session_started))
              setSessionEnded(Boolean(data.session_ended))
              lastRealtimeSessionStateAtRef.current = Date.now()
              break
            case 'session_started':
              setSessionStarted(true)
              if (typeof data.participant_count === 'number') {
                setParticipantCount(normalizeParticipantCount(data.participant_count))
              }
              lastRealtimeSessionStateAtRef.current = Date.now()
              break
            case 'session_ended':
              setSessionEnded(true)
              lastRealtimeSessionStateAtRef.current = Date.now()
              break
            case 'question_activated':
              setActivePoll(null)
              setActiveQuestion(data.question || null)
              setInteractionAcceptingAnswers(true)
              break
            case 'question_results':
              setQuestionResults((prev) => ({
                ...prev,
                [String(data.question_id)]: {
                  results: data.results || {},
                  total: data.total || 0,
                  recent_answers: data.recent_answers || [],
                  question_type: data.question_type || 'open_text',
                },
              }))
              break
            case 'embed_playback': {
              // Publikum: oppdater innebygd video via postMessage (kun nyeste `seq`).
              const slideIdx = normalizeSlideIndex(data.slide_index)
              const key = (data.embed_key || '').toString()
              if (slideIdx === null || !key) break
              const st = data.state === 'play' ? 'play' : 'pause'
              setEmbedPlayback({
                slide_index: slideIdx,
                embed_key: key,
                state: st,
                time: Number(data.time) || 0,
                seq: Number(data.seq) || 0,
              })
              break
            }
            default:
              break
          }
        },
      },
    )

    subscriptionRef.current = subscription

    return () => {
      subscription.unsubscribe()
      consumer.disconnect()
    }
  }, [presentationId, token])

  useEffect(() => {
    if (!presentationId || !token) return

    let cancelled = false
    // Poll only as a fallback if websocket state has been silent.
    const realtimeFreshThresholdMs = 10_000

    const syncSessionState = async () => {
      const silenceMs = Date.now() - lastRealtimeSessionStateAtRef.current
      if (lastRealtimeSessionStateAtRef.current > 0 && silenceMs < realtimeFreshThresholdMs) {
        return
      }

      try {
        const state = await api.getSessionState(presentationId)
        if (cancelled || !state) return

        if (typeof state.participant_count === 'number') {
          setParticipantCount(normalizeParticipantCount(state.participant_count))
        }
        setSessionStarted(Boolean(state.session_started))
        setSessionEnded(Boolean(state.session_ended))
      } catch {
        // Keep websocket as primary transport; polling is best-effort fallback.
      }
    }

    void syncSessionState()
    const intervalId = window.setInterval(syncSessionState, 15_000)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [presentationId, token])

  const navigateSlide = (slideIndex: number, options: { resumeLiveboard?: boolean } = {}) => {
    if (subscriptionRef.current) {
      subscriptionRef.current.perform('navigate_slide', {
        slide_index: slideIndex,
        resume_liveboard: Boolean(options.resumeLiveboard),
      })
    }
  }

  const clearLiveInteractions = () => {
    if (subscriptionRef.current) {
      subscriptionRef.current.perform('clear_live_interactions', {})
    }
  }

  const showLiveboard = (slideIndex: number) => {
    if (subscriptionRef.current) {
      subscriptionRef.current.perform('show_liveboard', { slide_index: slideIndex })
    }
  }

  const dismissLiveboard = () => {
    if (subscriptionRef.current) {
      subscriptionRef.current.perform('dismiss_liveboard', {})
    }
  }

  /** Presentatør/projektor: send avspillingsposisjon til alle via `sync_embed_playback`. */
  const broadcastEmbedPlayback = useCallback((payload: EmbedPlaybackPayload) => {
    if (!subscriptionRef.current) return
    subscriptionRef.current.perform('sync_embed_playback', payload as unknown as object)
  }, [])

  const activatePoll = (pollId: string | number) => {
    if (subscriptionRef.current) {
      subscriptionRef.current.perform('activate_poll', { poll_id: pollId })
    }
  }

  const submitPollAnswer = (pollId: string | number, answer: string) => {
    if (!subscriptionRef.current) return
    const key = String(pollId)
    if (submittedPollIds[key]) return

    setSubmittedPollIds((prev) => ({ ...prev, [key]: true }))

    subscriptionRef.current.perform('submit_poll_response', {
      poll_id: pollId,
      answer,
    })
  }

  const startSession = () => {
    if (subscriptionRef.current) {
      subscriptionRef.current.perform('start_session', {})
    }
  }

  const stopInteractions = () => {
    if (subscriptionRef.current) {
      subscriptionRef.current.perform('stop_interactions', {})
    }
  }

  const activateQuestion = (questionId: string | number) => {
    if (subscriptionRef.current) {
      subscriptionRef.current.perform('activate_question', { question_id: questionId })
    }
  }

  const submitQuestionAnswer = (questionId: string | number, answer: string) => {
    if (!subscriptionRef.current) return
    const key = String(questionId)
    if (submittedQuestionIds[key]) return

    setSubmittedQuestionIds((prev) => ({ ...prev, [key]: true }))
    subscriptionRef.current.perform('submit_question_response', {
      question_id: questionId,
      answer,
    })
  }

  return {
    currentSlide,
    activePoll,
    pollResults,
    navigateSlide,
    liveboardForSlideIndex,
    showLiveboard,
    dismissLiveboard,
    activatePoll,
    submitPollAnswer,
    participantCount,
    sessionStarted,
    sessionEnded,
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
  }
}
