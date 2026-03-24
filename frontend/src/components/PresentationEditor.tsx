import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Canvas, IText, FabricImage, Rect, Circle } from 'fabric';
import {
    Circle as CircleIcon,
    Image as ImageIcon,
    Palette,
    Plus,
    Redo2,
    Save,
    Square,
    Trash2,
    Type,
    Type as TypeIcon,
    Undo2,
    X,
} from 'lucide-react';
import SlideThumbnails from './SlideThumbnails';
import PollCreator from './PollComponents/PollCreator';
import Question from './Question';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { createDefaultSlideFabricData } from '../lib/fabricDefaults';

const CANVAS_WIDTH = 960;
const CANVAS_HEIGHT = 540;
const CANVAS_PADDING = 30;

type CanvasSnapshot = {
    backgroundColor: string;
    fabricData: unknown;
};

type PollOption = {
    id: string;
    text: string;
    votes: number;
};

type PollSession = {
    id: string;
    startedAt: string;
    total: number;
    options: PollOption[];
};

type Poll = {
    id: string;
    question: string;
    options: PollOption[];
    latestSessionId: string | null;
    sessionHistory: PollSession[];
    createdAt: string;
};

type QuestionType = 'open_text' | 'single_choice';

type QuestionOption = {
    id: string;
    text: string;
};

type QuestionItem = {
    id: string;
    prompt: string;
    type: QuestionType;
    required: boolean;
    options: QuestionOption[];
    createdAt: string;
};

type Slide = {
    id: string;
    title: string;
    content: string;
    backgroundColor: string;
    fabricData: unknown;
    polls: Poll[];
    questions: QuestionItem[];
    previewImage?: string;
};

type PresentationData = {
    id?: string | number | null;
    title?: string;
    slides?: Array<Partial<Slide> & { polls?: unknown[]; questions?: unknown[] }>;
};

type SavePresentationPayload = {
    id: string | number | null;
    title: string;
    slides: Slide[];
};

type SavePresentationResult = {
    id?: string | number;
} | null;

const defaultSlide = (index = 1): Slide => ({
    id: `local-${Date.now()}`,
    title: `Lysbilde ${index}`, // Slide
    content: '',
    backgroundColor: '#ffffff',
    fabricData: createDefaultSlideFabricData(),
    polls: [],
    questions: [],
});

export type PresentationEditorHandle = {
    savePresentation: () => Promise<boolean>;
    hasUnsavedChanges: () => boolean;
};

type PresentationEditorProps = {
    presentation?: PresentationData | null;
    onSavePresentation?: (payload: any) => Promise<any>;
    isSaving?: boolean;
};

