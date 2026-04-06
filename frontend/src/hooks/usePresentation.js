import { useEffect, useState, useRef } from 'react';
import { createConsumer } from '@rails/actioncable';

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

  const cableRef = useRef(null);
  const subscriptionRef = useRef(null);

  useEffect(() => {
    if (!presentationId || !token) return

    const wsBase =
      import.meta.env.VITE_WS_URL ||
      (import.meta.env.DEV
        ? 'ws://localhost:3000'
        : `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`)
    const consumer = createConsumer(`${wsBase}/cable?token=${token}`)
    cableRef.current = consumer

    const subscription = consumer.subscriptions.create(
      { channel: 'PresentationChannel', presentation_id: presentationId },
      {
        received(data) {
          switch (data.type) {
            case 'slide_change':
              setCurrentSlide(data.slide_index)
              break
            case 'poll_activated':
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
            case 'session_started':
              setSessionStarted(true)
              break
            case 'session_ended':
              setSessionEnded(true)
              break
            default:
              break
            case 'question_activated':
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

  const navigateSlide = (slideIndex) => {
    if (subscriptionRef.current) {
      subscriptionRef.current.perform('navigate_slide', { slide_index: slideIndex })
    }
  }

  const activatePoll = (pollId) => {
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
    })
  }

  return {
    currentSlide,
    activePoll,
    pollResults,
    navigateSlide,
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