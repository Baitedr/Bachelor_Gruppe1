import { useState, useEffect } from 'react'
import {usePresentation} from '../hooks/usePresentation'
import api from '../services/api'

const LivePresentation = ({ presentationId, isPresenter }) => {
    const [presentation, setPresentation] = useState(null)
    const [loading, setLoading] = useState(true)

    const {
        currentSlide,
        activePoll,
        pollResults,
        navigateSlide,
        activatePoll,
        submitPollAnswer,
    } = usePresentation(presentationId, localStorage.getItem('auth_token'))

    useEffect(() => {
        loadPresentation()
    }, [presentationId])

    const loadPresentation = async () => {
        try {
            const response = await api.joinPresentation(presentationId)
            setPresentation(response.presentation)
        } catch (error) {
            console.error('error loading presentation', error)
        } finally {
            setLoading(false)
        }
    }
    const handleNextSlide = () => {
        if (presentation && currentSlide < presentation.slides.length - 1) {
            navigateSlide(currentSlide + 1)
        }
    }

    const handlePrevSlide = () => {
        if (currentSlide > 0) {
            navigateSlide(currentSlide - 1)
        }
    }

    const handleActivatePoll = (pollId) => {
        activatePoll(pollId)
    }

    const handlePollSubmit = (pollId, answer) => {
        submitPollAnswer(pollId, answer)
    }

    if (loading) return <div>laster presentasjon...</div>
    if (!presentation) return <div>presentasjon ikke funnet</div>

    const currentSlideData = presentation.slides[currentSlide]

    return (
        <div className="live-presentation" style={{ padding: '2rem' }}>
            <h2>{presentation.title}</h2>

            <div className="slide-viewer" style={{
                border: '2px solid #ccc',
                minHeight: '400px',
                padding: '2rem',
                marginBottom: '1rem',
            }}>
            
            <h3>Slide {currentSlide + 1} of {presentation.slides.length}</h3>
            {currentSlideData?.slide_elements?.map(element => (
                <div key={element.id}>{element.content?.text}</div>
            ))}
         </div>

         {isPresenter ? (
            <div className="presenter-controls">
                <button onClick={handlePrevSlide} disabled={currentSlide === 0}>
                    Forrige
                </button>
                <button onClick={handleNextSlide} disabled={currentSlide === presentation.slides.length - 1}>
                    Neste
                </button>

                {currentSlideData?.polls?.map(poll => (
                    <div key={poll.id} style={{ marginTop: '1rem' }}>
                        <button onClick={() => handleActivatePoll(poll.id)}>
                        Aktiver poll: {poll.question}
                        </button>
                        {pollResults[poll.id] && (
                            <div> 
                                <h4>Resultater ({pollResults[poll.id].total} stemmer):</h4>
                                {Object.entries(pollResults[poll.id].results).map(([answer, count]) => (
                                    <div key={answer}>{answer}: {count}</div>
                                ))}
                                </div>
                        )}
                    </div>
                ))}
            </div>
            ) : (
                <div className="participant-view">
                    {activePoll && (
                        <div style={{ marginTop: '1rem', padding: '1rem', border: '1px solid #ccc' }}>
                            <h3>{activePoll.question}</h3>
                            {activePoll.options.map(option => (
                                <button
                                key={option.id}
                                onClick={() => handlePollSubmit(activePoll.id, option.text)}
                                style={{ display: 'block', margin: '0.5rem 0'}}
                                >
                                {option.text}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
         )}
        </div>
      )
    }

export default LivePresentation