import React from 'react'
import '../CSScomponents/SlideThumbnails.css'
import { Button } from './ui/button'
import { BarChart2, Copy, MessageSquare, Trash2 } from 'lucide-react'

const slideHasQuestions = (slide) =>
  Array.isArray(slide?.questions) && slide.questions.length > 0

const slideHasPolls = (slide) =>
  Array.isArray(slide?.polls) && slide.polls.length > 0

const getSlidePreviewContent = (slide) => {
  if (!slide) return 'Inget innhold ennå' // No content yet

  if (slide.content && slide.content.trim()) {
    return slide.content
  }

  const objects = slide.fabricData?.objects
  if (!Array.isArray(objects) || objects.length === 0) {
    return 'Inget innhold ennå' // No content yet
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

function SlideThumbnails({ 
  slides, 
  slidePreviewImages = {},
  currentSlideIndex, 
  onSlideSelect, 
  onSlideDelete,
  onSlideDuplicate 
}) {
  return (
    <div className="slide-thumbnails">
      {slides.map((slide, index) => {
        const showQuestionBadge = slideHasQuestions(slide)
        const showPollBadge = slideHasPolls(slide)
        return (
          <div
            key={slide.id}
            className={`thumbnail ${index === currentSlideIndex ? 'active' : ''}`}
            onClick={() => onSlideSelect(index)}
          >
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
                      <MessageSquare className="thumbnail-interaction-badge-icon" strokeWidth={2} aria-hidden />
                    </span>
                  )}
                  {showPollBadge && (
                    <span
                      className="thumbnail-interaction-badge"
                      title="Har avstemning"
                      role="img"
                      aria-label="Har avstemning"
                    >
                      <BarChart2 className="thumbnail-interaction-badge-icon" strokeWidth={2} aria-hidden />
                    </span>
                  )}
                </div>
              )}
              {slidePreviewImages[slide.id] ? (
                <img
                  src={slidePreviewImages[slide.id]}
                  alt={`${slide.title} forhåndsvisning`} // preview
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
      })}
    </div>
  )
}

export default SlideThumbnails