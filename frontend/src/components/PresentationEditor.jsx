import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { Canvas, IText, FabricImage, Rect, Circle } from 'fabric';
import SlideThumbnails from './SlideThumbnails';
import '../CSScomponents/PresentationEditor.css';
import PollCreator from './PollComponents/PollCreator';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Undo2, Redo2, Save, Type, Image as ImageIcon, Square, Circle as CircleIcon, Trash2, Plus, Type as TypeIcon, Palette, X } from 'lucide-react';
import { createDefaultSlideFabricData } from '../lib/fabricDefaults';

const defaultSlide = (index = 1) => ({
    id: `local-${Date.now()}`,
    title: `Lysbilde ${index}`, // Slide
    content: '',
    backgroundColor: '#ffffff',
    fabricData: createDefaultSlideFabricData(),
    polls: [],
});

const PresentationEditor = forwardRef(function PresentationEditor({ presentation, onSavePresentation, isSaving = false }, ref) {
    const canvasRef = useRef(null);
    const fabricCanvasRef = useRef(null);
    const imageUploadInputRef = useRef(null);
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
    const [isPollCreatorOpen, setIsPollCreatorOpen] = useState(false);
    const [editingPollIndex, setEditingPollIndex] = useState(null);
    const [pollToDeleteIndex, setPollToDeleteIndex] = useState(null);

    const hasUnsavedChangesRef = useRef(false);
    
    const markDirty = () => {
        hasUnsavedChangesRef.current = true;
    }

    const currentSlideIdRef = useRef(null);
    useEffect(() => {
        currentSlideIdRef.current = slides[currentSlideIndex]?.id || null;
    }, [slides, currentSlideIndex]);

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

    // Gjenoppretter et definert state (snapshot) tilbake til canvas-lerretet
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
            hasUnsavedChangesRef.current = false;
            return;
        }

        const normalizedSlides = (presentation.slides || []).map((slide, index) => ({
            id: slide.id || `local-${Date.now()}-${index}`,
            title: slide.title || `Lysbilde ${index + 1}`,
            content: slide.content || '',
            backgroundColor: slide.backgroundColor || '#ffffff',
            fabricData: slide.fabricData || null,
            polls: Array.isArray(slide.polls)
                ? slide.polls.map((poll, pollIndex) => normalizePoll(poll, pollIndex))
                : [],
        }));

        setPresentationId(presentation.id || null);
        setPresentationTitle(presentation.title || 'Uten navn');
        setSlides(normalizedSlides.length ? normalizedSlides : [defaultSlide()]);
        setCurrentSlideIndex(0);
        setSaveError(null);
        hasUnsavedChangesRef.current = false;
    }, [presentation]);

    // Initialiserer selve Fabric.js lerretet når komponenten blir montert
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

    // Laster inn riktig lysbilde-data til lerretet hver gang man bytter lysbilde
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

    // Lyttere for endringer på lerretet (legge til, flytte eller fjerne objekter) for å bygge opp angre-historikken
    useEffect(() => {
        const canvas = fabricCanvasRef.current;
        if (!canvas) return;

        const handleCanvasChange = () => {
            if (isApplyingCanvasStateRef.current) return;
            pushHistorySnapshot(createCanvasSnapshot());
            markDirty();
        };

        const updatePreview = () => {
            if (isApplyingCanvasStateRef.current) return;
            
            const currentId = currentSlideIdRef.current;
            if (currentId && fabricCanvasRef.current) {
                const dataUrl = fabricCanvasRef.current.toDataURL({
                    format: 'png',
                    quality: 0.9,
                    multiplier: 0.8,
                });
                setSlidePreviewImages(prev => ({
                    ...prev,
                    [currentId]: dataUrl
                }));
            }
        };

        const handleCanvasChangeWithPreview = () => {
            handleCanvasChange();
            updatePreview();
        };

        canvas.on('object:added', handleCanvasChangeWithPreview);
        canvas.on('object:modified', handleCanvasChangeWithPreview);
        canvas.on('object:removed', handleCanvasChangeWithPreview);
        canvas.on('text:changed', updatePreview);

        return () => {
            canvas.off('object:added', handleCanvasChangeWithPreview);
            canvas.off('object:modified', handleCanvasChangeWithPreview);
            canvas.off('object:removed', handleCanvasChangeWithPreview);
            canvas.off('text:changed', updatePreview);
        };
    }, []);

    // Oppdaterer state-arrayen med oppdatert JSON-data fra lerretet (canvas) for gjeldende lysbilde
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

    // Lager et miniatyrbilde av lysbildet (snapshot) i bakgrunnen uten å påvirke hovedlerretet
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
                quality: 0.9,
                multiplier: 0.8,
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

    // Lagrer gjeldende lysbilde til lokal state før endringer eller oppdateringer
    const saveCurrentSlide = () => {
        const newSlides = buildSlidesWithCurrentCanvasState();
        setSlides(newSlides);
        return newSlides;
    };

    // Legger til et nytt, tomt lysbilde og setter fokus til det
    const addSlide = () => {
        const currentSlides = saveCurrentSlide();
        const newSlide = {
            id: `local-${Date.now()}`,
            title: `Lysbilde ${currentSlides.length + 1}`,
            content: '',
            backgroundColor: '#ffffff',
            fabricData: createDefaultSlideFabricData(),
            polls: [],
        };
        markDirty();
        setSlides([...currentSlides, newSlide]);
        setCurrentSlideIndex(currentSlides.length);
    };

    // Sletter et lysbilde (krever at det finnes minst ett igjen)
    const deleteSlide = (index) => {
        if (slides.length === 1) {
            alert('Du må ha minst èn slide');
            return;
        }
        markDirty();
        const newSlides = slides.filter((_, i) => i !== index);
        setSlides(newSlides);
        if (currentSlideIndex >= newSlides.length) {
            setCurrentSlideIndex(newSlides.length - 1);
        }
    };

    // Dupliserer et eksisterende lysbilde og plasserer den etter originalen
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
        markDirty();
        setSlides(newSlides);
        setCurrentSlideIndex(index + 1);
    };

    const handleSlideSelect = (index) => {
        saveCurrentSlide();
        setCurrentSlideIndex(index);
    };

    // Helper function to constrain position within canvas bounds
    const getSafePosition = (preferredLeft, preferredTop, elementWidth = 200, elementHeight = 150) => {
        const minPos = 30;
        const maxLeft = 960 - elementWidth - 30; // Account for typical element width safely
        const maxTop = 540 - elementHeight - 30;  // Account for typical element height safely
        
        return {
            left: Math.max(minPos, Math.min(preferredLeft, maxLeft)),
            top: Math.max(minPos, Math.min(preferredTop, maxTop)),
        };
    };

    // Fabric.js Tools
    const addText = () => {
        if (!fabricCanvasRef.current) return;
        
        const pos = getSafePosition(80, 150, 250, 40);
        const text = new IText('Klikk for å redigere', { // Click to edit
            left: pos.left,
            top: pos.top,
            fontSize: 28,
            fill: '#000000',
            fontFamily: 'Arial',
            lineHeight: 1.2,
        });
        
        fabricCanvasRef.current.add(text);
        fabricCanvasRef.current.setActiveObject(text);
        fabricCanvasRef.current.renderAll();
        text.enterEditing();
        text.selectAll();
    };

    const addTitle = () => {
        if (!fabricCanvasRef.current) return;
        
        const pos = getSafePosition(80, 60, 300, 60);
        const text = new IText('Tittel', { // Slide Title
            left: pos.left,
            top: pos.top,
            fontSize: 48,
            fill: '#000000',
            fontFamily: 'Arial',
            fontWeight: 'bold',
            lineHeight: 1.16,
        });
        
        fabricCanvasRef.current.add(text);
        fabricCanvasRef.current.setActiveObject(text);
        fabricCanvasRef.current.renderAll();
        text.enterEditing();
        text.selectAll();
    };

    const handleImageFileChange = (event) => {
        const file = event.target.files?.[0];
        if (!file || !fabricCanvasRef.current) return;

        const reader = new FileReader();
        reader.onload = (loadEvent) => {
            const imageSource = loadEvent.target?.result;
            if (!imageSource) return;

            FabricImage.fromURL(imageSource).then((img) => {
                img.scaleToWidth(400);
                const pos = getSafePosition(80, 150);
                img.set({ left: pos.left, top: pos.top });
                fabricCanvasRef.current.add(img);
                fabricCanvasRef.current.renderAll();
            });
        };

        reader.readAsDataURL(file);
        event.target.value = '';
    };

    const addImage = () => {
        imageUploadInputRef.current?.click();
    };

    const addShape = (shapeType) => {
        if (!fabricCanvasRef.current) return;
        
        const pos = getSafePosition(100, 150);
        let shape;
        switch (shapeType) {
            case 'rectangle':
                shape = new Rect({
                    left: pos.left,
                    top: pos.top,
                    width: 200,
                    height: 150,
                    fill: '#667eea',
                });
                break;
            case 'circle':
                shape = new Circle({
                    left: pos.left,
                    top: pos.top,
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
        markDirty();

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

        const currentId = currentSlideIdRef.current;
        if (currentId) {
            setSlidePreviewImages(prev => ({
                ...prev,
                [currentId]: fabricCanvasRef.current.toDataURL({
                    format: 'png',
                    quality: 0.9,
                    multiplier: 0.8,
                })
            }));
        }
    };

    const handleUndo = async () => {
        if (undoStack.length <= 1) return;

        const currentSnapshot = undoStack[undoStack.length - 1];
        const previousSnapshot = undoStack[undoStack.length - 2];

        await applyCanvasSnapshot(previousSnapshot);
        setUndoStack((previousStack) => previousStack.slice(0, -1));
        setRedoStack((previousStack) => [currentSnapshot, ...previousStack]);

        const currentId = currentSlideIdRef.current;
        if (currentId && fabricCanvasRef.current) {
            setSlidePreviewImages(prev => ({
                ...prev,
                [currentId]: fabricCanvasRef.current.toDataURL({
                    format: 'png',
                    quality: 0.9,
                    multiplier: 0.8,
                })
            }));
        }
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

        const currentId = currentSlideIdRef.current;
        if (currentId && fabricCanvasRef.current) {
            setSlidePreviewImages(prev => ({
                ...prev,
                [currentId]: fabricCanvasRef.current.toDataURL({
                    format: 'png',
                    quality: 0.9,
                    multiplier: 0.8,
                })
            }));
        }
    };

    // Klargjør og lagrer hele presentasjonen, inkludert state og et preview-bilde av første lysbilde
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
            hasUnsavedChangesRef.current = false;
            return true;
        } catch (error) {
            setSaveError('Kunne ikke lagre presentasjonen. Prøv igjen.');
            return false;
        }
    };

    const updateCurrentSlidePolls = (updater) => {
        setSlides((previousSlides) => {
            markDirty();
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

    // Lagrer eller oppdaterer en avstemning (poll) på gjeldende lysbilde
    const handleSavePoll = (pollData) => {
        // Gjenbruker normalizePoll-hjelpefunksjonen for å sikre konsistent datastruktur
        const normalizedPoll = normalizePoll(pollData, editingPollIndex !== null ? editingPollIndex : 0);

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

    const confirmDeletePoll = () => {
        if (pollToDeleteIndex !== null) {
            handleDeletePoll(pollToDeleteIndex);
            setPollToDeleteIndex(null);
        }
    };

    useImperativeHandle(ref, () => ({
        savePresentation: handleSavePresentation,
        hasUnsavedChanges: () => hasUnsavedChangesRef.current,
    }));

    return (
        <div className="slide-editor">
            <Input
                ref={imageUploadInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageFileChange}
            />
            <div className="editor-sidebar">
                <div className="sidebar-header">
                    <h3>Lysbilder</h3>
                    <Button onClick={addSlide} size="sm" variant="outline" className="w-full flex items-center gap-1.5"><Plus className="h-3.5 w-3.5" /> Legg til</Button>
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
                        <Input
                            type="text"
                            className="presentation-title-input"
                            value={presentationTitle}
                            onChange={(e) => {
                                setPresentationTitle(e.target.value);
                                markDirty();
                            }}
                            placeholder="Presentasjonstittel"
                        />
                        <span className="slide-counter">
                            Lysbilde {currentSlideIndex + 1} av {slides.length}
                        </span>
                    </div>
                    <div className="toolbar-actions">
                        <Button
                            onClick={handleUndo}
                            variant="secondary"
                            size="sm"
                            className="flex items-center gap-1.5"
                            disabled={undoStack.length <= 1}
                        >
                            <Undo2 className="h-3.5 w-3.5" /> Angre
                        </Button>
                        <Button
                            onClick={handleRedo}
                            variant="secondary"
                            size="sm"
                            className="flex items-center gap-1.5"
                            disabled={!redoStack.length}
                        >
                            <Redo2 className="h-3.5 w-3.5" /> Gjør om
                        </Button>
                        <Button
                            onClick={handleSavePresentation}
                              variant="outline"
                              size="sm"
                              className="flex items-center gap-1.5 bg-emerald-500/15 text-emerald-500 border-emerald-500/30 hover:bg-accent hover:text-accent-foreground hover:border-input transition-colors"
                            disabled={isSaving}
                        >
                            <Save className="h-3.5 w-3.5" /> {isSaving ? 'Lagrer...' : 'Lagre'}
                        </Button>
                        <Button onClick={addTitle} variant="outline" size="sm" className="flex items-center gap-1.5"><TypeIcon className="h-3.5 w-3.5" /> Tittel</Button>
                        <Button onClick={addText} variant="outline" size="sm" className="flex items-center gap-1.5"><Type className="h-3.5 w-3.5" /> Tekst</Button>
                        <Button onClick={addImage} variant="outline" size="sm" className="flex items-center gap-1.5"><ImageIcon className="h-3.5 w-3.5" /> Bilde</Button>
                        <Button onClick={() => addShape('rectangle')} variant="outline" size="sm" className="flex items-center gap-1.5"><Square className="h-3.5 w-3.5" /> Rektangel</Button>
                        <Button onClick={() => addShape('circle')} variant="outline" size="sm" className="flex items-center gap-1.5"><CircleIcon className="h-3.5 w-3.5" /> Sirkel</Button>
                        <Button onClick={deleteSelected} variant="outline" size="sm" className="flex items-center gap-1.5 bg-destructive/15 text-destructive border-destructive/30 hover:bg-accent hover:text-accent-foreground hover:border-input transition-colors"><Trash2 className="h-3.5 w-3.5" /> Slett</Button>
                        <Label className="flex items-center gap-2 px-3 py-1.5 border border-input rounded-md text-sm font-medium hover:bg-accent hover:text-accent-foreground cursor-pointer bg-background">
                            <Palette className="h-3.5 w-3.5" /> Bakgrunn
                            <Input
                                type="color"
                                value={slides[currentSlideIndex]?.backgroundColor || '#ffffff'}
                                onChange={(e) => changeBackgroundColor(e.target.value)}
                            />
                        </Label>
                    </div>
                </div>
                {saveError && <div className="save-status error">{saveError}</div>}
                {lastSavedAt && !saveError && (
                    <div className="save-status success">
                        Sist lagret {lastSavedAt.toLocaleTimeString()}
                    </div>
                )}

                <div style={{ flex: 1, display: 'flex', overflow: 'auto' }}>
                    <div className="canvas-container">
                        <div className="slide-boundary">
                            <canvas ref={canvasRef} />
                        </div>
                    </div>
                </div>
            </div>

            {/* Polls Sidebar */}
            <div className="editor-sidebar" style={{ borderLeft: '1px solid var(--border)', borderRight: 'none', boxShadow: '-2px 0 10px rgba(0, 0, 0, 0.15)' }}>
                <div className="sidebar-header">
                    <h3>Polls</h3>
                    <Button onClick={openCreatePoll} size="sm" variant="outline" className="w-full flex items-center justify-center gap-1.5">
                        <Plus className="h-3.5 w-3.5" /> Ny poll
                    </Button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-4">
                    {(slides[currentSlideIndex]?.polls || []).length === 0 ? (
                        <div className="text-center mt-6">
                            <strong className="block text-foreground mb-1">Ingen polls</strong>
                            <span className="text-sm text-muted-foreground">Legg til en poll for å stille publikum et spørsmål.</span>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-4">
                            {(slides[currentSlideIndex]?.polls || []).map((poll, index) => {
                                const totalVotes = getPollTotalVotes(poll);

                                return (
                                    <div key={poll.id || index} className="border border-border rounded-xl p-3 bg-background shadow-sm">
                                        <div className="mb-3">
                                            <div className="flex justify-between items-start gap-2 mb-3">
                                                <strong className="text-sm font-medium leading-tight">{poll.question}</strong>
                                                <span className="text-xs text-muted-foreground whitespace-nowrap">{totalVotes} stemmer</span>
                                            </div>

                                            <div className="flex flex-col gap-2.5">
                                                {(poll.options || []).map((option, optionIndex) => {
                                                    const percentage = getPollOptionPercentage(option.votes, totalVotes);

                                                    return (
                                                        <div key={option.id || optionIndex} className="w-full">
                                                            <div className="flex justify-between text-[13px] mb-1.5">
                                                                <span className="font-medium text-foreground">{option.text}</span>
                                                                <span className="text-muted-foreground">
                                                                    {option.votes || 0} ({percentage}%)
                                                                </span>
                                                            </div>
                                                            <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                                                                <div
                                                                    className="h-full bg-primary"
                                                                    style={{ width: `${percentage}%` }}
                                                                />
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>

                                            {getPollHistory(poll)}
                                        </div>

                                        <div className="flex gap-2 pt-3 border-t border-border">
                                            <Button variant="secondary" size="sm" onClick={() => openEditPoll(index)} className="flex-1 h-8 text-xs">
                                                Rediger
                                            </Button>
                                            <Button variant="destructive" size="sm" onClick={() => setPollToDeleteIndex(index)} className="flex-1 h-8 text-xs bg-destructive/15 text-destructive border border-destructive/30 hover:bg-destructive/25 hover:text-destructive hover:border-destructive/40 transition-colors">
                                                Slett
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {isPollCreatorOpen && (
                <div className="poll-model-overlay" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="poll-model-card" style={{ background: 'white', padding: '24px', borderRadius: '12px', width: '100%', maxWidth: '500px', maxHeight: '90vh', overflowY: 'auto' }}>
                        <PollCreator
                            onCancel={closePollCreator}
                            onSave={handleSavePoll}
                            initialData={editingPollIndex !== null ? (slides[currentSlideIndex]?.polls || [])[editingPollIndex] : null}
                        />
                    </div>
                </div>
            )}

            {pollToDeleteIndex !== null && (
                <div className="fixed inset-0 z-9999 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-card border border-border p-6 rounded-2xl w-full max-w-105 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
                        <h3 className="text-lg font-semibold text-foreground text-left mb-2">Slett poll?</h3>
                        <p className="text-[15px] text-muted-foreground text-left mb-8">
                            Er du sikker på at du vil slette denne pollen? Dette kan ikke angres.
                        </p>
                        <div className="flex justify-end gap-3 mt-4">
                            <Button 
                                variant="outline" 
                                onClick={() => setPollToDeleteIndex(null)}
                                className="flex items-center gap-1.5 bg-transparent border-input hover:bg-accent hover:text-accent-foreground transition-colors"
                            >
                                <X className="h-4 w-4" /> Avbryt
                            </Button>
                            <Button 
                                variant="outline"
                                onClick={confirmDeletePoll}
                                className="flex items-center gap-1.5 bg-destructive/15 text-destructive border border-destructive/30 hover:bg-destructive/25 hover:text-destructive hover:border-destructive/40 transition-colors"
                            >
                                <Trash2 className="h-4 w-4" /> Slett
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
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