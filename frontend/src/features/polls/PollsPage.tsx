import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PlusCircle, List, ArrowLeft, Trash2 } from 'lucide-react'
import api from '@/services/api'
import PollCreator from './components/PollCreator'
import PollViewer from './components/PollViewer'

type PollOption = {
  id: string | number
  text: string
  votes?: number
}

type Poll = {
  id: string | number
  question: string
  options: PollOption[]
}

type PollCreatorData = {
  question: string
  options: Array<{ text: string }>
}

type PollPageProps = {
  onNavigate?: (page: string) => void
  user?: {
    id?: string | number
  } | null
}

const PollPage = ({ onNavigate, user }: PollPageProps) => {
  const [activeTab, setActiveTab] = useState<'create' | 'view'>('create')
  const [polls, setPolls] = useState<Poll[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void fetchPolls()
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

  const handleSavePoll = async (pollData: PollCreatorData) => {
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

  const handleVote = async (pollId: string | number, optionId: string | number) => {
    try {
      const data = await api.votePoll(pollId, optionId)
      setPolls((previous) => previous.map((poll) => (poll.id === pollId ? data.poll : poll)))
      setError(null)
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Kunne ikke stemme')
    }
  }

  const handleDeletePoll = async (pollId: string | number) => {
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
            className='flex items-center gap-1.5'
            onClick={() => setActiveTab('create')}
          >
            <PlusCircle className='h-4 w-4' /> Opprett avstemning
          </Button>
          <Button
            variant={activeTab === 'view' ? 'default' : 'outline'}
            className='flex items-center gap-1.5'
            onClick={() => setActiveTab('view')}
          >
            <List className='h-4 w-4' /> Vis avstemninger ({polls.length})
          </Button>
          {onNavigate && (
            <Button
              className='ml-auto flex items-center gap-1.5'
              variant='ghost'
              onClick={() => onNavigate('home')}
            >
              <ArrowLeft className='h-4 w-4' /> Tilbake
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
                  <Button
                    size='sm'
                    variant='outline'
                    className='flex items-center gap-1.5 border-destructive/30 bg-destructive/15 text-destructive transition-colors hover:border-input hover:bg-accent hover:text-accent-foreground'
                    onClick={() => handleDeletePoll(poll.id)}
                  >
                    <Trash2 className='h-3.5 w-3.5' /> Slett
                  </Button>
                </CardHeader>
                <CardContent>
                  <PollViewer
                    pollData={poll}
                    userId={user?.id}
                    onVote={(optionId: string | number) => handleVote(poll.id, optionId)}
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