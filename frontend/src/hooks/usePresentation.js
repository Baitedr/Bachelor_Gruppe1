import { useEffect, useState, useRef } from 'react';
import { createConsumer } from '@rails/actioncable';

export const usePresentation = (presentationid, token) => {
    const [currentSlide, setCurrentSlide] = useState(0);
    const [activePoll, setActivePoll] = useState(null);
    const [pollResults, setPollResults] = useState({});
    const [participantCount, setParticipantCount] = useState(0);
    const [sessionStarted, setSessionStarted] = useState(false);
    const cableRef = useRef(null);
    const subscriptionRef = useRef(null);

    useEffect(() => {
        if (!presentationid || !token) return

        const consumer = createConsumer(`ws://localhost:3000/cable?token=${token}`)
        cableRef.current = consumer

        const subscription = consumer.subscriptions.create(
            { channel: 'PresentationChannel', 
                presentation_id: presentationid },
        {
            received(data) {
              console.log('Mottatt', data);

              switch(data.type) {
                case 'slide_change':
                    setCurrentSlide(data.slide_index);
                    break;
                case 'poll_activated':
                    setActivePoll(data.poll);
                    break;
                case 'poll_results':
                    setPollResults(prev => ({
                        ...prev,
                        [data.poll_id]: {
                            results: data.results,
                            total: data.total
                        }
                    }));
                    break;
                case 'participant_joined':
                    setParticipantCount(data.count);
                    break;
                case 'session_started':
                    setSessionStarted(true);
                    break;
                    }
                }
            }
        )

        subscriptionRef.current = subscription

        return () => {
            subscription.unsubscribe()
            consumer.disconnect()
        }
    }, [presentationid, token])

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
        if (subscriptionRef.current) {
            subscriptionRef.current.perform('submit_poll_response', {
                poll_id: pollId,
                answer: answer
            })
        }
    }

    const startSession = () => {
        if (subscriptionRef.current) {
            subscriptionRef.current.perform('start_session', {})
        }
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
        startSession
    }
}