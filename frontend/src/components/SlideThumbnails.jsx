import React from 'react'
import '../CSScomponents/SlideThumbnails.css'

const getSlidePreviewContent = (slide) => {
  if (!slide) return 'No content yet'

  if (slide.content && slide.content.trim()) {
    return slide.content
  }

  const objects = slide.fabricData?.objects
  if (!Array.isArray(objects) || objects.length === 0) {
    return 'No content yet'
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

  return `${objects.length} object${objects.length > 1 ? 's' : ''}`
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
      {slides.map((slide, index) => (
        <div
          key={slide.id}
          className={`thumbnail ${index === currentSlideIndex ? 'active' : ''}`}
          onClick={() => onSlideSelect(index)}
        >
          <div 
            className="thumbnail-preview"
            style={{ backgroundColor: slide.backgroundColor }}
          >
            {slidePreviewImages[slide.id] ? (
              <img
                src={slidePreviewImages[slide.id]}
                alt={`${slide.title} preview`}
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
              <button
                className="thumbnail-btn duplicate-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  onSlideDuplicate(index)
                }}
                title="Dupliser slide"
              >
                📋
              </button>
              <button
                className="thumbnail-btn delete-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  onSlideDelete(index)
                }}
                title="Slett slide"
              >
                🗑️
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export default SlideThumbnails