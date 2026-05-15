import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import LivePresentationCanvas from './LivePresentationCanvas'
import LiveResultsBoard from './ui/LiveResultsBoard'
import type { SlideEmbedLiveContext } from '@/features/editor/SlideEmbedOverlays'

/**
 * Felles viewport for presentatør: vanlig slide, fabric-slide eller liveboard.
 * @author T3lluz
 */
const styles = {
  navToolbarBase:
    'absolute bottom-2 left-2 z-10 flex items-center gap-px rounded-full border border-white/20 bg-black/55 p-0.5 shadow-md backdrop-blur-md dark:border-white/25 dark:bg-black/65',
  navToolbarHover:
    'opacity-0 transition-opacity duration-150 group-hover/slide:opacity-100 group-focus-within/slide:opacity-100 hover:opacity-100 focus-within:opacity-100',
  navButton:
    'h-8 w-8 shrink-0 rounded-full border-0 bg-transparent p-0 text-white shadow-none hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white/45 focus-visible:ring-offset-0 disabled:pointer-events-none disabled:opacity-30',
  navIcon: 'h-4.5 w-4.5',
  liveboardPanelRoot: 'relative flex h-full min-h-0 w-full flex-col',
  liveboardPanelScroll: 'min-h-0 flex-1 overflow-y-auto p-4',
  liveboardPanelList: 'flex w-full flex-col gap-4',
  liveboardViewport: 'min-h-0 w-full min-w-0 flex-1 overflow-hidden rounded-lg bg-card',
  fabricSlideWrap: 'flex min-h-0 h-full min-w-0 flex-1 flex-col overflow-visible',
  textSlideStage: 'flex w-full min-h-0 flex-1 flex-col items-center justify-center',
  textSlideCard: 'relative w-full max-w-3xl rounded-lg bg-card px-4 py-8 text-center',
  textSlideTitle: 'mb-6 text-3xl font-bold text-foreground',
  textSlideContent: 'whitespace-pre-wrap text-xl text-foreground',
  emptySlideText: 'text-sm text-muted-foreground',
  emptyDataWrap: 'flex h-full min-h-48 w-full items-center justify-center rounded-lg border border-dashed border-border/60 p-6',
  root: 'group/slide relative flex min-h-0 h-full min-w-0 flex-col overflow-visible',
} as const

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
  fabricData?: { [key: string]: unknown; width?: number; height?: number }
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
  // Variant styrer tekst for "tilbake"-knappen når vi står i liveboard-fase.
  const prevLabel = variant === 'liveboard' ? 'Tilbake til lysbilde' : 'Forrige lysbilde'
  const nextLabel = 'Neste lysbilde'
  return (
    // Flytende toolbar over slideflate/liveboard, samme handlinger begge steder.
    <div
      role='toolbar'
      aria-label='Lysbilde navigasjon'
      className={cn(
        styles.navToolbarBase,
        hoverOnly && styles.navToolbarHover,
      )}
    >
      <Button
        type='button'
        variant='ghost'
        size='icon'
        className={styles.navButton}
        onClick={onPrev}
        disabled={!canPrev}
        aria-label={prevLabel}
      >
        <ChevronLeft className={styles.navIcon} strokeWidth={2} aria-hidden />
      </Button>
      <Button
        type='button'
        variant='ghost'
        size='icon'
        className={styles.navButton}
        onClick={onNext}
        disabled={!canNext}
        aria-label={nextLabel}
      >
        <ChevronRight className={styles.navIcon} strokeWidth={2} aria-hidden />
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
  // Én samlet resultatside per interaktivt element på lysbildet.
  <div className={styles.liveboardPanelRoot}>
    <div className={styles.liveboardPanelScroll}>
      <div className={styles.liveboardPanelList}>
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
  /** Synkronisering av innebygde videoer (kun når Fabric-slide vises). */
  embedLive?: SlideEmbedLiveContext | null
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
  embedLive = null,
}: PresenterSlideViewportProps) {
  // Hover-modus skjuler navigasjon til bruker peker/fokuserer over slide.
  const hoverOnlyNavControls = navControlsMode === 'hover'
  // `inner` gjør JSX mer lesbar ved å holde grenlogikk for ulike slide-typer samlet.
  const inner = (
    <>
      {currentSlideData ? (
        inLiveboardPhase ? (
          // Liveboard-fase: viser resultattavler for poll/spørsmål på aktiv slide.
          <div className={cn(styles.liveboardViewport, slideShadowClass)}>
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
          // Fabric-slide: rendres via canvas + overlay for embeds.
          <div className={styles.fabricSlideWrap}>
            <LivePresentationCanvas
              slideData={currentSlideData}
              embedLive={embedLive}
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
          // Tekstslide: enkel fallback for slides uten Fabric-data.
          <div className={styles.textSlideStage}>
            <div className={cn(styles.textSlideCard, slideShadowClass)}>
              {currentSlideData.title && (
                <h2 className={styles.textSlideTitle}>{currentSlideData.title}</h2>
              )}
              {currentSlideData.content && (
                <div className={styles.textSlideContent}>{currentSlideData.content}</div>
              )}
              {!currentSlideData.title && !currentSlideData.content && (
                <p className={styles.emptySlideText}>Dette lysbildet er tomt.</p>
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
        // Defensive fallback hvis slide mangler data helt.
        <div className={styles.emptyDataWrap}>
          <p className={styles.emptySlideText}>Ingen data for dette lysbildet.</p>
        </div>
      )}
    </>
  )

  return (
    <div className={cn(styles.root, className)}>
      {inner}
    </div>
  )
}
