import React, { useState, useEffect, useRef } from 'react';
import { Canvas, IText, FabricImage, Rect, Circle } from 'fabric';
import SlideThumbnails from './SlideThumbnails';
import '../CSScomponents/PresentationEditor.css';

const defaultSlide = () => ({
    id: `local-${Date.now()}`,
    title: 'Slide 1',
    content: '',
    backgroundColor: '#ffffff',
    fabricData: null,
});

function PresentationEditor({ presentation, onSavePresentation, isSaving = false }) {
    const canvasRef = useRef(null);
    const fabricCanvasRef = useRef(null);
    const [slides, setSlides] = useState([defaultSlide()]);
    const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
    const [presentationTitle, setPresentationTitle] = useState('Untitled Presentation');
    const [saveError, setSaveError] = useState(null);
    const [lastSavedAt, setLastSavedAt] = useState(null);

    useEffect(() => {
        if (!presentation) {
            setPresentationTitle('Untitled Presentation');
            setSlides([defaultSlide()]);
            setCurrentSlideIndex(0);
            return;
        }

        const normalizedSlides = (presentation.slides || []).map((slide, index) => ({
            id: slide.id || `local-${Date.now()}-${index}`,
            title: slide.title || `Slide ${index + 1}`,
            content: slide.content || '',
            backgroundColor: slide.backgroundColor || '#ffffff',
            fabricData: slide.fabricData || null,
        }));

        setPresentationTitle(presentation.title || 'Untitled Presentation');
        setSlides(normalizedSlides.length ? normalizedSlides : [defaultSlide()]);
        setCurrentSlideIndex(0);
        setSaveError(null);
    }, [presentation]);

    // Initialize Fabric Canvas
    useEffect(() => {
        if (canvasRef.current && !fabricCanvasRef.current) {
            fabricCanvasRef.current = new Canvas(canvasRef.current, {
                width: 960,
                height: 540,
                backgroundColor: '#ffffff',
            });
            
            fabricCanvasRef.current.set({ backgroundColor: '#ffffff' });
            fabricCanvasRef.current.renderAll();

        }

        return () => {
            if (fabricCanvasRef.current) {
                fabricCanvasRef.current.dispose();
                fabricCanvasRef.current = null;
            }
        };
    }, []);

    // Load slide when switching
    useEffect(() => {
        if (fabricCanvasRef.current && slides[currentSlideIndex]) {
            const currentSlide = slides[currentSlideIndex];
            
            const backgroundColor = currentSlide.backgroundColor || '#ffffff';

            if (currentSlide.fabricData) {
            fabricCanvasRef.current.loadFromJSON(currentSlide.fabricData).then(() => {
                fabricCanvasRef.current.backgroundColor = backgroundColor;
                fabricCanvasRef.current.renderAll();
            });
            } else {
                fabricCanvasRef.current.clear();
                fabricCanvasRef.current.set({ backgroundColor });
                fabricCanvasRef.current.renderAll();
            }
        }
    }, [currentSlideIndex, slides]);

    const buildSlidesWithCurrentCanvasState = () => {
        if (!fabricCanvasRef.current || !slides[currentSlideIndex]) return slides;

        const currentSlide = slides[currentSlideIndex];
        const backgroundColor =
            fabricCanvasRef.current.backgroundColor || currentSlide.backgroundColor || '#ffffff';

        const newSlides = [...slides];
        newSlides[currentSlideIndex] = {
            ...currentSlide,
            backgroundColor,
            fabricData: fabricCanvasRef.current.toJSON(),
        };

        return newSlides;
    };

    // Save current slide data locally
    const saveCurrentSlide = () => {
        const newSlides = buildSlidesWithCurrentCanvasState();
        setSlides(newSlides);
        return newSlides;
    };

    const addSlide = () => {
        const currentSlides = saveCurrentSlide();
        const newSlide = {
            id: `local-${Date.now()}`,
            title: `Slide ${currentSlides.length + 1}`,
            content: '',
            backgroundColor: '#ffffff',
            fabricData: null
        };
        setSlides([...currentSlides, newSlide]);
        setCurrentSlideIndex(currentSlides.length);
    };

    const deleteSlide = (index) => {
        if (slides.length === 1) {
            alert('Du må ha minst èn slide');
            return;
        }
        const newSlides = slides.filter((_, i) => i !== index);
        setSlides(newSlides);
        if (currentSlideIndex >= newSlides.length) {
            setCurrentSlideIndex(newSlides.length - 1);
        }
    };

    const duplicateSlide = (index) => {
        const currentSlides = saveCurrentSlide();
        const slideToDuplicate = currentSlides[index];
        const newSlide = {
            ...slideToDuplicate,
            id: `local-${Date.now()}`,
            title: slideToDuplicate.title + ' (Kopi)',
        };
        const newSlides = [...currentSlides];
        newSlides.splice(index + 1, 0, newSlide);
        setSlides(newSlides);
        setCurrentSlideIndex(index + 1);
    };

    const handleSlideSelect = (index) => {
        saveCurrentSlide();
        setCurrentSlideIndex(index);
    };

    // Fabric.js Tools
    const addText = () => {
        if (!fabricCanvasRef.current) return;
        
        const text = new IText('Click to edit', {
            left: 100,
            top: 100,
            fontSize: 32,
            fill: '#000000',
            fontFamily: 'Arial',
        });
        
        fabricCanvasRef.current.add(text);
        fabricCanvasRef.current.setActiveObject(text);
        fabricCanvasRef.current.renderAll();
        text.enterEditing();
        text.selectAll();
    };

    const addTitle = () => {
        if (!fabricCanvasRef.current) return;
        
        const text = new IText('Slide Title', {
            left: 50,
            top: 50,
            fontSize: 48,
            fill: '#000000',
            fontFamily: 'Arial',
            fontWeight: 'bold',
        });
        
        fabricCanvasRef.current.add(text);
        fabricCanvasRef.current.setActiveObject(text);
        fabricCanvasRef.current.renderAll();
        text.enterEditing();
        text.selectAll();
    };

    const addImage = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    FabricImage.fromURL(event.target.result).then((img) => {
                        img.scaleToWidth(400);
                        img.set({ left: 50, top: 50 });
                        fabricCanvasRef.current.add(img);
                        fabricCanvasRef.current.renderAll();
                    });
                };
                reader.readAsDataURL(file);
            }
        };
        input.click();
    };

    const addShape = (shapeType) => {
        if (!fabricCanvasRef.current) return;
        
        let shape;
        switch (shapeType) {
            case 'rectangle':
                shape = new Rect({
                    left: 100,
                    top: 100,
                    width: 200,
                    height: 150,
                    fill: '#667eea',
                });
                break;
            case 'circle':
                shape = new Circle({
                    left: 100,
                    top: 100,
                    radius: 75,
                    fill: '#764ba2',
                });
                break;
        }
        
        if (shape) {
            fabricCanvasRef.current.add(shape);
            fabricCanvasRef.current.setActiveObject(shape);
            fabricCanvasRef.current.renderAll();
        }
    };

    const deleteSelected = () => {
        if (!fabricCanvasRef.current) return;
        const activeObjects = fabricCanvasRef.current.getActiveObjects();
        if (activeObjects.length) {
            fabricCanvasRef.current.remove(...activeObjects);
            fabricCanvasRef.current.discardActiveObject();
            fabricCanvasRef.current.renderAll();
        }
    };

    const changeBackgroundColor = (color) => {
        if (!fabricCanvasRef.current) return;
        fabricCanvasRef.current.backgroundColor = color;
        fabricCanvasRef.current.renderAll();

        setSlides((prevSlides) => {
            const newSlides = [...prevSlides];
            if (!newSlides[currentSlideIndex]) return prevSlides;

            newSlides[currentSlideIndex] = {
                ...newSlides[currentSlideIndex],
                backgroundColor: color,
            };
            return newSlides;
        });
    };

    const handleSavePresentation = async () => {
        if (!onSavePresentation) return;

        const slidesToSave = saveCurrentSlide();
        setSaveError(null);

        try {
            await onSavePresentation({
                id: presentation?.id,
                title: presentationTitle.trim() || 'Untitled Presentation',
                slides: slidesToSave,
            });

            setLastSavedAt(new Date());
        } catch (error) {
            setSaveError('Kunne ikke lagre presentasjonen. Prøv igjen.');
        }
    };

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
                    onSlideSelect={handleSlideSelect}
                    onSlideDelete={deleteSlide}
                    onSlideDuplicate={duplicateSlide}
                />
            </div>
            <div className="editor-main">
                <div className="editor-toolbar">
                    <div className="toolbar-left">
                        <input
                            type="text"
                            className="presentation-title-input"
                            value={presentationTitle}
                            onChange={(e) => setPresentationTitle(e.target.value)}
                            placeholder="Presentation title"
                        />
                        <span className="slide-counter">
                            Slide {currentSlideIndex + 1} of {slides.length}
                        </span>
                    </div>
                    <div className="toolbar-actions">
                        <button
                            onClick={handleSavePresentation}
                            className="toolbar-btn save-btn"
                            disabled={isSaving}
                        >
                            {isSaving ? 'Saving...' : '💾 Save'}
                        </button>
                        <button onClick={addTitle} className="toolbar-btn">📝 Title</button>
                        <button onClick={addText} className="toolbar-btn">Aa Text</button>
                        <button onClick={addImage} className="toolbar-btn">🖼️ Image</button>
                        <button onClick={() => addShape('rectangle')} className="toolbar-btn">▭ Rectangle</button>
                        <button onClick={() => addShape('circle')} className="toolbar-btn">● Circle</button>
                        <button onClick={deleteSelected} className="toolbar-btn delete-btn">🗑️ Delete</button>
                        <label className="toolbar-btn color-label">
                            🎨 Background
                            <input
                                type="color"
                                value={slides[currentSlideIndex]?.backgroundColor || '#ffffff'}
                                onChange={(e) => changeBackgroundColor(e.target.value)}
                                style={{ marginLeft: '8px' }}
                            />
                        </label>
                    </div>
                </div>
                {saveError && <div className="save-status error">{saveError}</div>}
                {lastSavedAt && !saveError && (
                    <div className="save-status success">
                        Last saved {lastSavedAt.toLocaleTimeString()}
                    </div>
                )}
                <div className="canvas-container">
                    <div className="slide-boundary">
                        <canvas ref={canvasRef} />
                    </div>
                </div>
            </div>
        </div>
    );
}

export default PresentationEditor;