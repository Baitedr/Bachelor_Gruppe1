import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { Canvas, IText, FabricImage, Rect, Circle } from 'fabric';
import SlideThumbnails from './SlideThumbnails';
import '../CSScomponents/PresentationEditor.css';

const defaultSlide = () => ({
    id: `local-${Date.now()}`,
    title: 'Lysbilde 1', // Slide 1
    content: '',
    backgroundColor: '#ffffff',
    fabricData: null,
});

const PresentationEditor = forwardRef(function PresentationEditor({ presentation, onSavePresentation, isSaving = false }, ref) {
    const canvasRef = useRef(null);
    const fabricCanvasRef = useRef(null);
    const isApplyingCanvasStateRef = useRef(false);
    const [slides, setSlides] = useState([defaultSlide()]);
    const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
    const [presentationId, setPresentationId] = useState(null);
    const [presentationTitle, setPresentationTitle] = useState('Uten navn'); // Untitled Presentation
    const [saveError, setSaveError] = useState(null);
    const [lastSavedAt, setLastSavedAt] = useState(null);
    const [undoStack, setUndoStack] = useState([]);
    const [redoStack, setRedoStack] = useState([]);
    const [slidePreviewImages, setSlidePreviewImages] = useState({});

    const createCanvasSnapshot = () => {
        if (!fabricCanvasRef.current) return null;

        return {
            backgroundColor: fabricCanvasRef.current.backgroundColor || '#ffffff',
            fabricData: fabricCanvasRef.current.toJSON(),
        };
    };

    const areSnapshotsEqual = (first, second) => {
        if (!first || !second) return false;
        return JSON.stringify(first) === JSON.stringify(second);
    };

    const pushHistorySnapshot = (snapshot) => {
        if (!snapshot) return;

        setUndoStack((previousStack) => {
            const lastSnapshot = previousStack[previousStack.length - 1];
            if (areSnapshotsEqual(lastSnapshot, snapshot)) {
                return previousStack;
            }
            return [...previousStack, snapshot];
        });
        setRedoStack([]);
    };

    const resetHistoryWithSnapshot = (snapshot) => {
        if (!snapshot) {
            setUndoStack([]);
            setRedoStack([]);
            return;
        }

        setUndoStack([snapshot]);
        setRedoStack([]);
    };

    const applyCanvasSnapshot = async (snapshot) => {
        if (!fabricCanvasRef.current || !snapshot) return;

        isApplyingCanvasStateRef.current = true;

        try {
            await fabricCanvasRef.current.loadFromJSON(snapshot.fabricData || null);
            fabricCanvasRef.current.backgroundColor = snapshot.backgroundColor || '#ffffff';
            fabricCanvasRef.current.renderAll();
        } finally {
            isApplyingCanvasStateRef.current = false;
        }
    };

    useEffect(() => {
        if (!presentation) {
            setPresentationId(null);
            setPresentationTitle('Uten navn');
            setSlides([defaultSlide()]);
            setCurrentSlideIndex(0);
            return;
        }

        const normalizedSlides = (presentation.slides || []).map((slide, index) => ({
            id: slide.id || `local-${Date.now()}-${index}`,
            title: slide.title || `Lysbilde ${index + 1}`,
            content: slide.content || '',
            backgroundColor: slide.backgroundColor || '#ffffff',
            fabricData: slide.fabricData || null,
        }));

        setPresentationId(presentation.id || null);
        setPresentationTitle(presentation.title || 'Uten navn');
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

            isApplyingCanvasStateRef.current = true;

            if (currentSlide.fabricData) {
                fabricCanvasRef.current.loadFromJSON(currentSlide.fabricData).then(() => {
                    fabricCanvasRef.current.backgroundColor = backgroundColor;
                    fabricCanvasRef.current.renderAll();
                    isApplyingCanvasStateRef.current = false;
                    resetHistoryWithSnapshot(createCanvasSnapshot());
                });
            } else {
                fabricCanvasRef.current.clear();
                fabricCanvasRef.current.set({ backgroundColor });
                fabricCanvasRef.current.renderAll();
                isApplyingCanvasStateRef.current = false;
                resetHistoryWithSnapshot(createCanvasSnapshot());
            }
        } else {
            setUndoStack([]);
            setRedoStack([]);
        }
    }, [currentSlideIndex, slides]);

    useEffect(() => {
        const canvas = fabricCanvasRef.current;
        if (!canvas) return;

        const handleCanvasChange = () => {
            if (isApplyingCanvasStateRef.current) return;
            pushHistorySnapshot(createCanvasSnapshot());
        };

        canvas.on('object:added', handleCanvasChange);
        canvas.on('object:modified', handleCanvasChange);
        canvas.on('object:removed', handleCanvasChange);

        return () => {
            canvas.off('object:added', handleCanvasChange);
            canvas.off('object:modified', handleCanvasChange);
            canvas.off('object:removed', handleCanvasChange);
        };
    }, []);

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

    const createSlideSnapshot = async (slide) => {
        const tempElement = document.createElement('canvas');
        tempElement.width = 960;
        tempElement.height = 540;

        const tempFabricCanvas = new Canvas(tempElement, {
            width: 960,
            height: 540,
            backgroundColor: slide?.backgroundColor || '#ffffff',
        });

        try {
            if (slide?.fabricData) {
                await tempFabricCanvas.loadFromJSON(slide.fabricData);
            }

            tempFabricCanvas.backgroundColor = slide?.backgroundColor || '#ffffff';
            tempFabricCanvas.renderAll();

            return tempFabricCanvas.toDataURL({
                format: 'png',
                quality: 0.8,
                multiplier: 0.2,
            });
        } finally {
            tempFabricCanvas.dispose();
        }
    };

    useEffect(() => {
        let isCancelled = false;

        const buildSlidePreviews = async () => {
            if (!slides.length) {
                setSlidePreviewImages({});
                return;
            }

            const previews = {};

            for (const slide of slides) {
                if (!slide?.id) continue;

                try {
                    previews[slide.id] = await createSlideSnapshot(slide);
                } catch {
                    previews[slide.id] = null;
                }
            }

            if (!isCancelled) {
                setSlidePreviewImages(previews);
            }
        };

        buildSlidePreviews();

        return () => {
            isCancelled = true;
        };
    }, [slides]);

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
            title: `Lysbilde ${currentSlides.length + 1}`,
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
        
        const text = new IText('Klikk for å redigere', { // Click to edit
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
        
        const text = new IText('Tittel', { // Slide Title
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

        pushHistorySnapshot(createCanvasSnapshot());
    };

    const handleUndo = async () => {
        if (undoStack.length <= 1) return;

        const currentSnapshot = undoStack[undoStack.length - 1];
        const previousSnapshot = undoStack[undoStack.length - 2];

        await applyCanvasSnapshot(previousSnapshot);
        setUndoStack((previousStack) => previousStack.slice(0, -1));
        setRedoStack((previousStack) => [currentSnapshot, ...previousStack]);
    };

    const handleRedo = async () => {
        if (!redoStack.length) return;

        const [nextSnapshot, ...remainingSnapshots] = redoStack;

        await applyCanvasSnapshot(nextSnapshot);
        setUndoStack((previousStack) => {
            const lastSnapshot = previousStack[previousStack.length - 1];
            if (areSnapshotsEqual(lastSnapshot, nextSnapshot)) {
                return previousStack;
            }

            return [...previousStack, nextSnapshot];
        });
        setRedoStack(remainingSnapshots);
    };

    const handleSavePresentation = async () => {
        if (!onSavePresentation || isSaving) return false;

        const slidesToSave = saveCurrentSlide();
        setSaveError(null);

        try {
            const firstSlideSnapshot = await createSlideSnapshot(slidesToSave[0]);
            const slidesWithPreview = slidesToSave.map((slide, index) => (
                index === 0
                    ? {
                        ...slide,
                        previewImage: firstSlideSnapshot,
                    }
                    : slide
            ));

            const savedPresentation = await onSavePresentation({
                id: presentationId,
                title: presentationTitle.trim() || 'Uten navn',
                slides: slidesWithPreview,
            });

            if (savedPresentation?.id) {
                setPresentationId(savedPresentation.id);
            }

            setLastSavedAt(new Date());
            return true;
        } catch (error) {
            setSaveError('Kunne ikke lagre presentasjonen. Prøv igjen.');
            return false;
        }
    };

    useImperativeHandle(ref, () => ({
        savePresentation: handleSavePresentation,
    }));

    return (
        <div className="slide-editor">
            <div className="editor-sidebar">
                <div className="sidebar-header">
                    <h3>Lysbilder</h3>
                    <button onClick={addSlide} className="add-slide-btn">+ Legg til lysbilde</button>
                </div>
                <SlideThumbnails
                    slides={slides}
                    slidePreviewImages={slidePreviewImages}
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
                            placeholder="Presentasjonstittel"
                        />
                        <span className="slide-counter">
                            Lysbilde {currentSlideIndex + 1} av {slides.length}
                        </span>
                    </div>
                    <div className="toolbar-actions">
                        <button
                            onClick={handleUndo}
                            className="toolbar-btn history-btn"
                            disabled={undoStack.length <= 1}
                        >
                            ↶ Angre
                        </button>
                        <button
                            onClick={handleRedo}
                            className="toolbar-btn history-btn"
                            disabled={!redoStack.length}
                        >
                            ↷ Gjør om
                        </button>
                        <button
                            onClick={handleSavePresentation}
                            className="toolbar-btn save-btn"
                            disabled={isSaving}
                        >
                            {isSaving ? 'Lagrer...' : '💾 Lagre'}
                        </button>
                        <button onClick={addTitle} className="toolbar-btn">📝 Tittel</button>
                        <button onClick={addText} className="toolbar-btn">Aa Tekst</button>
                        <button onClick={addImage} className="toolbar-btn">🖼️ Bilde</button>
                        <button onClick={() => addShape('rectangle')} className="toolbar-btn">▭ Rektangel</button>
                        <button onClick={() => addShape('circle')} className="toolbar-btn">● Sirkel</button>
                        <button onClick={deleteSelected} className="toolbar-btn delete-btn">🗑️ Slett</button>
                        <label className="toolbar-btn color-label">
                            🎨 Bakgrunn
                            <input
                                type="color"
                                value={slides[currentSlideIndex]?.backgroundColor || '#ffffff'}
                                onChange={(e) => changeBackgroundColor(e.target.value)}
                            />
                        </label>
                    </div>
                </div>
                {saveError && <div className="save-status error">{saveError}</div>}
                {lastSavedAt && !saveError && (
                    <div className="save-status success">
                        Sist lagret {lastSavedAt.toLocaleTimeString()}
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
});

export default PresentationEditor;