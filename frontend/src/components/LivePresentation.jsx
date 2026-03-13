import { useEffect, useState } from 'react'
import { usePresentation } from '../hooks/usePresentation'
import api from '../services/api'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import LivePresentationCanvas from './LivePresentationCanvas'

const LivePresentation = ({ presentationId, isPresenter, onSessionEnd }) => {
  const [presentation, setPresentation] = useState(null)
  const [loading, setLoading] = useState(true)

  const {
    currentSlide,
    activePoll,
    pollResults,
    participantCount,
    navigateSlide,
    activatePoll,
    submitPollAnswer,
    sessionEnded,
  } = usePresentation(presentationId, localStorage.getItem('auth_token'))

  useEffect(() => {
    if (sessionEnded && onSessionEnd) {
      onSessionEnd()
    }
  }, [sessionEnded, onSessionEnd])

  useEffect(() => {
    const loadPresentation = async () => {
      try {
        const response = await api.joinPresentation(presentationId)
        setPresentation(response.presentation)
      } catch (error) {
        console.error('feil ved innlasting av presentasjon', error)
      } finally {
        setLoading(false)
      }
    }

    loadPresentation()
  }, [presentationId])

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

  if (loading) {
    return <div className='text-sm text-muted-foreground'>Laster presentasjon...</div>
  }

  if (!presentation) {
    return <div className='text-sm text-muted-foreground'>Presentasjon ikke funnet.</div>
  }

  const rawSlideData = presentation.slides[currentSlide]
  
  // Sikrer at vi har data på rotnivå uavhengig av om backenden sender .background eller flatt
  const currentSlideData = rawSlideData?.background 
    ? { ...rawSlideData, ...rawSlideData.background } 
    : rawSlideData;

  return (
    <div className='space-y-4'>
      <Card>
        <CardHeader className='pb-4 flex flex-row items-center justify-between'>
          <div>
            <CardTitle className='text-xl'>{presentation.title}</CardTitle>
            <p className='text-sm text-muted-foreground'>
              Lysbilde {currentSlide + 1} av {presentation.slides.length}
            </p>
          </div>
          <div className='flex items-center gap-2'>
            <span className='text-sm font-medium'>Deltakere:</span>
            <span className='px-2 py-1 bg-secondary text-secondary-foreground rounded-md font-bold'>{participantCount}</span>
          </div>
        </CardHeader>
        <CardContent>
          <div className='min-h-[420px] rounded-xl border border-border p-6 flex flex-col justify-center items-center' style={{ backgroundColor: currentSlideData?.backgroundColor || 'hsl(var(--card))' }}>
            {currentSlideData ? (
              currentSlideData.fabricData ? (
                <LivePresentationCanvas slideData={currentSlideData} />
              ) : (
                <div className="w-full flex-grow text-center flex flex-col justify-center items-center">
                  {currentSlideData.title && (
                    <h2 className='text-3xl font-bold mb-6 text-foreground'>{currentSlideData.title}</h2>
                  )}
                  {currentSlideData.content && (
                    <div className='text-xl whitespace-pre-wrap text-foreground'>
                      {currentSlideData.content}
                    </div>
                  )}
                  {!currentSlideData.title && !currentSlideData.content && (
                    <p className='text-sm text-muted-foreground'>Dette lysbildet er tomt.</p>
                  )}
                </div>
              )
            ) : (
              <p className='text-sm text-muted-foreground'>Ingen data for dette lysbildet.</p>
            )}
          </div>
        </CardContent>
      </Card>

      {isPresenter ? (
        <Card>
          <CardContent className='space-y-4 p-4'>
            <div className='flex flex-wrap gap-2'>
              <Button onClick={handlePrevSlide} disabled={currentSlide === 0} variant='outline'>
                Forrige
              </Button>
              <Button
                onClick={handleNextSlide}
                disabled={currentSlide === presentation.slides.length - 1}
                variant='outline'
              >
                Neste
              </Button>
            </div>

            {currentSlideData?.polls?.map((poll) => (
              <div key={poll.id} className='space-y-2 rounded-lg border border-border p-3'>
                <Button onClick={() => activatePoll(poll.id)}>Aktiver poll: {poll.question}</Button>
                {pollResults[poll.id] && (
                  <div className='space-y-1 text-sm'>
                    <p className='font-medium'>Resultater ({pollResults[poll.id].total} stemmer)</p>
                    {Object.entries(pollResults[poll.id].results).map(([answer, count]) => (
                      <p key={answer} className='text-muted-foreground'>
                        {answer}: {count}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : (
        activePoll && (
          <Card>
            <CardHeader className='pb-2'>
              <CardTitle className='text-lg'>{activePoll.question}</CardTitle>
            </CardHeader>
            <CardContent className='space-y-2'>
              {activePoll.options.map((option) => (
                <Button
                  key={option.id}
                  className='w-full justify-start'
                  variant='outline'
                  onClick={() => submitPollAnswer(activePoll.id, option.text)}
                >
                  {option.text}
                </Button>
              ))}
            </CardContent>
          </Card>
        )
      )}
    </div>
  )
}

export default LivePresentation
