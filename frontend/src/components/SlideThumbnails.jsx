import '../CSScomponents/SlideThumbnails.css'
import { Button } from './ui/button'
import { BarChart2, Copy, GripVertical, MessageSquare, Trash2 } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

const slideHasQuestions = (slide) =>
  Array.isArray(slide?.questions) && slide.questions.length > 0

const slideHasPolls = (slide) =>
  Array.isArray(slide?.polls) && slide.polls.length > 0

const getSlidePreviewContent = (slide) => {
  if (!slide) return 'Ingen innhold enda'

  if (slide.content && slide.content.trim()) {
    return slide.content
  }

  const objects = slide.fabricData?.objects
  if (!Array.isArray(objects) || objects.length === 0) {
    return 'Ingen innhold enda'
  }

  const textValues = objects
    .map((objectItem) => {
      const text = objectItem?.text
      return typeof text === 'string' ? text.trim() : ''
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
}) {
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
            src={slidePreviewImages[slide.id]}
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
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  )

  const handleDragEnd = ({ active, over }) => {
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