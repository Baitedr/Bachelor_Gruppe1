import React, { useEffect, useState } from 'react'
import PollCreator from './PollComponents/PollCreator'
import PollViewer from './PollComponents/PollViewer'
import api from '../services/api'
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { PlusCircle, List, ArrowLeft, Trash2 } from 'lucide-react'

const PollPage = ({ onNavigate, user }) => {
  const [activeTab, setActiveTab] = useState('create')
  const [polls, setPolls] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchPolls()
  }, [])

  const fetchPolls = async () => {
    try {
      setIsLoading(true)
      const data = await api.getPolls()
      setPolls(data.polls || [])
      setError(null)
    } catch {
      setError('Kunne ikke laste inn avstemninger')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSavePoll = async (pollData) => {
    try {
      const data = await api.createPoll({
        question: pollData.question,
        options: pollData.options.map((option) => option.text),
        poll_type: 'multiple_choice',
      })
      setPolls((previous) => [...previous, data.poll])
      setActiveTab('view')
      setError(null)
    } catch {
      setError('Kunne ikke lagre avstemning')
    }
  }

  const handleVote = async (pollId, optionId) => {
    try {
      const data = await api.votePoll(pollId, optionId)
      setPolls((previous) => previous.map((poll) => (poll.id === pollId ? data.poll : poll)))
      setError(null)
    } catch (err) {
      setError(err?.response?.data?.error || 'Kunne ikke stemme')
    }
  }

  const handleDeletePoll = async (pollId) => {
    try {
      await api.deletePoll(pollId)
      setPolls((previous) => previous.filter((poll) => poll.id !== pollId))
      setError(null)
    } catch {
      setError('Kunne ikke slette avstemning')
    }
  }

  return (
    <Card className='mx-auto w-full max-w-4xl'>
      <CardHeader className='space-y-4'>
        <div>
          <CardTitle>Avstemninger</CardTitle>
          <CardDescription>Lag nye polls eller vis resultater fra eksisterende.</CardDescription>
        </div>

        <div className='flex flex-wrap gap-2'>
          <Button
            variant={activeTab === 'create' ? 'default' : 'outline'}
            className="flex items-center gap-1.5"
            onClick={() => setActiveTab('create')}
          >
            <PlusCircle className="h-4 w-4" /> Opprett avstemning
          </Button>
          <Button variant={activeTab === 'view' ? 'default' : 'outline'} className="flex items-center gap-1.5" onClick={() => setActiveTab('view')}>
            <List className="h-4 w-4" /> Vis avstemninger ({polls.length})
          </Button>
          {onNavigate && (
            <Button className='ml-auto flex items-center gap-1.5' variant='ghost' onClick={() => onNavigate('home')}>
              <ArrowLeft className="h-4 w-4" /> Tilbake
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className='space-y-4'>
        {error && (
          <div className='rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive'>
            {error}
          </div>
        )}

        {activeTab === 'create' ? (
          <PollCreator onSave={handleSavePoll} />
        ) : isLoading ? (
          <p className='text-sm text-muted-foreground'>Laster avstemninger...</p>
        ) : polls.length === 0 ? (
          <div className='rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground'>
            Ingen avstemninger opprettet ennå.
          </div>
        ) : (
          <div className='space-y-4'>
            {polls.map((poll) => (
              <Card key={poll.id} className='mx-auto w-full max-w-3xl border-border/70'>
                <CardHeader className='flex flex-row items-start justify-between space-y-0 pb-2'>
                  <CardTitle className='text-base'>{poll.question}</CardTitle>
                    <Button size='sm' variant='outline' className='flex items-center gap-1.5 bg-destructive/15 text-destructive border-destructive/30 hover:bg-accent hover:text-accent-foreground hover:border-input transition-colors' onClick={() => handleDeletePoll(poll.id)}>
                      <Trash2 className="h-3.5 w-3.5" /> Slett
                  </Button>
                </CardHeader>
                <CardContent>
                  <PollViewer
                    pollData={poll}
                    userId={user?.id}
                    onVote={(optionId) => handleVote(poll.id, optionId)}
                  />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default PollPage
