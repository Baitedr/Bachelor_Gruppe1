import '../CSScomponents/SlideThumbnails.css'
import { resolveTextWithVariables, type PresentationVariable } from '../lib/utils'
import { Button } from './ui/button'
import { BarChart2, Copy, GripVertical, MessageSquare, Trash2 } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

type SlideObject = {
  templateText?: string
  text?: string
}

type SlideData = {
  id: string
  title: string
  content?: string
  backgroundColor?: string
  variables?: PresentationVariable[]
  questions?: unknown[]
  polls?: unknown[]
  fabricData?: {
    objects?: SlideObject[]
  } | null
}

type SlidePreviewMap = Record<string, string | null | undefined>

type SortableSlideThumbnailProps = {
  slide: SlideData
  index: number
  currentSlideIndex: number
  onSlideSelect: (index: number) => void
  onSlideDelete: (index: number) => void
  onSlideDuplicate: (index: number) => void
  slidePreviewImages: SlidePreviewMap
}

type SlideThumbnailsProps = {
  slides: SlideData[]
  slidePreviewImages?: SlidePreviewMap
  currentSlideIndex: number
  onSlideSelect: (index: number) => void
  onSlideDelete: (index: number) => void
  onSlideDuplicate: (index: number) => void
  onSlideReorder?: (fromIndex: number, toIndex: number) => void
}

const slideHasQuestions = (slide: SlideData) =>
  Array.isArray(slide?.questions) && slide.questions.length > 0

const slideHasPolls = (slide: SlideData) =>
  Array.isArray(slide?.polls) && slide.polls.length > 0

const getSlidePreviewContent = (slide: SlideData | null | undefined) => {
  if (!slide) return 'Ingen innhold enda'

  if (slide.content && slide.content.trim()) {
    return resolveTextWithVariables(slide.content, slide.variables || [])
  }

  const objects = slide.fabricData?.objects
  if (!Array.isArray(objects) || objects.length === 0) {
    return 'Ingen innhold enda'
  }

  // Henter ut tekst fra alle objekter, erstatter variabler, og viser en kort forhåndsvisning.
  const textValues = objects
    .map((objectItem) => {
      const text = objectItem?.templateText || objectItem?.text
      return typeof text === 'string'
        ? resolveTextWithVariables(text, slide.variables || []).trim()
        : ''
    })
    .filter(Boolean)

  if (textValues.length > 0) {
    return textValues.join(' · ')
  }

  return `${objects.length} objekt${objects.length > 1 ? 'er' : ''}`
}

function SortableSlideThumbnail({
  slide,
  index,
  currentSlideIndex,
  onSlideSelect,
  onSlideDelete,
  onSlideDuplicate,
  slidePreviewImages,
}: SortableSlideThumbnailProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: slide.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const showQuestionBadge = slideHasQuestions(slide)
  const showPollBadge = slideHasPolls(slide)

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`thumbnail ${index === currentSlideIndex ? 'active' : ''}`}
      onClick={() => onSlideSelect(index)}
    >
      <div
        className="thumbnail-drag-handle"
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        title="Dra for å flytte"
      >
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
      </div>

      <div
        className="thumbnail-preview"
        style={{ backgroundColor: slide.backgroundColor }}
      >
        {(showQuestionBadge || showPollBadge) && (
          <div className="thumbnail-interaction-badges">
            {showQuestionBadge && (
              <span
                className="thumbnail-interaction-badge"
                title="Har spørsmål"
                role="img"
                aria-label="Har spørsmål"
              >
                <MessageSquare
                  className="thumbnail-interaction-badge-icon"
                  strokeWidth={2}
                  aria-hidden
                />
              </span>
            )}
            {showPollBadge && (
              <span
                className="thumbnail-interaction-badge"
                title="Har avstemning"
                role="img"
                aria-label="Har avstemning"
              >
                <BarChart2
                  className="thumbnail-interaction-badge-icon"
                  strokeWidth={2}
                  aria-hidden
                />
              </span>
            )}
          </div>
        )}

        {slidePreviewImages[slide.id] ? (
          <img
            src={slidePreviewImages[slide.id] || undefined}
            alt={`${slide.title} forhåndsvisning`}
            className="thumbnail-preview-image"
          />
        ) : (
          <>
            <div className="thumbnail-title">{slide.title}</div>
            <div className="thumbnail-content">{getSlidePreviewContent(slide)}</div>
          </>
        )}
      </div>

      <div className="thumbnail-footer">
        <span className="thumbnail-number">{index + 1}</span>
        <div className="thumbnail-actions">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-accent/50 p-0 mr-1 flex items-center justify-center transition-colors"
            onClick={(e) => {
              e.stopPropagation()
              onSlideDuplicate(index)
            }}
            title="Dupliser slide"
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 text-destructive bg-destructive/10 hover:text-foreground hover:bg-accent/50 p-0 flex items-center justify-center transition-colors"
            onClick={(e) => {
              e.stopPropagation()
              onSlideDelete(index)
            }}
            title="Slett slide"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  )
}

function SlideThumbnails({
  slides,
  slidePreviewImages = {},
  currentSlideIndex,
  onSlideSelect,
  onSlideDelete,
  onSlideDuplicate,
  onSlideReorder,
}: SlideThumbnailsProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  )

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const fromIndex = slides.findIndex((s) => s.id === active.id)
    const toIndex = slides.findIndex((s) => s.id === over.id)
    if (fromIndex !== -1 && toIndex !== -1 && typeof onSlideReorder === 'function') {
      onSlideReorder(fromIndex, toIndex)
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={slides.map((slide) => slide.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="slide-thumbnails">
          {slides.map((slide, index) => (
            <SortableSlideThumbnail
              key={slide.id}
              slide={slide}
              index={index}
              currentSlideIndex={currentSlideIndex}
              onSlideSelect={onSlideSelect}
              onSlideDelete={onSlideDelete}
              onSlideDuplicate={onSlideDuplicate}
              slidePreviewImages={slidePreviewImages}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}

export default SlideThumbnails