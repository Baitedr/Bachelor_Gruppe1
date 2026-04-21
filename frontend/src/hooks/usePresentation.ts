import { useEffect, useRef, useState } from 'react'
import { createConsumer } from '@rails/actioncable'
import api from '../services/api'

/** Kanal/JSON kan gi indeks som tall eller streng; må matche strengt mellom liveboard og currentSlide. */
const normalizeSlideIndex = (value: unknown): number | null => {
  if (value === null || value === undefined) return null
  const n = typeof value === 'number' ? value : parseInt(String(value), 10)
  return Number.isFinite(n) && n >= 0 ? n : null
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

  const cableRef = useRef<ReturnType<typeof createConsumer> | null>(null)
  const subscriptionRef = useRef<{ perform: (action: string, data: object) => void; unsubscribe: () => void } | null>(
    null,
  )

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
              break
            case 'poll_activated':
              setActivePoll(data.poll)
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
              setParticipantCount(data.count || 0)
              break
            case 'session_state':
              setParticipantCount(data.participant_count || 0)
              setSessionStarted(Boolean(data.session_started))
              setSessionEnded(Boolean(data.session_ended))
              break
            case 'session_started':
              setSessionStarted(true)
              if (typeof data.participant_count === 'number') {
                setParticipantCount(data.participant_count)
              }
              break
            case 'session_ended':
              setSessionEnded(true)
              break
            case 'question_activated':
              setActiveQuestion(data.question || null)
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

    const syncSessionState = async () => {
      try {
        const state = await api.getSessionState(presentationId)
        if (cancelled || !state) return

        if (typeof state.participant_count === 'number') {
          setParticipantCount(state.participant_count)
        }
        setSessionStarted(Boolean(state.session_started))
        setSessionEnded(Boolean(state.session_ended))
      } catch {
        // Keep websocket as primary transport; polling is best-effort fallback.
      }
    }

    void syncSessionState()
    const intervalId = window.setInterval(syncSessionState, 2000)

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
  }
}
