import {useEffect, useState} from 'react';
import { createConsumer } from '@rails/actioncable';

export const usePresentation = (presentationid) => {
    const [currentSlide, setCurrentSlide] = useState(0);
    const [activePoll, setActivePoll] = useState(null);
    const [pollResults, setPollResults] = useState({})
    const cableRef = useRef(null);
    const subscriptionRef = useRef(null);

    useEffect(() => {
        if (!presentationid || !token) return

        const consumer = createConsumer('ws://localhost:3000/cable?token=${token}')
        cableRef.current = consumer

        const subscription = consumer.subscriptions.create(
            { channel: 'PresentationChannel', 
                presentation_id: presentationid },
        {
            received(data) {
              console.log('Received', data);

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
                            total: data.total_votes
                        }
                    }))
                    break
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
            subscriptionRef.current.perform('submit_poll_answer', {
                poll_id: pollId,
                answer: answer
            })
        }
    }

    return {
        currentSlide,
        activePoll,
        pollResults,
        navigateSlide,
        activatePoll,
        submitPollAnswer
    }
}