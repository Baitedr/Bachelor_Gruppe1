import React, { useState } from 'react'
import '../CSScomponents/SlideCanvas.css'

function SlideCanvas({ slide, onUpdate }) {
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [isEditingContent, setIsEditingContent] = useState(false)

  const handleTitleChange = (e) => {
    onUpdate({ ...slide, title: e.target.value })
  }

  const handleContentChange = (e) => {
    onUpdate({ ...slide, content: e.target.value })
  }

  const handleBackgroundColorChange = (e) => {
    onUpdate({ ...slide, backgroundColor: e.target.value })
  }

  return (
    <div className="slide-canvas-container">
      <div 
        className="slide-canvas" 
        style={{ backgroundColor: slide.backgroundColor }}
      >
        {isEditingTitle ? (
          <input
            type="text"
            className="slide-title-input"
            value={slide.title}
            onChange={handleTitleChange}
            onBlur={() => setIsEditingTitle(false)}
            autoFocus
          />
        ) : (
          <h1 
            className="slide-title"
            onClick={() => setIsEditingTitle(true)}
          >
            {slide.title}
          </h1>
        )}

        {isEditingContent ? (
          <textarea
            className="slide-content-input"
            value={slide.content}
            onChange={handleContentChange}
            onBlur={() => setIsEditingContent(false)}
            autoFocus
          />
        ) : (
          <div 
            className="slide-content"
            onClick={() => setIsEditingContent(true)}
          >
            {slide.content}
          </div>
        )}
      </div>

      <div className="slide-properties">
        <label>
          Background Color:
          <input
            type="color"
            value={slide.backgroundColor}
            onChange={handleBackgroundColorChange}
          />
        </label>
      </div>
    </div>
  )
}

export default SlideCanvas