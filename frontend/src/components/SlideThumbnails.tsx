import { cn, resolveTextWithVariables, type PresentationVariable } from '../lib/utils'
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

//Rendrer en liste med thumbnails for presentationediotor
//Støtter slide interaksjoner som sletting, duplisering og reordering ved drag and drop 
//Show slide preview, tittel og thumbnail bilde av ikoner for spørsmål, avstemning og polls

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

function thumbnailRootClass(isActive: boolean) {
  return cn(
    'shrink-0 rounded-lg overflow-hidden cursor-pointer transition-[border-color,box-shadow] duration-200',
    isActive
      ? 'border border-solid border-[#667eea] shadow-[0_0_0_1px_rgba(102,126,234,0.35),0_1px_4px_rgba(0,0,0,0.07),0_2px_16px_rgba(102,126,234,0.2)] dark:shadow-[0_0_0_1px_rgba(129,140,248,0.45),0_2px_10px_rgba(0,0,0,0.45),0_4px_18px_rgba(102,126,234,0.22)]'
      : 'border border-solid border-black/10 shadow-[0_0_0_1px_rgba(0,0,0,0.04),0_1px_4px_rgba(0,0,0,0.06),0_4px_12px_rgba(0,0,0,0.04)] dark:border-white/[0.14] dark:shadow-[0_0_0_1px_rgba(0,0,0,0.25),0_2px_8px_rgba(0,0,0,0.35)] hover:border-[rgba(102,126,234,0.45)] hover:shadow-[0_0_0_1px_rgba(102,126,234,0.2),0_1px_4px_rgba(0,0,0,0.07),0_4px_14px_rgba(102,126,234,0.1)] dark:hover:border-[rgba(102,126,234,0.55)] dark:hover:shadow-[0_0_0_1px_rgba(102,126,234,0.25),0_2px_10px_rgba(0,0,0,0.45),0_4px_16px_rgba(102,126,234,0.12)]',
  )
}

function interactionBadgeClass(isActive: boolean) {
  return cn(
    'inline-flex items-center justify-center h-[22px] w-[22px] rounded-md text-white bg-slate-900/[0.82] shadow-[0_1px_3px_rgba(0,0,0,0.35)] border border-solid border-white/12',
    'dark:bg-slate-800/[0.92] dark:border-[rgba(129,140,248,0.35)] dark:text-slate-200',
    isActive && 'border-[rgba(129,140,248,0.55)] dark:border-[rgba(129,140,248,0.55)]',
  )
}

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
  const isActive = index === currentSlideIndex

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={thumbnailRootClass(isActive)}
      onClick={() => onSlideSelect(index)}
    >
      <div
        className="flex touch-none cursor-grab items-center justify-center px-1 py-0.5 active:cursor-grabbing"
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        title="Dra for å flytte"
      >
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
      </div>

      <div
        className="relative box-border aspect-video w-full overflow-hidden bg-white p-2 text-[0.7rem]"
        style={{ backgroundColor: slide.backgroundColor }}
      >
        {(showQuestionBadge || showPollBadge) && (
          <div className="absolute right-1.5 top-1.5 z-[2] flex max-w-[calc(100%-12px)] flex-row flex-wrap justify-end gap-1">
            {showQuestionBadge && (
              <span
                className={interactionBadgeClass(isActive)}
                title="Har spørsmål"
                role="img"
                aria-label="Har spørsmål"
              >
                <MessageSquare
                  className="h-3 w-3"
                  strokeWidth={2}
                  aria-hidden
                />
              </span>
            )}
            {showPollBadge && (
              <span
                className={interactionBadgeClass(isActive)}
                title="Har avstemning"
                role="img"
                aria-label="Har avstemning"
              >
                <BarChart2
                  className="h-3 w-3"
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
            className="block h-full w-full rounded-md object-cover"
          />
        ) : (
          <>
            <div className="mb-1 truncate font-bold text-[#1a1a1a]">{slide.title}</div>
            <div className="line-clamp-2 overflow-hidden text-ellipsis text-[#666]">
              {getSlidePreviewContent(slide)}
            </div>
          </>
        )}
      </div>

      <div className="flex items-center justify-between bg-white/[0.05] p-2">
        <span className="text-sm font-semibold text-white/70">{index + 1}</span>
        <div className="flex items-center gap-1">
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
        <div className="flex flex-col gap-4">
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