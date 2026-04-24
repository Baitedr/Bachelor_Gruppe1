import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '../ui/button'
import LivePresentationCanvas from './LivePresentationCanvas'
import LiveResultsBoard from './ui/LiveResultsBoard'

type PollAggregate = {
  results?: Record<string, number>
  total?: number
}

type QuestionAggregate = {
  results?: Record<string, number>
  total?: number
  recent_answers?: string[]
  question_type?: 'single_choice' | 'open_text'
}

export type PresenterSlideData = {
  title?: string
  content?: string
  notes?: string
  backgroundColor?: string
  fabricData?: unknown
  polls?: Array<{ id: string | number; question: string }>
  questions?: Array<{
    id: string | number
    prompt: string
    type?: string
    options?: Array<{ id: string | number; text: string }>
  }>
} | null

/** Ligger over lysbilde/liveboard; variant «liveboard» = annen tekst (samme steg som «hopp over resultat»). */
export const PresenterSlideNavToolbar = ({
  onPrev,
  onNext,
  canPrev,
  canNext,
  variant = 'slide',
  hoverOnly = false,
}: {
  onPrev: () => void
  onNext: () => void
  canPrev: boolean
  canNext: boolean
  variant?: 'slide' | 'liveboard'
  hoverOnly?: boolean
}) => {
  const prevLabel = variant === 'liveboard' ? 'Tilbake til lysbilde' : 'Forrige lysbilde'
  const nextLabel = 'Neste lysbilde'
  return (
    <div
      role='toolbar'
      aria-label='Lysbilde navigasjon'
      className={cn(
        'absolute bottom-2 left-2 z-10 flex items-center gap-px rounded-full border border-white/20 bg-black/55 p-0.5 shadow-md backdrop-blur-md dark:border-white/25 dark:bg-black/65',
        hoverOnly &&
          'opacity-0 transition-opacity duration-150 group-hover/slide:opacity-100 group-focus-within/slide:opacity-100 hover:opacity-100 focus-within:opacity-100',
      )}
    >
      <Button
        type='button'
        variant='ghost'
        size='icon'
        className='h-8 w-8 shrink-0 rounded-full border-0 bg-transparent p-0 text-white shadow-none hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white/45 focus-visible:ring-offset-0 disabled:pointer-events-none disabled:opacity-30'
        onClick={onPrev}
        disabled={!canPrev}
        aria-label={prevLabel}
      >
        <ChevronLeft className='h-4.5 w-4.5' strokeWidth={2} aria-hidden />
      </Button>
      <Button
        type='button'
        variant='ghost'
        size='icon'
        className='h-8 w-8 shrink-0 rounded-full border-0 bg-transparent p-0 text-white shadow-none hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white/45 focus-visible:ring-offset-0 disabled:pointer-events-none disabled:opacity-30'
        onClick={onNext}
        disabled={!canNext}
        aria-label={nextLabel}
      >
        <ChevronRight className='h-4.5 w-4.5' strokeWidth={2} aria-hidden />
      </Button>
    </div>
  )
}

const PresenterLiveboardPanel = ({
  currentSlideData,
  pollResults,
  questionResults,
  sessionEnded,
  onPrev,
  onNext,
  canPrev,
  canNext,
  hoverOnlyNavControls,
}: {
  currentSlideData: NonNullable<PresenterSlideData>
  pollResults: Record<string, PollAggregate>
  questionResults: Record<string, QuestionAggregate>
  sessionEnded: boolean
  onPrev: () => void
  onNext: () => void
  canPrev: boolean
  canNext: boolean
  hoverOnlyNavControls: boolean
}) => (
  <div className='relative flex h-full min-h-0 w-full flex-col'>
    <div className='min-h-0 flex-1 overflow-y-auto p-4'>
      <div className='flex w-full flex-col gap-4'>
        {(currentSlideData.polls || []).map((poll) => (
          <LiveResultsBoard
            key={`lb-poll-${poll.id}`}
            initialType='poll'
            initialItemId={poll.id}
            pollMeta={poll}
            pollResults={pollResults}
            questionResults={questionResults}
            sessionEnded={sessionEnded}
          />
        ))}
        {(currentSlideData.questions || []).map((question) => (
          <LiveResultsBoard
            key={`lb-q-${question.id}`}
            initialType='question'
            initialItemId={question.id}
            questionMeta={question}
            pollResults={pollResults}
            questionResults={questionResults}
            sessionEnded={sessionEnded}
          />
        ))}
      </div>
    </div>
    <PresenterSlideNavToolbar
      variant='liveboard'
      onPrev={onPrev}
      onNext={onNext}
      canPrev={canPrev}
      canNext={canNext}
      hoverOnly={hoverOnlyNavControls}
    />
  </div>
)

