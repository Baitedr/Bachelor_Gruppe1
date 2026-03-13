import { useEffect, useState } from 'react'
import { usePresentation } from '../hooks/usePresentation'
import api from '../services/api'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'

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

  const currentSlideData = presentation.slides[currentSlide]

  return (
    <div className='space-y-4'>
      <Card>
        <CardHeader className='pb-4'>
          <CardTitle className='text-xl'>{presentation.title}</CardTitle>
          <p className='text-sm text-muted-foreground'>
            Lysbilde {currentSlide + 1} av {presentation.slides.length}
          </p>
        </CardHeader>

        <CardContent>
          <div className='min-h-[420px] rounded-xl border border-border bg-card p-6'>
            {currentSlideData?.slide_elements?.length ? (
              <div className='space-y-3'>
                {currentSlideData.slide_elements.map((element) => (
                  <p key={element.id} className='text-base'>
                    {element.content?.text}
                  </p>
                ))}
              </div>
            ) : (
              <p className='text-sm text-muted-foreground'>Ingen elementer på dette lysbildet ennå.</p>
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
