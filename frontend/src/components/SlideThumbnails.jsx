import React from 'react'
import '../CSScomponents/SlideThumbnails.css'

function SlideThumbnails({ 
  slides, 
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
            <div className="thumbnail-title">{slide.title}</div>
            <div className="thumbnail-content">{slide.content}</div>
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