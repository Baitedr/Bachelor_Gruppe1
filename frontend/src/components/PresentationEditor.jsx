import React, { useState, useEffect, useRef } from 'react';
import { Canvas, IText, FabricImage, Rect, Circle } from 'fabric';
import SlideThumbnails from './SlideThumbnails';
import '../CSScomponents/PresentationEditor.css';

function PresentationEditor() {
    const canvasRef = useRef(null);
    const fabricCanvasRef = useRef(null);
    const [slides, setSlides] = useState([
        {
            id: 1,
            title: 'Slide 1',
            content: '',
            backgroundColor: '#ffffff',
            fabricData: null
        }
    ]);
    const [currentSlideIndex, setCurrentSlideIndex] = useState(0);

    // Initialize Fabric Canvas
    useEffect(() => {
        if (canvasRef.current && !fabricCanvasRef.current) {
            fabricCanvasRef.current = new Canvas(canvasRef.current, {
                width: 960,
                height: 540,
                backgroundColor: '#ffffff',
            });
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
        if (fabricCanvasRef.current) {
            const currentSlide = slides[currentSlideIndex];
            
            if (currentSlide.fabricData) {
                fabricCanvasRef.current.loadFromJSON(currentSlide.fabricData, () => {
                    fabricCanvasRef.current.renderAll();
                });
            } else {
                fabricCanvasRef.current.clear();
                fabricCanvasRef.current.backgroundColor = currentSlide.backgroundColor;
                fabricCanvasRef.current.renderAll();
            }
        }
    }, [currentSlideIndex, slides]);

    // Save current slide data
    const saveCurrentSlide = () => {
        if (!fabricCanvasRef.current) return;
        
        const fabricData = fabricCanvasRef.current.toJSON();
        const newSlides = [...slides];
        newSlides[currentSlideIndex] = {
            ...newSlides[currentSlideIndex],
            fabricData: fabricData,
            backgroundColor: fabricCanvasRef.current.backgroundColor
        };
        setSlides(newSlides);
    };

    const addSlide = () => {
        saveCurrentSlide();
        const newSlide = {
            id: Date.now(),
            title: `Slide ${slides.length + 1}`,
            content: '',
            backgroundColor: '#ffffff',
            fabricData: null
        };
        setSlides([...slides, newSlide]);
        setCurrentSlideIndex(slides.length);
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
        saveCurrentSlide();
        const slideToDuplicate = slides[index];
        const newSlide = {
            ...slideToDuplicate,
            id: Date.now(),
            title: slideToDuplicate.title + ' (Kopi)',
        };
        const newSlides = [...slides];
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
                    <span className="slide-counter">
                        Slide {currentSlideIndex + 1} of {slides.length}
                    </span>
                    <div className="toolbar-actions">
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
                                defaultValue="#ffffff"
                                onChange={(e) => changeBackgroundColor(e.target.value)}
                                style={{ marginLeft: '8px' }}
                            />
                        </label>
                    </div>
                </div>
                <div className="canvas-container">
                    <canvas ref={canvasRef} />
                </div>
            </div>
        </div>
    );
}

export default PresentationEditor;