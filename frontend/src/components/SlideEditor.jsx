import React, { useState } from 'react'
import SlideCanvas from './SlideCanvas'
import SlideThumbnails from './SlideThumbnails'
import '../CSScomponents/SlideEditor.css'

function SlideEditor() {
    const [slides, setSlides] = useState([
        {
            id: 1,
            title: 'Slide 1',
            content: 'Dette er den første slide.',
            backgroundColor: '#ffffff',
        }
    ])
    const [currentSlideIndex, setCurrentSlideIndex] = useState(0)

    const addSlide = () => {
        const newSlide = { 
            id: Date.now(),
            title: 'Ny Slide',
            content: 'Klikk for å redigere innhold.',
            backgroundColor: '#ffffff',
        }
        setSlides([...slides, newSlide])
        setCurrentSlideIndex(slides.length)
    }

    const deleteSlide = (index) => {
        if (slides.length === 1) {
            alert('Du må ha minst èn slide')
            return
        }
        const newSlides = slides.filter((_, i) => i !== index)
        setSlides(newSlides)
        if (currentSlideIndex >= newSlides.length) {
            setCurrentSlideIndex(newSlides.length - 1)
        }
    }

    const updateSlide = (index, updatedSlide) => {
        const newSlides = [...slides]
        newSlides[index] = updatedSlide
        setSlides(newSlides)
    }

    const duplicateSlide = (index) => {
        const slideToDuplicate = slides[index]
        const newSlide = {
            ...slideToDuplicate,
            id: Date.now(),
            title: slideToDuplicate.title + ' (Kopi)',
        }
        const newSlides = [...slides]
        newSlides.splice(index + 1, 0, newSlide)
        setSlides(newSlides)
        setCurrentSlideIndex(index + 1)
    }

    return (
        <div className="slide-editor">
            <div className="editor-sidebar">
                <div className="sidebar-header">
                    <h3>Slides</h3>
                    <button onClick={addSlide} className="add-slide-btn">+ Add Slide</button>
                </div>
                <SlideThumbnails
                    slides={slides}
                    currentSlideIndex={currentSlideIndex}
                    onSlideSelect={setCurrentSlideIndex}
                    onSlideDelete={deleteSlide}
                    onSlideDuplicate={duplicateSlide}
                />
            </div>
            <div className="editor-main">
                <div className="editor-toolbar">
                    <span className="slide-counter">
                        Slide {currentSlideIndex + 1} of {slides.length}
                    </span>
                </div>
                <SlideCanvas
                    slide={slides[currentSlideIndex]}
                    onUpdate={(updatedSlide) => updateSlide(currentSlideIndex, updatedSlide)}
                />
            </div>
        </div>
    )
}

export default SlideEditor