const PresentationEditor = forwardRef<PresentationEditorHandle, PresentationEditorProps>(
({ presentation, onSavePresentation, isSaving }, ref) => {
    // Referanser og grunnstate for editoren.
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const fabricCanvasRef = useRef<Canvas | null>(null);
    const imageUploadInputRef = useRef<HTMLInputElement | null>(null);
    const isApplyingCanvasStateRef = useRef(false);
    const [slides, setSlides] = useState<Slide[]>([defaultSlide()]);
    const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
    const [presentationId, setPresentationId] = useState<string | number | null>(null);
    const [presentationTitle, setPresentationTitle] = useState('Uten navn'); // Untitled Presentation
    const [saveError, setSaveError] = useState<string | null>(null);
    const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
    const [undoStack, setUndoStack] = useState<CanvasSnapshot[]>([]);
    const [redoStack, setRedoStack] = useState<CanvasSnapshot[]>([]);
    const [slidePreviewImages, setSlidePreviewImages] = useState<Record<string, string | null>>({});
    const [editingPollIndex, setEditingPollIndex] = useState<number | null>(null);
    const [pollToDeleteIndex, setPollToDeleteIndex] = useState<number | null>(null);
    const [isPollCreatorOpen, setIsPollCreatorOpen] = useState(false);
    const [isQuestionCreatorOpen, setIsQuestionCreatorOpen] = useState(false);
    const [editingQuestionIndex, setEditingQuestionIndex] = useState<number | null>(null);
    const [questionToDeleteIndex, setQuestionToDeleteIndex] = useState<number | null>(null);

    const hasUnsavedChangesRef = useRef(false);
    
    const markDirty = () => {
        hasUnsavedChangesRef.current = true;
    }

    const currentSlideIdRef = useRef<string | null>(null);
    useEffect(() => {
        currentSlideIdRef.current = slides[currentSlideIndex]?.id || null;
    }, [slides, currentSlideIndex]);

    // Snapshot brukes for angre/gjør om uten å mutere lerretet direkte.
    const createCanvasSnapshot = (): CanvasSnapshot | null => {
        if (!fabricCanvasRef.current) return null;

        const canvasBackgroundColor = fabricCanvasRef.current.backgroundColor;

        return {
            backgroundColor: typeof canvasBackgroundColor === 'string' ? canvasBackgroundColor : '#ffffff',
            fabricData: fabricCanvasRef.current.toJSON(),
        };
    };

    const areSnapshotsEqual = (first: CanvasSnapshot | undefined, second: CanvasSnapshot | undefined) => {
        if (!first || !second) return false;
        return JSON.stringify(first) === JSON.stringify(second);
    };

    const pushHistorySnapshot = (snapshot: CanvasSnapshot | null) => {
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

    const resetHistoryWithSnapshot = (snapshot: CanvasSnapshot | null) => {
        if (!snapshot) {
            setUndoStack([]);
            setRedoStack([]);
            return;
        }

        setUndoStack([snapshot]);
        setRedoStack([]);
    };

    // Gjenoppretter et definert state (snapshot) tilbake til canvas-lerretet
    const applyCanvasSnapshot = async (snapshot: CanvasSnapshot) => {
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

    // Synkroniserer innkommende presentasjon fra parent til lokal editor-state.
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
            questions: Array.isArray(slide.questions)
                ? slide.questions.map((question, questionIndex) => normalizeQuestion(question, questionIndex))
                : [],
        }));

        setPresentationId(presentation.id || null);
        setPresentationTitle(presentation.title || 'Uten navn');
        setSlides(normalizedSlides.length ? normalizedSlides : [defaultSlide()]);
        setCurrentSlideIndex(0);
        setSaveError(null);
        hasUnsavedChangesRef.current = false;
    }, [presentation]);

    // Initialiserer selve Fabric.js-lerretet når komponenten monteres.
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

    // Laster aktivt lysbilde inn i Fabric ved bytte av slide.
    useEffect(() => {
        if (fabricCanvasRef.current && slides[currentSlideIndex]) {
            const currentSlide = slides[currentSlideIndex];
            
            const backgroundColor = currentSlide.backgroundColor || '#ffffff';

            isApplyingCanvasStateRef.current = true;

            if (currentSlide.fabricData) {
                fabricCanvasRef.current.loadFromJSON(currentSlide.fabricData).then(() => {
                    clampAllObjectsToCanvas();
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
        const canvasBackgroundColor = fabricCanvasRef.current.backgroundColor;
        const backgroundColor =
            typeof canvasBackgroundColor === 'string'
                ? canvasBackgroundColor
                : currentSlide.backgroundColor || '#ffffff';

        const newSlides = [...slides];
        newSlides[currentSlideIndex] = {
            ...currentSlide,
            backgroundColor,
            fabricData: fabricCanvasRef.current.toJSON(),
        };

        return newSlides;
    };

    // Lager et miniatyrbilde av lysbildet (snapshot) i bakgrunnen uten å påvirke hovedlerretet
    const createSlideSnapshot = async (slide: Slide): Promise<string> => {
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

            const previews: Record<string, string | null> = {};

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

    // Muliggjør sletting av objekter på lerretet ved å trykke på "Delete" og "Backspace"-tasten
    useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key !== 'Delete' && event.key !== 'Backspace') return;

        const target = event.target as HTMLElement | null;
        const tagName = target?.tagName?.toLowerCase();

        // Gjør slik at Delete/Backspace-tasten ikke sletter objekter når man skriver i tekstfelt
        if (
            tagName === 'input' ||
            tagName === 'textarea' ||
            target?.isContentEditable
        ) {
            return;
        }

        const canvas = fabricCanvasRef.current;
        if (!canvas) return;

        const activeObject = canvas.getActiveObject();
        if (!activeObject) return;

        // Hvis et tekstobjekt er i redigeringsmodus, skal ikke Delete-tasten slette hele objektet
        if ('isEditing' in activeObject && (activeObject as any).isEditing) {
            return;
        }

        event.preventDefault();
        deleteSelected();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

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
            questions: [],
        };
        markDirty();
        setSlides([...currentSlides, newSlide]);
        setCurrentSlideIndex(currentSlides.length);
    };

    // Sletter et lysbilde (krever at det finnes minst ett igjen)
    const deleteSlide = (index: number) => {
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
    const duplicateSlide = (index: number) => {
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
            questions: (slideToDuplicate.questions || []).map((question, questionIndex) => ({
                ...question,
                id: `local-question-${Date.now()}-${questionIndex}`,
                options: (question.options || []).map((option, optionIndex) => ({
                    ...option,
                    id: option?.id || `local-question-option-${Date.now()}-${questionIndex}-${optionIndex}`,
                })),
            })),
        };
        const newSlides = [...currentSlides];
        newSlides.splice(index + 1, 0, newSlide);
        markDirty();
        setSlides(newSlides);
        setCurrentSlideIndex(index + 1);
    };

    const handleSlideSelect = (index: number) => {
        saveCurrentSlide();
        setCurrentSlideIndex(index);
    };

    const clampObjectToCanvas = (object: any) => {
        object.setCoords();
        const bounds = object.getBoundingRect();

        let nextLeft = object.left ?? 0;
        let nextTop = object.top ?? 0;

        const minBoundsLeft = CANVAS_PADDING;
        const maxBoundsLeft = CANVAS_WIDTH - CANVAS_PADDING - bounds.width;
        const targetBoundsLeft = Math.min(
            Math.max(bounds.left, minBoundsLeft),
            Math.max(minBoundsLeft, maxBoundsLeft)
        );

        const minBoundsTop = CANVAS_PADDING;
        const maxBoundsTop = CANVAS_HEIGHT - CANVAS_PADDING - bounds.height;
        const targetBoundsTop = Math.min(
            Math.max(bounds.top, minBoundsTop),
            Math.max(minBoundsTop, maxBoundsTop)
        );

        nextLeft += targetBoundsLeft - bounds.left;
        nextTop += targetBoundsTop - bounds.top;

        object.set({ left: nextLeft, top: nextTop });
        object.setCoords();
    };

    const clampAllObjectsToCanvas = () => {
        if (!fabricCanvasRef.current) return;
        fabricCanvasRef.current.getObjects().forEach(clampObjectToCanvas);
    };

    // Helper function to constrain position within canvas bounds
    const getSafePosition = (preferredLeft: number, preferredTop: number, elementWidth = 200, elementHeight = 150) => {
        const minPos = CANVAS_PADDING;
        const maxLeft = CANVAS_WIDTH - elementWidth - CANVAS_PADDING; // Account for typical element width safely
        const maxTop = CANVAS_HEIGHT - elementHeight - CANVAS_PADDING;  // Account for typical element height safely
        
        return {
            left: Math.max(minPos, Math.min(preferredLeft, maxLeft)),
            top: Math.max(minPos, Math.min(preferredTop, maxTop)),
        };
    };

    // Fabric.js Tools
    const addText = () => {
        if (!fabricCanvasRef.current) return;
        
        const pos = getSafePosition(80, 150, 280, 40);
        const text = new IText('Klikk for å redigere', { // Click to edit
            left: pos.left,
            top: pos.top,
            originX: 'left',
            originY: 'top',
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
        
        const pos = getSafePosition(80, 60, 340, 60);
        const text = new IText('Tittel', { // Slide Title
            left: pos.left,
            top: pos.top,
            originX: 'left',
            originY: 'top',
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

    const handleImageFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || !fabricCanvasRef.current) return;

        const reader = new FileReader();
        reader.onload = (loadEvent) => {
            const imageSource = loadEvent.target?.result;
            if (!imageSource || typeof imageSource !== 'string') return;

            FabricImage.fromURL(imageSource).then((img) => {
                img.scaleToWidth(400);
                const scaledHeight = (img.height || 0) * (img.scaleY || 1);
                const pos = getSafePosition(80, 150, 400, scaledHeight || 300);
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

    const addShape = (shapeType: 'rectangle' | 'circle') => {
        if (!fabricCanvasRef.current) return;
        
        const pos = getSafePosition(80, 150);
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

    const changeBackgroundColor = (color: string) => {
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
    // ...existing code...

const handleSavePresentation = async (): Promise<boolean> => {
  if (!onSavePresentation || isSaving) return false

  try {
    setSaveError(null)

    // Current canvas er med i neste save 
    const slidesToSave = saveCurrentSlide()

    const payload = {
      id: presentationId ?? undefined,
      title: (presentationTitle || 'Untitled Presentation').trim() || 'Untitled Presentation',
      slides: slidesToSave.map((slide, index) => ({
        title: slide?.title || `Slide ${index + 1}`,
        content: slide?.content || '',
        backgroundColor: slide?.backgroundColor || '#ffffff',
        fabricData: slide?.fabricData ?? null,
        polls: Array.isArray(slide?.polls) ? slide.polls : [],
      })),
    }

    const savedPresentation = await onSavePresentation(payload)

    // Syncer lokal editor med backend respons
    if (savedPresentation?.id) {
      setPresentationId(savedPresentation.id)
    }

    if (typeof savedPresentation?.title === 'string') {
      setPresentationTitle(savedPresentation.title)
    }

    if (Array.isArray(savedPresentation?.slides) && savedPresentation.slides.length > 0) {
      const normalizedSlides = savedPresentation.slides.map((slide: any, index: number) => ({
        id: slide?.id ?? `local-${Date.now()}-${index}`,
        title: slide?.title || `Slide ${index + 1}`,
        content: slide?.content || '',
        backgroundColor: slide?.backgroundColor || '#ffffff',
        fabricData: slide?.fabricData ?? null,
        polls: Array.isArray(slide?.polls) ? slide.polls : [],
      }))

      setSlides(normalizedSlides)
      setCurrentSlideIndex((prev) => Math.min(prev, normalizedSlides.length - 1))
    }

    setLastSavedAt(new Date())
    hasUnsavedChangesRef.current = false
    return true
  } catch (err) {
    console.error('Save presentation failed:', err)
    setSaveError('Kunne ikke lagre presentasjonen. Prøv igjen.')
    return false
  }
}


    // Hjelper for å oppdatere polls atomisk på valgt slide.
    const updateCurrentSlidePolls = (updater: (currentPolls: Poll[]) => Poll[]) => {
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

    const updateCurrentSlideQuestions = (updater: (currentQuestions: QuestionItem[]) => QuestionItem[]) => {
        setSlides((previousSlides) => {
            markDirty();
            const nextSlides = [...previousSlides];
            const currentSlide = nextSlides[currentSlideIndex];

            if (!currentSlide) return previousSlides;

            const currentQuestions = Array.isArray(currentSlide.questions) ? currentSlide.questions : [];
            const nextQuestions = updater(currentQuestions);

            nextSlides[currentSlideIndex] = {
                ...currentSlide,
                questions: nextQuestions,
            };

            return nextSlides;
        });
    };

    const openCreatePoll = () => {
        setEditingPollIndex(null);
        setIsPollCreatorOpen(true);
    };

    const openEditPoll = (index: number) => {
        setEditingPollIndex(index);
        setIsPollCreatorOpen(true);
    };

    const closePollCreator = () => {
        setEditingPollIndex(null);
        setIsPollCreatorOpen(false);
    };

    const openCreateQuestion = () => {
        setEditingQuestionIndex(null);
        setIsQuestionCreatorOpen(true);
    };

    const openEditQuestion = (index: number) => {
        setEditingQuestionIndex(index);
        setIsQuestionCreatorOpen(true);
    };

    const closeQuestionCreator = () => {
        setEditingQuestionIndex(null);
        setIsQuestionCreatorOpen(false);
    };

    // Lagrer eller oppdaterer en avstemning (poll) på gjeldende lysbilde
    const handleSavePoll = (pollData: unknown) => {
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

    const handleDeletePoll = (index: number) => {
        updateCurrentSlidePolls((currentPolls) => currentPolls.filter((_, pollIndex) => pollIndex !== index));
    };

    const handleSaveQuestion = (questionData: unknown) => {
        const normalizedQuestion = normalizeQuestion(
            questionData,
            editingQuestionIndex !== null ? editingQuestionIndex : 0
        );

        updateCurrentSlideQuestions((currentQuestions) => {
            if (editingQuestionIndex === null) {
                return [...currentQuestions, normalizedQuestion];
            }

            return currentQuestions.map((question, index) => (
                index === editingQuestionIndex ? normalizedQuestion : question
            ));
        });

        closeQuestionCreator();
    };

    const handleDeleteQuestion = (index: number) => {
        updateCurrentSlideQuestions((currentQuestions) => currentQuestions.filter((_, questionIndex) => questionIndex !== index));
    };

    const confirmDeletePoll = () => {
        if (pollToDeleteIndex !== null) {
            handleDeletePoll(pollToDeleteIndex);
            setPollToDeleteIndex(null);
        }
    };

    const confirmDeleteQuestion = () => {
        if (questionToDeleteIndex !== null) {
            handleDeleteQuestion(questionToDeleteIndex);
            setQuestionToDeleteIndex(null);
        }
    };

    useImperativeHandle(ref, () => ({
        savePresentation: handleSavePresentation,
        hasUnsavedChanges: () => hasUnsavedChangesRef.current,
    }));

    return (
        <div className="flex h-screen items-stretch bg-background overflow-hidden">
            <Input
                ref={imageUploadInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageFileChange}
            />

            <div className="flex h-screen w-72.5 shrink-0 grow-0 basis-72.5 flex-col overflow-y-auto border-r border-border bg-card shadow-[2px_0_10px_rgba(0,0,0,0.35)]">
                <div className="border-b border-border p-6">
                    <h3 className="mb-4 text-xl text-foreground">Lysbilder</h3>
                    <Button onClick={addSlide} size="sm" variant="outline" className="w-full flex items-center gap-1.5">
                        <Plus className="h-3.5 w-3.5" /> Legg til
                    </Button>
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

            <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-6 overflow-auto p-4">
                <div className="flex w-full max-w-225 flex-col items-stretch gap-3 rounded-[10px] border border-border bg-card px-6 py-4 shadow-[0_4px_6px_rgba(0,0,0,0.25)]">
                    <div className="flex min-w-0 flex-wrap items-center gap-4">
                        <Input
                            type="text"
                            className="h-auto w-auto min-w-55 flex-1 basis-[320px] rounded-md border-border bg-input px-3 py-[0.55rem] text-base text-foreground"
                            value={presentationTitle}
                            onChange={(e) => {
                                setPresentationTitle(e.target.value);
                                markDirty();
                            }}
                            placeholder="Presentasjonstittel"
                        />
                        <span className="ml-auto inline-flex whitespace-nowrap text-[1.1rem] font-semibold leading-none text-foreground">
                            Lysbilde {currentSlideIndex + 1} av {slides.length}
                        </span>
                    </div>
                    <div className="flex flex-wrap items-center justify-start gap-2">
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
                {saveError && <div className="rounded-lg bg-[rgba(239,68,68,0.18)] px-4 py-2.5 text-sm font-semibold text-[#fca5a5]">{saveError}</div>}
                {lastSavedAt && !saveError && (
                    <div className="rounded-lg bg-[rgba(16,185,129,0.18)] px-4 py-2.5 text-sm font-semibold text-[#6ee7b7]">
                        Sist lagret {lastSavedAt.toLocaleTimeString()}
                    </div>
                )}

                <div className="flex flex-1 overflow-auto">
                    <div className="relative flex min-h-100 flex-1 items-center justify-center rounded-[10px] bg-transparent p-8 [&_canvas]:rounded-lg">
                        <div>
                            <canvas ref={canvasRef} />
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex h-screen w-72.5 shrink-0 grow-0 basis-72.5 flex-col overflow-y-auto border-l border-border bg-card shadow-[-2px_0_10px_rgba(0,0,0,0.15)]">
                <div className="border-b border-border p-6">
                    <h3 className="mb-4 text-xl text-foreground">Interaksjoner</h3>
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                    <div className="mb-6">
                        <div className="flex items-center justify-between mb-3">
                            <h4 className="text-sm font-semibold">Spørsmål</h4>
                            <Button onClick={openCreateQuestion} size="sm" variant="outline" className="h-8 flex items-center justify-center gap-1.5">
                                <Plus className="h-3.5 w-3.5" /> Nytt
                            </Button>
                        </div>

                        {(slides[currentSlideIndex]?.questions || []).length === 0 ? (
                            <div className="text-center mt-4 border border-dashed border-border rounded-xl p-4">
                                <strong className="block text-foreground mb-1">Ingen spørsmål</strong>
                                <span className="text-sm text-muted-foreground">Legg til spørsmål deltakerne kan svare på live.</span>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-3">
                                {(slides[currentSlideIndex]?.questions || []).map((question, index) => (
                                    <div key={question.id || index} className="border border-border rounded-xl p-3 bg-background shadow-sm">
                                        <div className="mb-3">
                                            <div className="flex justify-between items-start gap-2 mb-1.5">
                                                <strong className="text-sm font-medium leading-tight">{question.prompt}</strong>
                                            </div>
                                            <span className="text-xs text-muted-foreground">
                                                {question.type === 'single_choice' ? 'Single choice' : 'Åpent svar'}
                                                {question.required ? ' • Obligatorisk' : ''}
                                            </span>
                                        </div>
                                        <div className="flex gap-2 pt-3 border-t border-border">
                                            <Button variant="secondary" size="sm" onClick={() => openEditQuestion(index)} className="flex-1 h-8 text-xs">
                                                Rediger
                                            </Button>
                                            <Button variant="destructive" size="sm" onClick={() => setQuestionToDeleteIndex(index)} className="flex-1 h-8 text-xs bg-destructive/15 text-destructive border border-destructive/30 hover:bg-destructive/25 hover:text-destructive hover:border-destructive/40 transition-colors">
                                                Slett
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="border-t border-border pt-4">
                        <div className="flex items-center justify-between mb-3">
                            <h4 className="text-sm font-semibold">Polls</h4>
                            <Button onClick={openCreatePoll} size="sm" variant="outline" className="h-8 flex items-center justify-center gap-1.5">
                                <Plus className="h-3.5 w-3.5" /> Ny
                            </Button>
                        </div>

                        {(slides[currentSlideIndex]?.polls || []).length === 0 ? (
                            <div className="text-center mt-4 border border-dashed border-border rounded-xl p-4">
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
                                                                    <div className="h-full bg-primary" style={{ width: `${percentage}%` }} />
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
            </div>

            {isQuestionCreatorOpen && (
                <div className="fixed inset-0 z-9999 flex items-center justify-center bg-black/50 p-4">
                <div className="max-h-[90vh] w-full max-w-125 overflow-y-auto rounded-xl border border-border bg-card p-6">
                        <Question
                            onCancel={closeQuestionCreator}
                            onSave={handleSaveQuestion}
                            initialData={editingQuestionIndex !== null ? (slides[currentSlideIndex]?.questions || [])[editingQuestionIndex] : null}
                        />
                    </div>
                </div>
            )}

            {questionToDeleteIndex !== null && (
                <div className="fixed inset-0 z-9999 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-card border border-border p-6 rounded-2xl w-full max-w-105 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
                        <h3 className="text-lg font-semibold text-foreground text-left mb-2">Slett spørsmål?</h3>
                        <p className="text-[15px] text-muted-foreground text-left mb-8">
                            Er du sikker på at du vil slette dette spørsmålet? Dette kan ikke angres.
                        </p>
                        <div className="flex justify-end gap-3 mt-4">
                            <Button
                                variant="outline"
                                onClick={() => setQuestionToDeleteIndex(null)}
                                className="flex items-center gap-1.5 bg-transparent border-input hover:bg-accent hover:text-accent-foreground transition-colors"
                            >
                                <X className="h-4 w-4" /> Avbryt
                            </Button>
                            <Button
                                variant="outline"
                                onClick={confirmDeleteQuestion}
                                className="flex items-center gap-1.5 bg-destructive/15 text-destructive border border-destructive/30 hover:bg-destructive/25 hover:text-destructive hover:border-destructive/40 transition-colors"
                            >
                                <Trash2 className="h-4 w-4" /> Slett
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {isPollCreatorOpen && (
                <div className="fixed inset-0 z-9999 flex items-center justify-center bg-black/50 p-4">
                    <div className="max-h-[90vh] w-full max-w-125 overflow-y-auto rounded-xl border border-border bg-card p-6">
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

const normalizeQuestionOption = (option: unknown, questionIndex: number, optionIndex: number): QuestionOption => {
    const rawOption = (typeof option === 'object' && option !== null ? option : {}) as Partial<QuestionOption>;

    return {
        id: rawOption.id || `local-question-option-${Date.now()}-${questionIndex}-${optionIndex}`,
        text: typeof option === 'string' ? option : (rawOption.text || ''),
    };
};

const normalizeQuestion = (question: unknown, questionIndex: number): QuestionItem => {
    const rawQuestion = (typeof question === 'object' && question !== null ? question : {}) as Partial<QuestionItem> & {
        options?: unknown[];
    };

    return {
        id: rawQuestion.id || `local-question-${Date.now()}-${questionIndex}`,
        prompt: rawQuestion.prompt || '',
        type: rawQuestion.type === 'single_choice' ? 'single_choice' : 'open_text',
        required: Boolean(rawQuestion.required),
        options: Array.isArray(rawQuestion.options)
            ? rawQuestion.options
                .map((option, optionIndex) => normalizeQuestionOption(option, questionIndex, optionIndex))
                .filter((option) => option.text.trim().length > 0)
            : [],
        createdAt: rawQuestion.createdAt || new Date().toISOString(),
    };
};
type PollInput = Partial<Poll> & {
    options?: unknown[];
    sessionHistory?: unknown[];
};

const normalizePollOption = (option: unknown, pollIndex: number, optionIndex: number): PollOption => {
    const rawOption = (typeof option === 'object' && option !== null ? option : {}) as Partial<PollOption>;

    return {
        id: rawOption.id || `local-option-${Date.now()}-${pollIndex}-${optionIndex}`,
        text: typeof option === 'string' ? option : (rawOption.text || ''),
        votes: Number(rawOption.votes || 0),
    };
};

const normalizePollSession = (session: unknown): PollSession => {
    const rawSession = (typeof session === 'object' && session !== null ? session : {}) as Partial<PollSession> & {
        options?: unknown[];
    };

    return {
        id: rawSession.id || `local-session-${Date.now()}`,
        startedAt: rawSession.startedAt || new Date().toISOString(),
        total: Number(rawSession.total || 0),
        options: Array.isArray(rawSession.options)
            ? rawSession.options.map((option, optionIndex) => normalizePollOption(option, 0, optionIndex))
            : [],
    };
};

// Normaliserer vilkårlig poll-input til en konsistent intern struktur.
const normalizePoll = (poll: unknown, pollIndex: number): Poll => {
    const rawPoll = (typeof poll === 'object' && poll !== null ? poll : {}) as PollInput;

    return {
        id: rawPoll.id || `local-poll-${Date.now()}-${pollIndex}`,
        question: rawPoll.question || '',
        options: Array.isArray(rawPoll.options)
            ? rawPoll.options.map((option, optionIndex) => normalizePollOption(option, pollIndex, optionIndex))
            : [],
        latestSessionId: rawPoll.latestSessionId || null,
        sessionHistory: Array.isArray(rawPoll.sessionHistory)
            ? rawPoll.sessionHistory.map(normalizePollSession)
            : [],
        createdAt: rawPoll.createdAt || new Date().toISOString(),
    };
};

// Summerer stemmer for alle alternativer i en poll.
const getPollTotalVotes = (poll: Poll) => {
    return (poll.options || []).reduce((sum, option) => sum + Number(option.votes || 0), 0);
};

// Regner ut prosentandel per alternativ.
const getPollOptionPercentage = (optionVotes: number, totalVotes: number) => {
    if (!totalVotes) return 0;
    return Math.round((Number(optionVotes || 0) / totalVotes) * 100);
};

// Rendrer tidligere sesjoner for en poll når historikk finnes.
const getPollHistory = (poll: Poll) => {
    return poll.sessionHistory?.length > 1 && (
        <details className="border-t border-border pt-3">
            <summary className="cursor-pointer text-[0.85rem] font-semibold text-muted-foreground">Previous Sessions</summary>
            <div className="mt-3 flex flex-col gap-3">
                {poll.sessionHistory.slice(1).map((session) => (
                    <div key={session.id} className="rounded-lg border border-border bg-card p-3">
                        <div className="mb-2 text-[0.82rem] font-semibold text-muted-foreground">
                            {new Date(session.startedAt).toLocaleString()} • {session.total} votes
                        </div>
                        <div className="flex flex-col gap-1.5">
                            {session.options.map((option) => (
                                <div key={option.id} className="flex justify-between gap-3 text-[0.85rem] text-foreground">
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