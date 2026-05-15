import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { X, Plus, Trash2, Save, XCircle } from 'lucide-react'

// Grenseverdier for antall svaralternativer i en poll.
const MIN_OPTIONS = 2
const MAX_OPTIONS = 10

type PollOptionInput = {
  text: string
  votes?: number
}

// Inndata ved redigering av eksisterende poll, alle felt er valgfrie.
type PollInputData = {
  id?: string | number
  question?: string
  options?: PollOptionInput[]
  createdAt?: string
}

// Utdata som sendes til onSave, alle felt er påkrevd.
type PollOutputData = {
  id: string | number
  question: string
  options: Array<{
    text: string
    votes: number
  }>
  createdAt: string
}

type PollCreatorProps = {
  initialData?: PollInputData | null
  onSave: (pollData: PollOutputData) => void
  onCancel?: () => void
}


// Skjema for å opprette eller redigere en poll.
// Brukes både i PresentationEditor (inline) og som frittstående komponent.
const PollCreator = ({ initialData = null, onSave, onCancel }: PollCreatorProps) => {
  const [pollQuestion, setPollQuestion] = useState<string>(initialData?.question || '')
  // Alternativer lagres som rene tekststrenger; konverteres til objekter ved lagring.
  const [pollOptions, setPollOptions] = useState<string[]>(
    initialData?.options?.map((opt) => opt.text) || Array(MIN_OPTIONS).fill('')
  )

  // Legger til et tomt alternativ så lenge vi er under maksimumsgrensen.
  const handleAddOption = () => {
    if (pollOptions.length < MAX_OPTIONS) {
      setPollOptions([...pollOptions, ''])
    }
  }

  // Fjerner alternativet på gitt indeks, men aldri under minimumsgrensen.
  const handleRemoveOption = (index: number) => {
    if (pollOptions.length > MIN_OPTIONS) {
      setPollOptions(pollOptions.filter((_, i) => i !== index))
    }
  }

  const handleOptionChange = (index: number, value: string) => {
    const newOptions = [...pollOptions]
    newOptions[index] = value
    setPollOptions(newOptions)
  }

  const handleSave = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    if (!pollQuestion.trim()) {
      alert('Vennligst skriv inn et spørsmål')
      return
    }

    // Filtrer ut tomme alternativer før validering og lagring.
    const validOptions = pollOptions.filter((opt) => opt.trim() !== '')
    if (validOptions.length < 2) {
      alert('Vennligst oppgi minst 2 alternativer')
      return
    }

    const pollData: PollOutputData = {
      // Behold eksisterende id ved redigering; generer ny ved oppretting.
      id: initialData?.id || Date.now(),
      question: pollQuestion,
      options: validOptions.map((opt) => ({
        text: opt,
        votes: 0,
      })),
      createdAt: initialData?.createdAt || new Date().toISOString(),
    }

    onSave(pollData)
  }

  // Nullstiller skjemaet til starttilstand uten å lukke det.
  const handleClear = () => {
    setPollQuestion('')
    setPollOptions(Array(MIN_OPTIONS).fill(''))
  }

  return (
    <div className='space-y-4'>
      <h2 className='text-xl font-semibold text-foreground'>Opprett en poll</h2>
      <form onSubmit={handleSave} className='space-y-6'>
        <div className='space-y-2'>
          <Label>Spørsmål</Label>
          <Input
            type='text'
            value={pollQuestion}
            onChange={(e) => setPollQuestion(e.target.value)}
            placeholder='Skriv inn spørsmålet ditt'
            maxLength={200}
          />
        </div>

        <div className='space-y-2'>
          <Label>Alternativer</Label>
          {pollOptions.map((option, index) => (
            <div key={index} className='flex items-center gap-2'>
              <Input
                type='text'
                value={option}
                onChange={(e) => handleOptionChange(index, e.target.value)}
                placeholder={`Alternativ ${index + 1}`}
                maxLength={100}
              />
              {pollOptions.length > MIN_OPTIONS && (
                <Button
                  type='button'
                  variant='ghost'
                  className='flex items-center justify-center bg-destructive/10 px-3 text-destructive transition-colors hover:bg-accent hover:text-foreground'
                  onClick={() => handleRemoveOption(index)}
                >
                  <X className='h-4 w-4' />
                </Button>
              )}
            </div>
          ))}
        </div>

        <div className='flex flex-wrap gap-2'>
          {pollOptions.length < MAX_OPTIONS && (
            <Button
              type='button'
              variant='outline'
              onClick={handleAddOption}
              className='flex items-center gap-1.5'
            >
              <Plus className='h-4 w-4' /> Legg til alternativ
            </Button>
          )}
          <Button
            type='button'
            variant='ghost'
            className='ml-auto flex items-center gap-1.5 text-muted-foreground hover:text-foreground'
            onClick={handleClear}
          >
            <Trash2 className='h-4 w-4' /> Tøm
          </Button>
          {onCancel && (
            <Button
              type='button'
              variant='outline'
              onClick={onCancel}
              className='flex items-center gap-1.5'
            >
              <XCircle className='h-4 w-4' /> Avbryt
            </Button>
          )}
          <Button type='submit' variant='default' className='ml-auto flex items-center gap-1.5'>
            <Save className='h-4 w-4' /> Lagre
          </Button>
        </div>
      </form>
    </div>
  )
}

export default PollCreator