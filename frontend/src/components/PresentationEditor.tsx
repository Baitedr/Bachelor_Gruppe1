import react, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Canvas, IText, FabricImage, Rect, Circle } from 'fabric';
import {
    BarChart3,
    Circle as CircleIcon,
    Image as ImageIcon,
    PanelLeftClose,
    PanelLeftOpen,
    PanelRightClose,
    PanelRightOpen,
    Palette,
    Plus,
    Redo2,
    Square,
    Trash2,
    Type,
    Type as TypeIcon,
    Undo2,
    X,
} from 'lucide-react';
import SlideThumbnails from './SlideThumbnails';
import PollCreator from './polls/PollCreator';
import Question from './Question';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { createDefaultSlideFabricData } from '../lib/fabricDefaults';
// hjelpefunksjoner for å normalisere og håndtere presentasjonsvariabler
import {
    normalizePresentationVariables,
    normalizeVariableName,
    resolveFabricDataWithVariables,
    type PresentationVariable,
} from '../lib/utils';

const CANVAS_WIDTH = 960;
const CANVAS_HEIGHT = 540;
const CANVAS_PADDING = 30;
// Når vinduet er smalere enn dette, kollapser sidepanelene automatisk.
const SIDEBAR_AUTO_COLLAPSE_BREAKPOINT = 1500;

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
type OpenTextDisplayMode = 'word_cloud' | 'answer_list';

type QuestionOption = {
    id: string;
    text: string;
};

type QuestionItem = {
    id: string;
    prompt: string;
    type: QuestionType;
    openTextDisplayMode?: OpenTextDisplayMode;
    required: boolean;
    options: QuestionOption[];
    createdAt: string;
};

type Slide = {
    id: string;
    title: string;
    content: string;
    notes: string;
    backgroundColor: string;
    fabricData: unknown;
    polls: Poll[];
    questions: QuestionItem[];
    previewImage?: string;
};

type PresentationData = {
    id?: string | number | null;
    title?: string;
    variables?: PresentationVariable[];
    slides?: Array<Partial<Slide> & { polls?: unknown[]; questions?: unknown[]; variables?: unknown[] }>;
};

type SaveSlidePayload = {
    title: string;
    content: string;
    notes: string;
    backgroundColor: string;
    fabricData: unknown;
    previewImage?: string | null;
    polls: Poll[];
    questions: QuestionItem[];
};

type SavePresentationPayload = {
    id: string | number | null;
    title: string;
    variables: PresentationVariable[];
    slides: SaveSlidePayload[];
};

type SavePresentationResult = {
    id?: string | number;
} | null;

