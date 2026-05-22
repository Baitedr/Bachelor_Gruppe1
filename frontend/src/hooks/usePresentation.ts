import { useCallback, useEffect, useRef, useState } from 'react'
import { createConsumer } from '@rails/actioncable'
import api from '@/services/api'
import type { EmbedPlaybackPayload } from '@/lib/embedLiveShared'

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
  sent_at_ms?: unknown
  /** `live_state_snapshot`-payload sendt fra backend ved (re)connect. */
  current_slide?: unknown
  liveboard_slide_index?: unknown
  active_interaction?: unknown
}

/**
 * Internt resultatobjekt for én poll/spørsmål. Brukes som verdi i resultat-maps.
 */
type PollResultsEntry = { results?: Record<string, number>; total?: number }
type QuestionResultsEntry = {
  results?: Record<string, number>
  total?: number
  recent_answers?: string[]
  question_type?: string
}

/** Hjelper for å hente verdier ut av ukjent payload uten å miste typesikkerhet. */
const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : null

/**
 * Én aktiv interaksjon om gangen — enten en poll ELLER et spørsmål. Tidligere hadde vi
 * to separate state-felter (`activePoll`, `activeQuestion`) som *skulle* være gjensidig
 * utelukkende, men i praksis kunne ende opp truthy samtidig hvis events kom i feil
 * rekkefølge etter reconnect. Da viste publikum begge seksjoner. Ved å gå via én
 * intern state-verdi er "begge synlig samtidig" umulig per konstruksjon.
 */
type ActiveInteractionState =
  | { kind: 'poll'; data: unknown; acceptingAnswers: boolean }
  | { kind: 'question'; data: unknown; acceptingAnswers: boolean }
  | null

const LIVE_CLIENT_ID_KEY = 'proslides-live-client-id'
/** How long the "Sender …" spinner is shown before switching to late-ack copy. */
const SUBMIT_PENDING_UI_MS = 12_000
/** How long we still accept a confirming `poll_results` / `question_results` after submit (slow Wi‑Fi). */
const SUBMIT_AWAITING_ACK_MS = 45_000

const getLiveClientId = (): string => {
  try {
    let id = sessionStorage.getItem(LIVE_CLIENT_ID_KEY)
    if (!id) {
      id = `c_${Math.random().toString(36).slice(2)}_${Date.now()}`
      sessionStorage.setItem(LIVE_CLIENT_ID_KEY, id)
    }
    return id
  } catch {
    return `c_${Date.now()}`
  }
}

