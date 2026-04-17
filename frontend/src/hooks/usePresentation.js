import { useEffect, useState, useRef } from 'react';
import { createConsumer } from '@rails/actioncable';
import api from '../services/api';

/** Kanal/JSON kan gi indeks som tall eller streng; må matche strengt mellom liveboard og currentSlide. */
const normalizeSlideIndex = (value) => {
  if (value === null || value === undefined) return null
  const n = typeof value === 'number' ? value : parseInt(String(value), 10)
  return Number.isFinite(n) && n >= 0 ? n : null
}

/** Én stabil deltaker-ID per nettleserfane, slik at flere deltakere ikke blokkerer hverandre selv med samme bruker. */
const getLiveClientId = () => {
  if (typeof window === 'undefined') return 'server'

  const storageKey = 'live_client_id'
  let clientId = window.sessionStorage.getItem(storageKey)

  if (!clientId) {
    clientId =
      window.crypto?.randomUUID?.() ||
      `live-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    window.sessionStorage.setItem(storageKey, clientId)
  }

  return clientId
}

export const usePresentation = (presentationId, token) => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [activePoll, setActivePoll] = useState(null);
  const [pollResults, setPollResults] = useState({});
  const [sessionEnded, setSessionEnded] = useState(false);
  const [participantCount, setParticipantCount] = useState(0);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [submittedPollIds, setSubmittedPollIds] = useState({});
  const [activeQuestion, setActiveQuestion] = useState(null);
  const [questionResults, setQuestionResults] = useState({});
  const [submittedQuestionIds, setSubmittedQuestionIds] = useState({});
  /** Når satt og lik currentSlide: alle klienter viser liveboard-resultater for dette lysbildet (synket via ActionCable). */
  const [liveboardForSlideIndex, setLiveboardForSlideIndex] = useState(null);

  const cableRef = useRef(null);
  const subscriptionRef = useRef(null);

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
        received(data) {
          switch (data.type) {
            case 'slide_change': {
              const idx = normalizeSlideIndex(data.slide_index)
              if (idx !== null) setCurrentSlide(idx)
              // Nytt lysbilde: fjern aktive poll/spørsmål slik at publikum ser sliden uten overlay.
              setActivePoll(null)
              setActiveQuestion(null)
              // Én melding med resume_liveboard: tilbake fra neste lysbilde til resultatside (unngår race med to WS-kall).
              const resume =
                data.resume_liveboard === true ||
                data.resume_liveboard === 'true'
              if (resume && idx !== null) {
                setLiveboardForSlideIndex(idx)
              } else {
                setLiveboardForSlideIndex(null)
              }
              break
            }
            case 'liveboard_started': {
              // Eldre server sendte interactions_cleared separat; uten flag antar vi fortsatt at poll/spørsmål skal bort.
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
              setActiveQuestion(null)
              setActivePoll(data.poll)
              break
            case 'poll_results':
              setPollResults((prev) => ({
                ...prev,
                [data.poll_id]: {
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
              setActivePoll(null)
              setActiveQuestion(data.question || null)
              break
            case 'question_results':
              setQuestionResults((prev) => ({
                ...prev,
                [data.question_id]: {
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
      }
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

  /** options.resumeLiveboard: gå til indeks og åpne liveboard i samme broadcast (kun presentatør «tilbake til resultat»). */
  const navigateSlide = (slideIndex, options = {}) => {
    if (subscriptionRef.current) {
      subscriptionRef.current.perform('navigate_slide', {
        slide_index: slideIndex,
        resume_liveboard: Boolean(options.resumeLiveboard),
      })
    }
  }

  /** Kall fra presentatør før «liveboard»-steget: publikum mister overlay, samme lysbilde. */
  const clearLiveInteractions = () => {
    if (subscriptionRef.current) {
      subscriptionRef.current.perform('clear_live_interactions', {})
    }
  }

  /** Synkron liveboard for alle (steg etter spørsmål, før faktisk neste lysbilde). */
  const showLiveboard = (slideIndex) => {
    if (subscriptionRef.current) {
      subscriptionRef.current.perform('show_liveboard', { slide_index: slideIndex })
    }
  }

  const dismissLiveboard = () => {
    if (subscriptionRef.current) {
      subscriptionRef.current.perform('dismiss_liveboard', {})
    }
  }

  const activatePoll = (pollId) => {
    setActiveQuestion(null)
    if (subscriptionRef.current) {
      subscriptionRef.current.perform('activate_poll', { poll_id: pollId })
    }
  }

  const submitPollAnswer = (pollId, answer) => {
    if (!subscriptionRef.current) return
    if (submittedPollIds[pollId]) return

    // Prevent double-click duplicate sends client-side
    setSubmittedPollIds((prev) => ({ ...prev, [pollId]: true }))

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

  // Spørsmål-funksjonalitet til LivePresentation
  const activateQuestion = (questionId) => {
    setActivePoll(null)
    if (subscriptionRef.current) {
      subscriptionRef.current.perform('activate_question', { question_id: questionId })
    }
  }

  const submitQuestionAnswer = (questionId, answer) => {
    if (!subscriptionRef.current) return
    if (submittedQuestionIds[questionId]) return

    setSubmittedQuestionIds((prev) => ({ ...prev, [questionId]: true }))
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
    clearLiveInteractions,
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