import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { Canvas, IText, FabricImage, Rect, Circle } from 'fabric';
import SlideThumbnails from './SlideThumbnails';
import '../CSScomponents/PresentationEditor.css';
import PollCreator from './PollComponents/PollCreator';

const defaultSlide = () => ({
    id: `local-${Date.now()}`,
    title: 'Slide 1',
    content: '',
    backgroundColor: '#ffffff',
    fabricData: null,
    polls: [],
});

const PresentationEditor = forwardRef(function PresentationEditor({ presentation, onSavePresentation, isSaving = false }, ref) {
    const canvasRef = useRef(null);
    const fabricCanvasRef = useRef(null);
    const isApplyingCanvasStateRef = useRef(false);
    const [slides, setSlides] = useState([defaultSlide()]);
    const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
    const [presentationId, setPresentationId] = useState(null);
    const [presentationTitle, setPresentationTitle] = useState('Untitled Presentation');
    const [saveError, setSaveError] = useState(null);
    const [lastSavedAt, setLastSavedAt] = useState(null);
    const [undoStack, setUndoStack] = useState([]);
    const [redoStack, setRedoStack] = useState([]);
    const [slidePreviewImages, setSlidePreviewImages] = useState({});
    const [isPollCreatorOpen, setIsPollCreatorOpen] = useState(false);
    const [editingPollIndex, setEditingPollIndex] = useState(null);

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
            polls: Array.isArray(slide.polls)
                ? slide.polls.map((poll, pollIndex) => normalizePoll(poll, pollIndex))
                : [],
        }));

        setPresentationId(presentation.id || null);
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
            title: `Slide ${currentSlides.length + 1}`,
            content: '',
            backgroundColor: '#ffffff',
            fabricData: null,
            polls: [],
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
            polls: (slideToDuplicate.polls || []).map((poll, pollIndex) => ({
                ...poll,
                id: `local-poll-${Date.now()}-${pollIndex}`,
                options: (poll.options || []).map((option, optionIndex) => ({
                    ...option,
                    id: `local-option-${Date.now()}-${pollIndex}-${optionIndex}`,
                })),
            })),
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
                title: presentationTitle.trim() || 'Untitled Presentation',
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

    const updateCurrentSlidePolls = (updater) => {
        setSlides((previousSlides) => {
            const nextSlides = [...previousSlides];
            const currentSlide = nextSlides[currentSlideIndex];

            if (!currentSlide) return previousSlides;

            const currentPolls = Array.isArray(currentSlide.polls) ? currentSlide.polls : [];
            const nextPolls = updater(currentPolls);

            nextSlides[currentSlideIndex] = {
                ...currentSlide,
                polls: nextPolls,
            };

            return nextSlides;
        });
    };

    const openCreatePoll = () => {
        setEditingPollIndex(null);
        setIsPollCreatorOpen(true);
    };

    const openEditPoll = (index) => {
        setEditingPollIndex(index);
        setIsPollCreatorOpen(true);
    };

    const closePollCreator = () => {
        setEditingPollIndex(null);
        setIsPollCreatorOpen(false);
    };

    const handleSavePoll = (pollData) => {
        const normalizedPoll = {
            id: pollData?.id || `local-poll-${Date.now()}`,
            question: pollData?.question || '',
            options: Array.isArray(pollData?.options)
                ? pollData.options.map((option, optionIndex) => ({
                    id: option?.id || `local-option-${Date.now()}-${optionIndex}`,
                    text: typeof option === 'string' ? option : (option?.text || ''),
                    votes: Number(option?.votes || 0),
                }))
                : [],
            latestSessionId: pollData?.latestSessionId || null,
            sessionHistory: Array.isArray(pollData?.sessionHistory) ? pollData.sessionHistory : [],
            createdAt: pollData?.createdAt || new Date().toISOString(),
        };

        updateCurrentSlidePolls((currentPolls) => {
            if (editingPollIndex === null) {
                return [...currentPolls, normalizedPoll];
            }

            return currentPolls.map((poll, index) => (
                index === editingPollIndex ? normalizedPoll : poll
            ));
        });

        closePollCreator();
    };

    const handleDeletePoll = (index) => {
        updateCurrentSlidePolls((currentPolls) => currentPolls.filter((_, pollIndex) => pollIndex !== index));
    };

    useImperativeHandle(ref, () => ({
        savePresentation: handleSavePresentation,
    }));

    return (
        <>
            <div className="slide-editor">
                <div className="editor-sidebar">
                    <div className="sidebar-header">
                        <h3>Slides</h3>
                        <button onClick={addSlide} className="add-slide-btn">+ Add Slide</button>
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
                                placeholder="Presentation title"
                            />
                            <span className="slide-counter">
                                Slide {currentSlideIndex + 1} of {slides.length}
                            </span>
                        </div>
                        <div className="toolbar-actions">
                            <button
                                onClick={handleUndo}
                                className="toolbar-btn history-btn"
                                disabled={undoStack.length <= 1}
                            >
                                ↶ Undo
                            </button>
                            <button
                                onClick={handleRedo}
                                className="toolbar-btn history-btn"
                                disabled={!redoStack.length}
                            >
                                ↷ Redo
                            </button>
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
                                />
                            </label>
                            <button onClick={openCreatePoll} className="toolbar-btn">Poll</button>
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
                <div className="slide-polls-panel">
                    <div className="slide-polls-header">
                        <div>
                            <h4>Slide Polls</h4>
                            <p>{(slides[currentSlideIndex]?.polls || []).length} poll(s) on this slide</p>
                        </div>
                        <button onClick={openCreatePoll} className="slide-polls-add-btn">
                            + Add Poll
                        </button>
                    </div>

                    {(slides[currentSlideIndex]?.polls || []).length === 0 ? (
                        <div className="slide-polls-empty-state">
                            <strong>No polls yet</strong>
                            <span>Add a poll to ask the audience a question during this slide.</span>
                        </div>
                    ) : (
                        <div className="slide-polls-list">
                            {(slides[currentSlideIndex]?.polls || []).map((poll, index) => {
                                const totalVotes = getPollTotalVotes(poll);

                                return (
                                    <div key={poll.id} className="slide-poll-item">
                                        <div className="slide-poll-copy">
                                            <div className="slide-poll-topline">
                                                <strong>{poll.question}</strong>
                                                <span className="slide-poll-total">{totalVotes} votes</span>
                                            </div>

                                            <div className="slide-poll-results">
                                                {(poll.options || []).map((option) => {
                                                    const percentage = getPollOptionPercentage(option.votes, totalVotes);

                                                    return (
                                                        <div key={option.id} className="slide-poll-result-row">
                                                            <div className="slide-poll-result-copy">
                                                                <span className="slide-poll-option-text">{option.text}</span>
                                                                <span className="slide-poll-option-stats">
                                                                    {option.votes || 0} ({percentage}%)
                                                                </span>
                                                            </div>
                                                            <div className="slide-poll-result-bar">
                                                                <div
                                                                    className="slide-poll-result-fill"
                                                                    style={{ width: `${percentage}%` }}
                                                                />
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>

                                            {getPollHistory(poll)}
                                        </div>

                                        <div className="slide-poll-actions">
                                            <button
                                                onClick={() => openEditPoll(index)}
                                                className="slide-poll-action-btn"
                                            >
                                                Edit
                                            </button>
                                            <button
                                                onClick={() => handleDeletePoll(index)}
                                                className="slide-poll-action-btn danger"
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {isPollCreatorOpen && (
                <div className="poll-modal-overlay">
                    <div className="poll-modal-card">
                        <PollCreator
                            initialData={
                                editingPollIndex !== null
                                    ? slides[currentSlideIndex]?.polls?.[editingPollIndex] || null
                                    : null
                            }
                            onSave={handleSavePoll}
                            onCancel={closePollCreator}
                        />
                    </div>
                </div>
            )}
        </>
    );
});

export default PresentationEditor;

const normalizePoll = (poll, pollIndex) => ({
    id: poll?.id || `local-poll-${Date.now()}-${pollIndex}`,
    question: poll?.question || '',
    options: Array.isArray(poll?.options)
        ? poll.options.map((option, optionIndex) => ({
            id: option?.id || `local-option-${Date.now()}-${pollIndex}-${optionIndex}`,
            text: typeof option === 'string' ? option : (option?.text || ''),
            votes: Number(option?.votes || 0),
        }))
        : [],
    latestSessionId: poll?.latestSessionId || null,
    sessionHistory: Array.isArray(poll?.sessionHistory) ? poll.sessionHistory : [],
    createdAt: poll?.createdAt || new Date().toISOString(),
});

const getPollTotalVotes = (poll) => {
    return (poll.options || []).reduce((sum, option) => sum + Number(option.votes || 0), 0);
};

const getPollOptionPercentage = (optionVotes, totalVotes) => {
    if (!totalVotes) return 0;
    return Math.round((Number(optionVotes || 0) / totalVotes) * 100);
};

const getPollHistory = (poll) => {
    return poll.sessionHistory?.length > 1 && (
        <details className="slide-poll-history">
            <summary>Previous Sessions</summary>
            <div className="slide-poll-history-list">
                {poll.sessionHistory.slice(1).map((session) => (
                    <div key={session.id} className="slide-poll-history-item">
                        <div className="slide-poll-history-title">
                            {new Date(session.startedAt).toLocaleString()} • {session.total} votes
                        </div>
                        <div className="slide-poll-history-results">
                            {session.options.map((option) => (
                                <div key={option.id} className="slide-poll-history-row">
                                    <span>{option.text}</span>
                                    <span>{option.votes}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </details>
    );
};