export const usePresentation = (presentationId: string | number | null, token: string | null) => {
  const [currentSlide, setCurrentSlide] = useState(0)
  const [activeInteraction, setActiveInteraction] = useState<ActiveInteractionState>(null)
  const [pollResults, setPollResults] = useState<Record<string, PollResultsEntry>>({})
  const [sessionEnded, setSessionEnded] = useState(false)
  const [participantCount, setParticipantCount] = useState(0)
  const [sessionStarted, setSessionStarted] = useState(false)
  const [submittedPollIds, setSubmittedPollIds] = useState<Record<string, boolean>>({})
  const [pendingPollIds, setPendingPollIds] = useState<Record<string, boolean>>({})
  const [pollAwaitingLateAck, setPollAwaitingLateAck] = useState<Record<string, boolean>>({})
  const [questionResults, setQuestionResults] = useState<Record<string, QuestionResultsEntry>>({})
  const [submittedQuestionIds, setSubmittedQuestionIds] = useState<Record<string, boolean>>({})
  const [pendingQuestionIds, setPendingQuestionIds] = useState<Record<string, boolean>>({})
  const [questionAwaitingLateAck, setQuestionAwaitingLateAck] = useState<Record<string, boolean>>({})
  const submittedPollIdsRef = useRef<Record<string, boolean>>({})
  const submittedQuestionIdsRef = useRef<Record<string, boolean>>({})
  /** Når satt og lik currentSlide: alle klienter viser liveboard-resultater for dette lysbildet (synket via ActionCable). */
  const [liveboardForSlideIndex, setLiveboardForSlideIndex] = useState<number | null>(null)

  /** Synkronisert YouTube/Vimeo-avspilling (presentatør → alle klienter). */
  const [embedPlayback, setEmbedPlayback] = useState<EmbedPlaybackPayload | null>(null)

  // Avledede verdier — eksponert med samme navn som før så ingen consumer trenger endring.
  const activePoll = activeInteraction?.kind === 'poll' ? activeInteraction.data : null
  const activeQuestion = activeInteraction?.kind === 'question' ? activeInteraction.data : null
  const interactionAcceptingAnswers = activeInteraction ? activeInteraction.acceptingAnswers : true

  const cableRef = useRef<ReturnType<typeof createConsumer> | null>(null)
  const subscriptionRef = useRef<{ perform: (action: string, data: object) => void; unsubscribe: () => void } | null>(
    null,
  )
  const lastRealtimeSessionStateAtRef = useRef<number>(0)
  const pendingPollIdsRef = useRef<Record<string, boolean>>({})
  const pendingQuestionIdsRef = useRef<Record<string, boolean>>({})
  const pendingPollTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const pendingQuestionTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const submitAwaitingPollRef = useRef<Record<string, boolean>>({})
  const submitAwaitingQuestionRef = useRef<Record<string, boolean>>({})
  const submitAwaitingPollTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const submitAwaitingQuestionTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const confirmPollSubmissionRef = useRef<(pollId: string, total: number, force?: boolean) => void>(() => {})
  const confirmQuestionSubmissionRef = useRef<(questionId: string, total: number, force?: boolean) => void>(
    () => {},
  )
  const pollTotalAtSubmitRef = useRef<Record<string, number>>({})
  const questionTotalAtSubmitRef = useRef<Record<string, number>>({})
  const pollResultsRef = useRef(pollResults)
  const questionResultsRef = useRef(questionResults)
  pollResultsRef.current = pollResults
  questionResultsRef.current = questionResults

  const clearPollPending = useCallback((key: string) => {
    delete pendingPollIdsRef.current[key]
    const timer = pendingPollTimersRef.current[key]
    if (timer) clearTimeout(timer)
    delete pendingPollTimersRef.current[key]
    setPendingPollIds((prev) => {
      if (!prev[key]) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }, [])

  const clearQuestionPending = useCallback((key: string) => {
    delete pendingQuestionIdsRef.current[key]
    const timer = pendingQuestionTimersRef.current[key]
    if (timer) clearTimeout(timer)
    delete pendingQuestionTimersRef.current[key]
    setPendingQuestionIds((prev) => {
      if (!prev[key]) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }, [])

  const clearPollAwaiting = useCallback((key: string) => {
    delete submitAwaitingPollRef.current[key]
    const timer = submitAwaitingPollTimersRef.current[key]
    if (timer) clearTimeout(timer)
    delete submitAwaitingPollTimersRef.current[key]
    setPollAwaitingLateAck((prev) => {
      if (!prev[key]) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }, [])

  const clearQuestionAwaiting = useCallback((key: string) => {
    delete submitAwaitingQuestionRef.current[key]
    const timer = submitAwaitingQuestionTimersRef.current[key]
    if (timer) clearTimeout(timer)
    delete submitAwaitingQuestionTimersRef.current[key]
    setQuestionAwaitingLateAck((prev) => {
      if (!prev[key]) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }, [])

  const confirmPollSubmission = useCallback(
    (pollId: string, total: number, force = false) => {
      const key = String(pollId)
      const awaitingAck = submitAwaitingPollRef.current[key]
      const pendingUi = pendingPollIdsRef.current[key]
      if (!awaitingAck && !pendingUi) return
      const baseline = pollTotalAtSubmitRef.current[key] ?? 0
      if (!force && awaitingAck && total <= baseline) return

      delete pollTotalAtSubmitRef.current[key]
      clearPollPending(key)
      clearPollAwaiting(key)
      submittedPollIdsRef.current[key] = true
      setSubmittedPollIds((prev) => ({ ...prev, [key]: true }))
    },
    [clearPollPending, clearPollAwaiting],
  )

  const confirmQuestionSubmission = useCallback(
    (questionId: string, total: number, force = false) => {
      const key = String(questionId)
      const awaitingAck = submitAwaitingQuestionRef.current[key]
      const pendingUi = pendingQuestionIdsRef.current[key]
      if (!awaitingAck && !pendingUi) return
      const baseline = questionTotalAtSubmitRef.current[key] ?? 0
      if (!force && awaitingAck && total <= baseline) return

      delete questionTotalAtSubmitRef.current[key]
      clearQuestionPending(key)
      clearQuestionAwaiting(key)
      submittedQuestionIdsRef.current[key] = true
      setSubmittedQuestionIds((prev) => ({ ...prev, [key]: true }))
    },
    [clearQuestionPending, clearQuestionAwaiting],
  )

  confirmPollSubmissionRef.current = confirmPollSubmission
  confirmQuestionSubmissionRef.current = confirmQuestionSubmission

  const schedulePollPending = useCallback(
    (key: string) => {
      pendingPollIdsRef.current[key] = true
      setPendingPollIds((prev) => ({ ...prev, [key]: true }))
      const existingPendingTimer = pendingPollTimersRef.current[key]
      if (existingPendingTimer) clearTimeout(existingPendingTimer)
      pendingPollTimersRef.current[key] = setTimeout(() => {
        clearPollPending(key)
        if (submitAwaitingPollRef.current[key]) {
          setPollAwaitingLateAck((prev) => ({ ...prev, [key]: true }))
        }
      }, SUBMIT_PENDING_UI_MS)

      submitAwaitingPollRef.current[key] = true
      const existingAckTimer = submitAwaitingPollTimersRef.current[key]
      if (existingAckTimer) clearTimeout(existingAckTimer)
      submitAwaitingPollTimersRef.current[key] = setTimeout(() => {
        clearPollAwaiting(key)
      }, SUBMIT_AWAITING_ACK_MS)
    },
    [clearPollPending, clearPollAwaiting],
  )

  const scheduleQuestionPending = useCallback(
    (key: string) => {
      pendingQuestionIdsRef.current[key] = true
      setPendingQuestionIds((prev) => ({ ...prev, [key]: true }))
      const existingPendingTimer = pendingQuestionTimersRef.current[key]
      if (existingPendingTimer) clearTimeout(existingPendingTimer)
      pendingQuestionTimersRef.current[key] = setTimeout(() => {
        clearQuestionPending(key)
        if (submitAwaitingQuestionRef.current[key]) {
          setQuestionAwaitingLateAck((prev) => ({ ...prev, [key]: true }))
        }
      }, SUBMIT_PENDING_UI_MS)

      submitAwaitingQuestionRef.current[key] = true
      const existingAckTimer = submitAwaitingQuestionTimersRef.current[key]
      if (existingAckTimer) clearTimeout(existingAckTimer)
      submitAwaitingQuestionTimersRef.current[key] = setTimeout(() => {
        clearQuestionAwaiting(key)
      }, SUBMIT_AWAITING_ACK_MS)
    },
    [clearQuestionPending, clearQuestionAwaiting],
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
              setActiveInteraction(null)
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
                setActiveInteraction(null)
              }
              const lbIdx = normalizeSlideIndex(data.slide_index)
              if (lbIdx !== null) setLiveboardForSlideIndex(lbIdx)
              break
            }
            case 'liveboard_dismissed':
              setLiveboardForSlideIndex(null)
              break
            case 'interactions_cleared':
              setActiveInteraction(null)
              break
            case 'interactions_stopped':
              // Behold hvilken interaksjon som er aktiv, men marker som stengt for svar.
              setActiveInteraction((prev) =>
                prev ? { ...prev, acceptingAnswers: false } : prev,
              )
              break
            case 'poll_activated':
              setActiveInteraction({
                kind: 'poll',
                data: data.poll ?? null,
                acceptingAnswers: true,
              })
              break
            case 'poll_response_accepted': {
              const pollId = String(data.poll_id)
              confirmPollSubmissionRef.current(pollId, 0, true)
              break
            }
            case 'poll_results': {
              const pollId = String(data.poll_id)
              const total = data.total || 0
              setPollResults((prev) => ({
                ...prev,
                [pollId]: {
                  results: data.results || {},
                  total,
                },
              }))
              confirmPollSubmissionRef.current(pollId, total)
              break
            }
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
              setActiveInteraction({
                kind: 'question',
                data: data.question ?? null,
                acceptingAnswers: true,
              })
              break
            case 'question_response_accepted': {
              const questionId = String(data.question_id)
              confirmQuestionSubmissionRef.current(questionId, 0, true)
              break
            }
            case 'question_results': {
              const questionId = String(data.question_id)
              const total = data.total || 0
              setQuestionResults((prev) => ({
                ...prev,
                [questionId]: {
                  results: data.results || {},
                  total,
                  recent_answers: data.recent_answers || [],
                  question_type: data.question_type || 'open_text',
                },
              }))
              confirmQuestionSubmissionRef.current(questionId, total)
              break
            }
            case 'live_state_snapshot': {
              // Sendt kun til denne klienten ved (re)connect. Brukes til full resync
              // så audience som blir med midt i økten umiddelbart får riktig slide,
              // liveboard og evt. aktiv interaksjon — uten å vente på neste handling.
              const slideIdx = normalizeSlideIndex(data.current_slide)
              if (slideIdx !== null) setCurrentSlide(slideIdx)

              const lbIdx = normalizeSlideIndex(data.liveboard_slide_index)
              setLiveboardForSlideIndex(lbIdx)

              const interaction = asRecord(data.active_interaction)
              if (!interaction) {
                setActiveInteraction(null)
                break
              }

              const interactionKind = interaction.type === 'poll'
                ? 'poll'
                : interaction.type === 'question'
                  ? 'question'
                  : null
              if (!interactionKind) {
                setActiveInteraction(null)
                break
              }

              const accepting = interaction.accepting_answers !== false

              if (interactionKind === 'poll') {
                const pollData = interaction.poll ?? null
                setActiveInteraction({ kind: 'poll', data: pollData, acceptingAnswers: accepting })
                const results = asRecord(interaction.poll_results)
                const pollId = asRecord(pollData)?.id
                if (results && pollId != null) {
                  const snapshotTotal = typeof results.total === 'number' ? results.total : 0
                  setPollResults((prev) => ({
                    ...prev,
                    [String(pollId)]: {
                      results: (results.results as Record<string, number>) || {},
                      total: snapshotTotal,
                    },
                  }))
                  confirmPollSubmissionRef.current(String(pollId), snapshotTotal)
                }
              } else {
                const questionData = interaction.question ?? null
                setActiveInteraction({
                  kind: 'question',
                  data: questionData,
                  acceptingAnswers: accepting,
                })
                const results = asRecord(interaction.question_results)
                const qId = asRecord(questionData)?.id
                if (results && qId != null) {
                  const snapshotTotal = typeof results.total === 'number' ? results.total : 0
                  setQuestionResults((prev) => ({
                    ...prev,
                    [String(qId)]: {
                      results: (results.results as Record<string, number>) || {},
                      total: snapshotTotal,
                      recent_answers: Array.isArray(results.recent_answers)
                        ? (results.recent_answers as string[])
                        : [],
                      question_type:
                        typeof results.question_type === 'string'
                          ? (results.question_type as string)
                          : 'open_text',
                    },
                  }))
                  confirmQuestionSubmissionRef.current(String(qId), snapshotTotal)
                }
              }

              lastRealtimeSessionStateAtRef.current = Date.now()
              break
            }
            case 'embed_playback': {
              // Publikum: oppdater innebygd video via spiller-API (kun nyeste `seq`).
              const slideIdx = normalizeSlideIndex(data.slide_index)
              const key = (data.embed_key || '').toString()
              if (slideIdx === null || !key) break
              const st = data.state === 'play' ? 'play' : 'pause'
              const rawSentAt = data.sent_at_ms
              const sentAtMs =
                typeof rawSentAt === 'number'
                  ? rawSentAt
                  : rawSentAt != null
                    ? Number(rawSentAt)
                    : undefined
              setEmbedPlayback({
                slide_index: slideIdx,
                embed_key: key,
                state: st,
                time: Number(data.time) || 0,
                seq: Number(data.seq) || 0,
                sent_at_ms: Number.isFinite(sentAtMs) ? (sentAtMs as number) : undefined,
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
      subscriptionRef.current = null
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

  const submitPollAnswer = (pollId: string | number, answer: string, optionId?: string | number) => {
    if (!subscriptionRef.current) return
    const key = String(pollId)
    if (
      submittedPollIdsRef.current[key] ||
      pendingPollIdsRef.current[key] ||
      submitAwaitingPollRef.current[key]
    ) {
      return
    }

    pollTotalAtSubmitRef.current[key] = pollResultsRef.current[key]?.total ?? 0
    schedulePollPending(key)
    const payload: Record<string, unknown> = {
      poll_id: pollId,
      answer,
      client_id: getLiveClientId(),
    }
    if (optionId != null) payload.option_id = optionId
    subscriptionRef.current.perform('submit_poll_response', payload)
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
    if (
      submittedQuestionIdsRef.current[key] ||
      pendingQuestionIdsRef.current[key] ||
      submitAwaitingQuestionRef.current[key]
    ) {
      return
    }

    questionTotalAtSubmitRef.current[key] = questionResultsRef.current[key]?.total ?? 0
    scheduleQuestionPending(key)
    subscriptionRef.current.perform('submit_question_response', {
      question_id: questionId,
      answer,
      client_id: getLiveClientId(),
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
    pendingPollIds,
    pollAwaitingLateAck,
    activeQuestion,
    questionResults,
    activateQuestion,
    submitQuestionAnswer,
    submittedQuestionIds,
    pendingQuestionIds,
    questionAwaitingLateAck,
    embedPlayback,
    broadcastEmbedPlayback,
    stopInteractions,
    interactionAcceptingAnswers,
  }
}