const defaultSlide = (index = 1): Slide => ({
    id: `local-${Date.now()}`,
    title: `Lysbilde ${index}`, // Slide
    content: '',
    notes: '',
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
   presentation: any 
   onSavePresentation: (payload: Record<string, unknown>) => Promise<any>
   isSaving: boolean
   onSaveComplete?: (savedAt: Date) => void
   onDirtyChange?: (isDirty: boolean) => void
};

const PresentationEditor = forwardRef<PresentationEditorHandle, PresentationEditorProps>(
({ presentation, onSavePresentation, isSaving, onSaveComplete, onDirtyChange }, ref) => {
    
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
    const [undoStack, setUndoStack] = useState<CanvasSnapshot[]>([]);
    const [redoStack, setRedoStack] = useState<CanvasSnapshot[]>([]);
    const [slidePreviewImages, setSlidePreviewImages] = useState<Record<string, string | null>>({});
    const [editingPollIndex, setEditingPollIndex] = useState<number | null>(null);
    const [pollToDeleteIndex, setPollToDeleteIndex] = useState<number | null>(null);
    const [isPollCreatorOpen, setIsPollCreatorOpen] = useState(false);
    const [isQuestionCreatorOpen, setIsQuestionCreatorOpen] = useState(false);
    const [editingQuestionIndex, setEditingQuestionIndex] = useState<number | null>(null);
    const [questionToDeleteIndex, setQuestionToDeleteIndex] = useState<number | null>(null);
    const [shapeColor, setShapeColor] = useState<string>('#667eea');
    const [hasSelectedShape, setHasSelectedShape] = useState(false);
    const [textColor, setTextColor] = useState<string>('#000000');
    const [hasSelectedText, setHasSelectedText] = useState(false);
    const [presentationVariables, setPresentationVariables] = useState<PresentationVariable[]>([]);

    // Sidebar-tilstand: manuell kollaps + responsiv auto-kollaps.
    const [isLeftSidebarCollapsed, setIsLeftSidebarCollapsed] = useState(false);
    const [isRightSidebarCollapsed, setIsRightSidebarCollapsed] = useState(false);
    const [isAutoCollapsed, setIsAutoCollapsed] = useState(false);

    // Referanser/tilstand for responsiv skalering av canvas.
    const canvasViewportRef = useRef<HTMLDivElement | null>(null);
    const canvasScaleWrapperRef = useRef<HTMLDivElement | null>(null);
    const [canvasScale, setCanvasScale] = useState(1);

    const hasUnsavedChangesRef = useRef(false);

    //Sjekker dirtystate for å aktivere autosave
    const setDirtyState = (next: boolean) => {
        if (hasUnsavedChangesRef.current === next) return
        hasUnsavedChangesRef.current = next
        onDirtyChange?.(next)
    }



    // Regner ut hvor mye 16:9-canvas kan skaleres innenfor tilgjengelig plass.
    const updateCanvasScale = useCallback(() => {
        const container = canvasViewportRef.current;
        if (!container) return;

        const availableWidth = Math.max(container.clientWidth - CANVAS_PADDING * 2, 0);
        const availableHeight = Math.max(container.clientHeight - CANVAS_PADDING * 2, 0);
        const nextScale = Math.min(
            1,
            availableWidth / CANVAS_WIDTH,
            availableHeight / CANVAS_HEIGHT
        );

        setCanvasScale(Number.isFinite(nextScale) && nextScale > 0 ? nextScale : 1);
    }, []);

    const markDirty = () => {
        setDirtyState(true)
    };

    const captureCanvasPreview = () => {
        if (!fabricCanvasRef.current) return null;

        return fabricCanvasRef.current.toDataURL({
            format: 'png',
            quality: 0.9,
            multiplier: 0.8,
        });
    };
    
    const serializeCanvasWithTemplateText = () => {
        if (!fabricCanvasRef.current) return null;
        return (fabricCanvasRef.current as any).toJSON(['templateText']);
    };

    const isShapeObject = (obj: any) => obj?.type === 'rect' || obj?.type === 'circle';
    const isTextObject = (obj: any) => obj?.type === 'i-text' || obj?.type === 'textbox' || obj?.type === 'text';
    // Når variabler oppdateres, må vi sørge for at alle tekstobjekter på lerretet oppdateres med de nye verdiene. 
    // Dette gjør at endringer i variabler ses med engang i forhåndsvisningen.
    const syncCurrentCanvasVariableText = useCallback(() => {
        const canvas = fabricCanvasRef.current;
        if (!canvas) return;

        let changed = false;

        canvas.getObjects().forEach((obj: any) => {
            if (!isTextObject(obj)) return;

            const templateText =
                typeof obj.templateText === 'string'
                    ? obj.templateText
                    : (typeof obj.text === 'string' ? obj.text : '');

            obj.set('templateText', templateText);

            if (!obj.isEditing && obj.text !== templateText) {
                obj.set('text', templateText);
                obj.setCoords?.();
                changed = true;
            }
        });

        if (changed) {
            canvas.renderAll();
        }
    }, []);

    const syncHasSelectedShape = () => {
        const canvas = fabricCanvasRef.current;
        if (!canvas) {
            setHasSelectedShape(false);
            setHasSelectedText(false);
            return;
        }

        const activeObjects = canvas.getActiveObjects();
        const selectedShape = activeObjects.find(isShapeObject);
        const selectedText = activeObjects.find(isTextObject);

        setHasSelectedShape(Boolean(selectedShape));
        setHasSelectedText(Boolean(selectedText));

        if (selectedShape && typeof selectedShape.fill === 'string') {
            setShapeColor(selectedShape.fill);
        }

        if (selectedText && typeof selectedText.fill === 'string') {
            setTextColor(selectedText.fill);
        }
    };

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
            fabricData: serializeCanvasWithTemplateText(),
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
            setPresentationVariables([]);
            setCurrentSlideIndex(0);
            hasUnsavedChangesRef.current = false;
            return;
        }

        const normalizedVariables = normalizePresentationVariables(
            presentation.variables || presentation.slides?.[0]?.variables || []
        );

        const normalizedSlides = (presentation.slides || []).map((slide, index) => ({
            id: slide.id || `local-${Date.now()}-${index}`,
            title: slide.title || `Lysbilde ${index + 1}`,
            content: slide.content || '',
            notes: slide.notes || '',
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
        setPresentationVariables(normalizedVariables);
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

    // Setter riktig initial kollaps-status ved første render.
    useEffect(() => {
        const shouldAutoCollapse = window.innerWidth <= SIDEBAR_AUTO_COLLAPSE_BREAKPOINT;

        setIsAutoCollapsed(shouldAutoCollapse);
        if (shouldAutoCollapse) {
            setIsLeftSidebarCollapsed(true);
            setIsRightSidebarCollapsed(true);
        } else {
            // Ved stor skjerm ved oppstart vises begge panelene.
            setIsLeftSidebarCollapsed(false);
            setIsRightSidebarCollapsed(false);
        }
    }, []);

    // Ved resize: auto-kollaps sidepanelene og oppdater canvasskalering.
    useEffect(() => {
        const handleResize = () => {
            const shouldAutoCollapse = window.innerWidth <= SIDEBAR_AUTO_COLLAPSE_BREAKPOINT;

            setIsAutoCollapsed(shouldAutoCollapse);
            if (shouldAutoCollapse) {
                setIsLeftSidebarCollapsed(true);
                setIsRightSidebarCollapsed(true);
            } else {
                // Når vinduet blir stort igjen, utvides panelene automatisk.
                setIsLeftSidebarCollapsed(false);
                setIsRightSidebarCollapsed(false);
            }

            updateCanvasScale();
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [updateCanvasScale]);

    // Observerer layoutendringer i canvas-viewporten for jevn responsiv skalering.
    useEffect(() => {
        const viewport = canvasViewportRef.current;
        if (!viewport) return;

        const resizeObserver = new ResizeObserver(() => {
            updateCanvasScale();
        });

        resizeObserver.observe(viewport);
        updateCanvasScale();

        return () => resizeObserver.disconnect();
    }, [updateCanvasScale, isLeftSidebarCollapsed, isRightSidebarCollapsed]);

    // Skriver skalering direkte på wrapper for å unngå inline-style i JSX.
    useEffect(() => {
        if (!canvasScaleWrapperRef.current) return;

        canvasScaleWrapperRef.current.style.transform = `scale(${canvasScale})`;
    }, [canvasScale]);

    // Laster aktivt lysbilde inn i Fabric ved bytte av slide.
    useEffect(() => {
        if (fabricCanvasRef.current && slides[currentSlideIndex]) {
            const currentSlide = slides[currentSlideIndex];

            const backgroundColor = currentSlide.backgroundColor || '#ffffff';

            isApplyingCanvasStateRef.current = true;

            if (currentSlide.fabricData) {
                fabricCanvasRef.current.loadFromJSON(currentSlide.fabricData).then(() => {
                    syncCurrentCanvasVariableText();
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
    }, [currentSlideIndex, slides, syncCurrentCanvasVariableText]);

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
            if (currentId) {
                const dataUrl = captureCanvasPreview();
                if (!dataUrl) return;
                setSlidePreviewImages((prev) => ({
                    ...prev,
                    [currentId]: dataUrl,
                }));
            }
        };

        const handleCanvasChangeWithPreview = () => {
            handleCanvasChange();
            updatePreview();
        }
        // For tekstobjekter må vi også oppdatere templateText for å kunne bevare variabelplaceholder og oppdatere dem dynamisk senere hvis variablene endres. 
        // Derfor har vi egne lyttere for tekstendringer og redigeringsmodus.
        const handleTextChange = (event: any) => {
            if (isApplyingCanvasStateRef.current) return;
            if (isTextObject(event?.target)) {
                event.target.set('templateText', typeof event.target.text === 'string' ? event.target.text : '');
            }
            handleCanvasChange();
            updatePreview();
        }

        const handleTextEditingEntered = (event: any) => {
            if (!isTextObject(event?.target)) return;

            const templateText = typeof event.target.templateText === 'string'
                ? event.target.templateText
                : (typeof event.target.text === 'string' ? event.target.text : '');
            event.target.set('text', templateText);
            canvas.renderAll();
        }

        const handleTextEditingExited = (event: any) => {
            if (!isTextObject(event?.target)) return;
            const templateText = typeof event.target.text === 'string' ? event.target.text : '';
            event.target.set('templateText', templateText);
            event.target.set('text', templateText);
            canvas.renderAll();
            updatePreview();
        }

        canvas.on('text:changed', handleTextChange);
        canvas.on('text:editing:entered', handleTextEditingEntered);
        canvas.on('text:editing:exited', handleTextEditingExited);
        canvas.on('object:added', handleCanvasChangeWithPreview);
        canvas.on('object:modified', handleCanvasChangeWithPreview);
        canvas.on('object:removed', handleCanvasChangeWithPreview);
        canvas.on('selection:created', syncHasSelectedShape);
        canvas.on('selection:updated', syncHasSelectedShape);
        canvas.on('selection:cleared', syncHasSelectedShape);

        syncHasSelectedShape();

        return () => {
            canvas.off('object:added', handleCanvasChangeWithPreview);
            canvas.off('object:modified', handleCanvasChangeWithPreview);
            canvas.off('object:removed', handleCanvasChangeWithPreview);
            canvas.off('text:changed', handleTextChange);
            canvas.off('text:editing:entered', handleTextEditingEntered);
            canvas.off('text:editing:exited', handleTextEditingExited);
            canvas.off('selection:created', syncHasSelectedShape);
            canvas.off('selection:updated', syncHasSelectedShape);
            canvas.off('selection:cleared', syncHasSelectedShape);
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
            fabricData: serializeCanvasWithTemplateText(),
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
                await tempFabricCanvas.loadFromJSON(resolveFabricDataWithVariables(slide.fabricData, presentationVariables));
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
    }, [slides, presentationVariables]);

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
    
    // Håndterer opprettelse, oppdatering og sletting av presentasjonsvariabler som kan brukes i tekstobjekter på lysbildene.
    const addVariable = () => {
        markDirty();
        setPresentationVariables((previous) => ([
            ...previous,
            {
                id: `variable-${Date.now()}-${previous.length}`,
                name: `tall_${previous.length + 1}`,
                value: '0',
            },
        ]));
    };

    const updateVariable = (variableId: string, field: 'name' | 'value', value: string) => {
        markDirty();
        setPresentationVariables((previous) => previous.map((variable) => {
            if (variable.id !== variableId) return variable;

            if (field === 'name') {
                return {
                    ...variable,
                    name: normalizeVariableName(value),
                };
            }

            return {
                ...variable,
                value,
            };
        }));
    };

    const deleteVariable = (variableId: string) => {
        markDirty();
        setPresentationVariables((previous) => previous.filter((variable) => variable.id !== variableId));
    };

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
            notes: '',
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
            fill: textColor,
            fontFamily: 'Arial',
            lineHeight: 1.2,
            templateText: 'Klikk for å redigere',
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
            fill: textColor,
            fontFamily: 'Arial',
            fontWeight: 'bold',
            lineHeight: 1.16,
            templateText: 'Tittel',
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
                    fill: shapeColor,
                });
                break;
            case 'circle':
                shape = new Circle({
                    left: pos.left,
                    top: pos.top,
                    radius: 75,
                    fill: shapeColor,
                });
                break;
        }

        if (shape) {
            fabricCanvasRef.current.add(shape);
            fabricCanvasRef.current.setActiveObject(shape);
            fabricCanvasRef.current.renderAll();
            syncHasSelectedShape();
        }
    };

    const changeSelectedShapeColor = (color: string) => {
        if (!fabricCanvasRef.current) return;

        const activeObjects = fabricCanvasRef.current.getActiveObjects();
        if (!activeObjects.length) return;

        let changed = false;

        activeObjects.forEach((obj: any) => {
            if (obj.type === 'rect' || obj.type === 'circle') {
                obj.set('fill', color);
                changed = true;
            }
        });

        if (!changed) return;

        fabricCanvasRef.current.renderAll();
        markDirty();
        pushHistorySnapshot(createCanvasSnapshot());

        const currentId = currentSlideIdRef.current;
        if (currentId) {
            setSlidePreviewImages((prev) => ({
                ...prev,
                [currentId]: fabricCanvasRef.current!.toDataURL({
                    format: 'png',
                    quality: 0.9,
                    multiplier: 0.8,
                }),
            }));
        }
    };

    const changeSelectedTextColor = (color: string) => {
        if (!fabricCanvasRef.current) return;

        const activeObjects = fabricCanvasRef.current.getActiveObjects();
        if (!activeObjects.length) return;

        let changed = false;

        activeObjects.forEach((obj: any) => {
            if (isTextObject(obj)) {
                obj.set('fill', color);
                changed = true;
            }
        });

        if (!changed) return;

        fabricCanvasRef.current.renderAll();
        markDirty();
        pushHistorySnapshot(createCanvasSnapshot());

        const currentId = currentSlideIdRef.current;
        if (currentId) {
            setSlidePreviewImages((prev) => ({
                ...prev,
                [currentId]: fabricCanvasRef.current!.toDataURL({
                    format: 'png',
                    quality: 0.9,
                    multiplier: 0.8,
                }),
            }));
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
        const currentSlide = slidesToSave[currentSlideIndex]
        const currentSlidePreview = captureCanvasPreview()
        const slidePreviewsById = { ...slidePreviewImages }

        if (currentSlide?.id && currentSlidePreview) {
            slidePreviewsById[currentSlide.id] = currentSlidePreview
        }

    const payload: SavePresentationPayload = {
      id: presentationId ?? undefined,
      title: (presentationTitle || 'Untitled Presentation').trim() || 'Untitled Presentation',
      variables: normalizePresentationVariables(presentationVariables),
      slides: slidesToSave.map((slide, index) => ({
        title: slide?.title || `Slide ${index + 1}`,
        content: slide?.content || '',
        notes: slide?.notes || '',
        backgroundColor: slide?.backgroundColor || '#ffffff',
        fabricData: slide?.fabricData ?? null,
                previewImage: slide?.id ? (slidePreviewsById[slide.id] || slide?.previewImage || null) : (slide?.previewImage || null),
        polls: Array.isArray(slide?.polls) ? slide.polls : [],
                questions: Array.isArray(slide?.questions) ? slide.questions : [],
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

    if (savedPresentation?.variables) {
      setPresentationVariables(normalizePresentationVariables(savedPresentation.variables))
    }

    if (Array.isArray(savedPresentation?.slides) && savedPresentation.slides.length > 0) {
      const normalizedSlides = savedPresentation.slides.map((slide: any, index: number) => ({
        id: slide?.id ?? `local-${Date.now()}-${index}`,
        title: slide?.title || `Slide ${index + 1}`,
        content: slide?.content || '',
        notes: slide?.notes || '',
        backgroundColor: slide?.backgroundColor || '#ffffff',
        fabricData: slide?.fabricData ?? null,
                previewImage: slide?.previewImage || null,
        polls: Array.isArray(slide?.polls) ? slide.polls : [],
            questions: Array.isArray(slide?.questions) ? slide.questions : [],
      }))

      setSlides(normalizedSlides)
      setCurrentSlideIndex((prev) => Math.min(prev, normalizedSlides.length - 1))
    }

    const savedAt = new Date();
    onSaveComplete?.(savedAt);
    hasUnsavedChangesRef.current = false;
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

    const handleSlideReorder = (fromIndex: number, toIndex: number) => {
        const currentSlides = saveCurrentSlide();
        const reordered = [...currentSlides];
        const [moved] = reordered.splice(fromIndex, 1);
        reordered.splice(toIndex, 0, moved);
        markDirty();
        setSlides(reordered);

        if (currentSlideIndex === fromIndex) {
            setCurrentSlideIndex(toIndex);
        } else if (fromIndex < currentSlideIndex && toIndex >= currentSlideIndex) {
            setCurrentSlideIndex(currentSlideIndex - 1);
        } else if (fromIndex > currentSlideIndex && toIndex <= currentSlideIndex) {
            setCurrentSlideIndex(currentSlideIndex + 1);
        }
    };


    return (
        <div className="flex min-h-0 flex-1 items-stretch gap-2 overflow-hidden bg-background p-2">
            <Input
                ref={imageUploadInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageFileChange}
            />

            <div className={`${isLeftSidebarCollapsed ? 'w-14' : 'w-72.5'} flex h-full shrink-0 grow-0 basis-auto flex-col rounded-xl border border-border bg-card shadow-[2px_0_14px_rgba(0,0,0,0.05)] ring-1 ring-border/30 transition-all duration-200`}>
                <div className="flex items-center justify-between border-b border-border p-3">
                    {!isLeftSidebarCollapsed && <h3 className="text-lg text-foreground">Lysbilder</h3>}
                    <Button
                        onClick={() => setIsLeftSidebarCollapsed((prev) => !prev)}
                        size="icon"
                        variant="ghost"
                        className="ml-auto h-8 w-8"
                        title={isLeftSidebarCollapsed ? 'Vis lysbildepanel' : 'Skjul lysbildepanel'}
                        aria-label={isLeftSidebarCollapsed ? 'Vis lysbildepanel' : 'Skjul lysbildepanel'}
                    >
                        {isLeftSidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                    </Button>
                </div>

                {/* Kompaktmodus: viser direktevalg av lysbilder slik at bruker kan hoppe rett til ønsket slide. */}
                {isLeftSidebarCollapsed && (
                    <div className="flex flex-1 flex-col items-center gap-2 p-2">
                        <Button
                            onClick={addSlide}
                            size="icon"
                            variant="outline"
                            className="h-8 w-8"
                            title="Legg til lysbilde"
                            aria-label="Legg til lysbilde"
                        >
                            <Plus className="h-4 w-4" />
                        </Button>
                        {/* Vertikal miniliste med alle lysbilder i kollapset visning. */}
                        <div className="flex min-h-0 w-full flex-1 flex-col items-center gap-1 overflow-y-auto pb-1">
                            {slides.map((slide, index) => (
                                <Button
                                    key={slide.id}
                                    onClick={() => setCurrentSlideIndex(index)}
                                    size="icon"
                                    // Aktiv slide vises med tydeligere kontrast via default-variant.
                                    variant={index === currentSlideIndex ? 'default' : 'outline'}
                                    className="h-8 w-8 text-xs"
                                    title={`Lysbilde ${index + 1}: ${slide.title || 'Uten tittel'}`}
                                    aria-label={`Gå til lysbilde ${index + 1}`}
                                >
                                    {index + 1}
                                </Button>
                            ))}
                        </div>
                    </div>
                )}

                {!isLeftSidebarCollapsed && (
                    <div className="min-h-0 flex-1 overflow-y-auto p-4">
                        <div className="mb-6">
                            <Button onClick={addSlide} size="sm" variant="outline" className="w-full flex items-center gap-1.5">
                                <Plus className="h-3.5 w-3.5" /> Nytt lysbilde
                            </Button>
                        </div>
                        <div className="border-t border-border pt-4">
                            <SlideThumbnails
                                slides={slides}
                                slidePreviewImages={slidePreviewImages}
                                currentSlideIndex={currentSlideIndex}
                                onSlideSelect={handleSlideSelect}
                                onSlideDelete={deleteSlide}
                                onSlideDuplicate={duplicateSlide}
                                onSlideReorder={handleSlideReorder}
                            />
                        </div>
                    </div>
                )}
            </div>

            <div className="flex min-h-0 min-w-0 flex-1 flex-col items-stretch justify-start gap-3 overflow-hidden bg-muted/22 p-2 sm:gap-4 sm:p-4 md:gap-6 dark:bg-transparent">
                <div className="mx-auto flex w-full max-w-225 shrink-0 flex-col items-stretch gap-3 rounded-[10px] border border-border bg-card px-4 py-3 shadow-[0_2px_10px_rgba(0,0,0,0.05),0_1px_2px_rgba(0,0,0,0.03)] sm:px-6 sm:py-4">
                    {/* Øverste rad: tittel + lysbilde-teller (lagre ligger i navbar) */}
                    <div className="flex min-w-0 flex-wrap items-center gap-4">
                        <Input
                            type="text"
                            className="h-auto min-w-0 flex-1 basis-[min(100%,280px)] rounded-md border-border bg-input px-3 py-[0.55rem] text-base text-foreground"
                            value={presentationTitle}
                            onChange={(e) => {
                                setPresentationTitle(e.target.value);
                                markDirty();
                            }}
                            placeholder="Presentasjonstittel"
                        />
                        <div className="ml-auto flex min-w-0 flex-wrap items-center gap-3">
                            <span className="inline-flex whitespace-nowrap text-[1.1rem] font-semibold leading-none text-foreground">
                                Lysbilde {currentSlideIndex + 1} av {slides.length}
                            </span>
                            {isAutoCollapsed && <Badge variant="secondary">Auto-kollaps aktiv</Badge>}
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-2">
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
                        <Button onClick={addTitle} variant="outline" size="sm" className="flex items-center gap-1.5"><TypeIcon className="h-3.5 w-3.5" /> Tittel</Button>
                        <Button onClick={addText} variant="outline" size="sm" className="flex items-center gap-1.5"><Type className="h-3.5 w-3.5" /> Tekst</Button>
                        <Button onClick={addImage} variant="outline" size="sm" className="flex items-center gap-1.5"><ImageIcon className="h-3.5 w-3.5" /> Bilde</Button>
                        <Button onClick={() => addShape('rectangle')} variant="outline" size="sm" className="flex items-center gap-1.5"><Square className="h-3.5 w-3.5" /> Rektangel</Button>
                        <Button onClick={() => addShape('circle')} variant="outline" size="sm" className="flex items-center gap-1.5"><CircleIcon className="h-3.5 w-3.5" /> Sirkel</Button>
                        <Button onClick={deleteSelected} variant="outline" size="sm" className="flex items-center gap-1.5 bg-destructive/15 text-destructive border-destructive/30 hover:bg-accent hover:text-accent-foreground hover:border-input transition-colors"><Trash2 className="h-3.5 w-3.5" /> Slett</Button>
                        <Label className="flex items-center gap-1.5 px-2 py-1 border border-input rounded-md text-xs font-medium hover:bg-accent hover:text-accent-foreground cursor-pointer bg-background">
                            <Palette className="h-3.5 w-3.5" /> Bakgrunn
                            <Input
                                type="color"
                                className="h-6 w-6 cursor-pointer border-0 bg-transparent p-0"
                                value={slides[currentSlideIndex]?.backgroundColor || '#ffffff'}
                                onChange={(e) => changeBackgroundColor(e.target.value)}
                            />
                        </Label>
                        <Label className="flex items-center gap-1.5 px-2 py-1 border border-input rounded-md text-xs font-medium hover:bg-accent hover:text-accent-foreground cursor-pointer bg-background">
                            <Square className="h-3.5 w-3.5" /> Figurfarge
                            <Input
                                type="color"
                                className="h-6 w-6 cursor-pointer border-0 bg-transparent p-0"
                                value={shapeColor}
                                disabled={!hasSelectedShape}
                                onChange={(e) => {
                                    const color = e.target.value;
                                    setShapeColor(color);
                                    changeSelectedShapeColor(color);
                                }}
                            />
                        </Label>
                        <Label className="flex items-center gap-1.5 px-2 py-1 border border-input rounded-md text-xs font-medium hover:bg-accent hover:text-accent-foreground cursor-pointer bg-background">
                            <Type className="h-3.5 w-3.5" /> Tekstfarge
                            <Input
                                type="color"
                                className="h-6 w-6 cursor-pointer border-0 bg-transparent p-0"
                                value={textColor}
                                disabled={!hasSelectedText}
                                onChange={(e) => {
                                    const color = e.target.value;
                                    setTextColor(color);
                                    changeSelectedTextColor(color);
                                }}
                            />
                        </Label>

                            
                    
                    </div>
                </div>
                {saveError && (
                    <div className="shrink-0 rounded-lg bg-[rgba(239,68,68,0.18)] px-4 py-2.5 text-sm font-semibold text-[#fca5a5]">
                        {saveError}
                    </div>
                )}

                <div className="flex min-h-0 w-full flex-1 overflow-hidden">
                    <div
                        ref={canvasViewportRef}
                        className="relative flex min-h-0 w-full flex-1 items-center justify-center rounded-[10px] bg-transparent p-3 sm:p-6 md:p-8"
                    >
                        <div
                            ref={canvasScaleWrapperRef}
                            className="h-135 w-240 origin-center rounded-lg ring-1 ring-border/45 shadow-[0_6px_28px_rgba(0,0,0,0.05),0_1px_4px_rgba(0,0,0,0.04)] dark:ring-border/35 dark:shadow-[0_10px_36px_rgba(0,0,0,0.35)] [&_canvas]:rounded-lg"
                        >
                            <canvas ref={canvasRef} />
                        </div>
                    </div>
                </div>

                <div className="mx-auto w-full max-w-225 shrink-0 rounded-[10px] border border-border bg-card px-4 py-3 shadow-[0_2px_10px_rgba(0,0,0,0.05),0_1px_2px_rgba(0,0,0,0.03)] sm:px-6 sm:py-4">
                    <Label htmlFor="presenter-notes" className="mb-1.5 block text-xs font-semibold text-foreground">Notater for slides</Label>
                    <Textarea
                        id="presenter-notes"
                        value={slides[currentSlideIndex]?.notes || ''}
                        onChange={(e) => {
                            const value = e.target.value;
                            markDirty();
                            setSlides((prevSlides) => {
                                const nextSlides = [...prevSlides];
                                const current = nextSlides[currentSlideIndex];
                                if (!current) return prevSlides;

                                nextSlides[currentSlideIndex] = {
                                    ...current,
                                    notes: value,
                                };

                                return nextSlides;
                            });
                        }}
                        placeholder="Skriv notater for deg selv som vises i live presentatørmodus"
                        className="min-h-21 resize-y"
                    />
                </div>
            </div>

            <div className={`${isRightSidebarCollapsed ? 'w-14' : 'w-72.5'} flex h-full shrink-0 grow-0 basis-auto flex-col rounded-xl border border-border bg-card shadow-[-2px_0_14px_rgba(0,0,0,0.05)] ring-1 ring-border/30 transition-all duration-200`}>
                <div className="flex items-center gap-2 border-b border-border p-3">
                    <Button
                        onClick={() => setIsRightSidebarCollapsed((prev) => !prev)}
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        title={isRightSidebarCollapsed ? 'Vis interaksjonspanel' : 'Skjul interaksjonspanel'}
                        aria-label={isRightSidebarCollapsed ? 'Vis interaksjonspanel' : 'Skjul interaksjonspanel'}
                    >
                        {isRightSidebarCollapsed ? <PanelRightOpen className="h-4 w-4" /> : <PanelRightClose className="h-4 w-4" />}
                    </Button>
                    {!isRightSidebarCollapsed && <h3 className="text-lg text-foreground">Interaksjoner</h3>}
                </div>

                {isRightSidebarCollapsed && (
                    <div className="flex flex-1 flex-col items-center gap-2 p-2">
                        <Button
                            onClick={openCreateQuestion}
                            size="icon"
                            variant="outline"
                            className="h-8 w-8"
                            title="Nytt spørsmål"
                            aria-label="Lag nytt spørsmål"
                        >
                            <Type className="h-4 w-4" />
                        </Button>
                        <Button
                            onClick={openCreatePoll}
                            size="icon"
                            variant="outline"
                            className="h-8 w-8"
                            title="Ny poll"
                            aria-label="Lag ny poll"
                        >
                            <BarChart3 className="h-4 w-4" />
                        </Button>
                        {/* Kompakte badges gjør antall lettere å lese i smal kollapset sidebar. */}
                        <Badge variant="outline" className="px-1.5 py-0 text-[10px] leading-none">
                            S {(slides[currentSlideIndex]?.questions || []).length}
                        </Badge>
                        <Badge variant="outline" className="px-1.5 py-0 text-[10px] leading-none">
                            P {(slides[currentSlideIndex]?.polls || []).length}
                        </Badge>
                    </div>
                )}
                {/* Utvidet modus viser full oversikt og redigering av spørsmål og polls knyttet til lysbildet. 
                Her kan man også legge til og redigere "variabler" som kan brukes som plassholdere i tekstfelter på lysbildene, for eksempel {{omsetning}}. */}
                {!isRightSidebarCollapsed && <div className="flex-1 overflow-y-auto p-4">
                    <div className="mb-6 rounded-xl border border-border bg-background p-3 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
                        <div className="mb-3 flex items-start justify-between gap-2">
                            <div>
                                <h4 className="text-sm font-semibold">Variabler</h4>
                                <p className="text-xs text-muted-foreground">
                                    {'Bruk plassholdere som {{omsetning}} i tekstfelter.'}
                                </p>
                            </div>
                            <Button onClick={addVariable} size="sm" variant="outline" className="h-8 flex items-center justify-center gap-1.5">
                                <Plus className="h-3.5 w-3.5" /> Ny
                            </Button>
                        </div>

                        {presentationVariables.length === 0 ? (
                            <div className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
                                {'Ingen variabler enda. Lag en variabel og skriv den inn i slidet som {{navn}}.'}
                            </div>
                        ) : (
                            <div className="flex flex-col gap-2">
                                {presentationVariables.map((variable) => (
                                    <div key={variable.id} className="rounded-lg border border-border p-2.5">
                                        <div className="mb-2 flex items-center justify-between gap-2">
                                            <span className="text-xs font-medium text-muted-foreground">Delt verdi</span>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => deleteVariable(variable.id)}
                                                className="h-7 px-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>
                                        <div className="space-y-2">
                                            <Input
                                                value={variable.name}
                                                onChange={(e) => updateVariable(variable.id, 'name', e.target.value)}
                                                placeholder="f.eks. omsetning"
                                                className="h-8"
                                            />
                                            <Input
                                                type="number"
                                                value={String(variable.value ?? '')}
                                                onChange={(e) => updateVariable(variable.id, 'value', e.target.value)}
                                                placeholder="Verdi"
                                                className="h-8"
                                            />
                                            <p className="text-[11px] text-muted-foreground">
                                                {'Bruk: {{'}{variable.name || 'navn'}{'}}'}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

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
                                    <div key={question.id || index} className="border border-border rounded-xl p-3 bg-background shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
                                        <div className="mb-3">
                                            <div className="flex justify-between items-start gap-2 mb-1.5">
                                                <strong className="text-sm font-medium leading-tight">{question.prompt}</strong>
                                            </div>
                                            <span className="text-xs text-muted-foreground">
                                                {question.type === 'single_choice' ? 'Single choice' : 'Åpent svar'}
                                                {question.type === 'open_text'
                                                    ? ` • ${question.openTextDisplayMode === 'answer_list' ? 'Svarliste' : 'Word cloud'}`
                                                    : ''}
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
                                        <div key={poll.id || index} className="border border-border rounded-xl p-3 bg-background shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
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
                                                                <progress
                                                                    className="h-1.5 w-full overflow-hidden rounded-full [&::-moz-progress-bar]:bg-primary [&::-webkit-progress-bar]:bg-secondary [&::-webkit-progress-value]:bg-primary"
                                                                    max={100}
                                                                    value={percentage}
                                                                />
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
                </div>}
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
                    <div className="bg-card border border-border p-6 rounded-2xl w-full max-w-105 shadow-[0_12px_40px_rgba(0,0,0,0.08),0_4px_12px_rgba(0,0,0,0.04)] dark:shadow-[0_12px_40px_rgba(0,0,0,0.45)] animate-in fade-in zoom-in-95 duration-200">
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
                    <div className="bg-card border border-border p-6 rounded-2xl w-full max-w-105 shadow-[0_12px_40px_rgba(0,0,0,0.08),0_4px_12px_rgba(0,0,0,0.04)] dark:shadow-[0_12px_40px_rgba(0,0,0,0.45)] animate-in fade-in zoom-in-95 duration-200">
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
        open_text_display_mode?: OpenTextDisplayMode;
    };

    const openTextDisplayMode: OpenTextDisplayMode =
        rawQuestion.openTextDisplayMode === 'answer_list' || rawQuestion.open_text_display_mode === 'answer_list'
            ? 'answer_list'
            : 'word_cloud';

    return {
        id: rawQuestion.id || `local-question-${Date.now()}-${questionIndex}`,
        prompt: rawQuestion.prompt || '',
        type: rawQuestion.type === 'single_choice' ? 'single_choice' : 'open_text',
        openTextDisplayMode,
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