const slideShadowClass =
  'shadow-[0_22px_50px_-12px_rgba(15,23,42,0.28),0_10px_28px_-8px_rgba(15,23,42,0.14),0_2px_8px_-2px_rgba(15,23,42,0.08)] dark:shadow-[0_24px_56px_-10px_rgba(0,0,0,0.65),0_12px_32px_-8px_rgba(0,0,0,0.45)]'

export type PresenterSlideViewportProps = {
  currentSlideData: PresenterSlideData
  inLiveboardPhase: boolean
  sessionEnded: boolean
  pollResults: Record<string, PollAggregate>
  questionResults: Record<string, QuestionAggregate>
  onPrev: () => void
  onNext: () => void
  canPrev: boolean
  canNext: boolean
  navControlsMode?: 'always' | 'hover'
  /** Ekstra klasser på rot (f.eks. fullskjerm-bakgrunn). */
  className?: string
}

/**
 * Kun lysbilde-/liveboard-flaten (samme innhold som venstre kolonne hos presentatør).
 */
export function PresenterSlideViewport({
  currentSlideData,
  inLiveboardPhase,
  sessionEnded,
  pollResults,
  questionResults,
  onPrev,
  onNext,
  canPrev,
  canNext,
  navControlsMode = 'always',
  className = '',
}: PresenterSlideViewportProps) {
  const hoverOnlyNavControls = navControlsMode === 'hover'
  const inner = (
    <>
      {currentSlideData ? (
        inLiveboardPhase ? (
          <div className={`min-h-0 w-full min-w-0 flex-1 overflow-hidden rounded-lg bg-card ${slideShadowClass}`}>
            <PresenterLiveboardPanel
              currentSlideData={currentSlideData}
              pollResults={pollResults}
              questionResults={questionResults}
              sessionEnded={sessionEnded}
              onPrev={onPrev}
              onNext={onNext}
              canPrev={canPrev}
              canNext={canNext}
              hoverOnlyNavControls={hoverOnlyNavControls}
            />
          </div>
        ) : currentSlideData.fabricData ? (
          <div className='flex min-h-0 h-full min-w-0 flex-1 flex-col overflow-visible'>
            <LivePresentationCanvas
              slideData={currentSlideData}
              presenterToolbar={
                <PresenterSlideNavToolbar
                  onPrev={onPrev}
                  onNext={onNext}
                  canPrev={canPrev}
                  canNext={canNext}
                  hoverOnly={hoverOnlyNavControls}
                />
              }
            />
          </div>
        ) : (
          <div className='flex w-full min-h-0 flex-1 flex-col items-center justify-center'>
            <div
              className={`relative w-full max-w-3xl rounded-lg bg-card px-4 py-8 text-center ${slideShadowClass}`}
            >
              {currentSlideData.title && (
                <h2 className='text-3xl font-bold mb-6 text-foreground'>{currentSlideData.title}</h2>
              )}
              {currentSlideData.content && (
                <div className='text-xl whitespace-pre-wrap text-foreground'>{currentSlideData.content}</div>
              )}
              {!currentSlideData.title && !currentSlideData.content && (
                <p className='text-sm text-muted-foreground'>Dette lysbildet er tomt.</p>
              )}
              <PresenterSlideNavToolbar
                onPrev={onPrev}
                onNext={onNext}
                canPrev={canPrev}
                canNext={canNext}
                hoverOnly={hoverOnlyNavControls}
              />
            </div>
          </div>
        )
      ) : (
        <div className='flex h-full min-h-[12rem] w-full items-center justify-center rounded-lg border border-dashed border-border/60 p-6'>
          <p className='text-sm text-muted-foreground'>Ingen data for dette lysbildet.</p>
        </div>
      )}
    </>
  )

  return (
    <div className={cn('group/slide relative flex min-h-0 h-full min-w-0 flex-col overflow-visible', className)}>
      {inner}
    </div>
  )
}
