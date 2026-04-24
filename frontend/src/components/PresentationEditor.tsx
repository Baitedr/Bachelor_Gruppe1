import react, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type ForwardedRef } from 'react';
import { Canvas, IText, Textbox, FabricImage, Rect, Circle, FabricText, classRegistry } from 'fabric';
import {
    BarChart3,
    Circle as CircleIcon,
    ArrowRight,
    ChevronDown,
    Image as ImageIcon,
    List,
    Minus,
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
    BadgeRussianRubleIcon,
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
const FONT_FAMILIES = [
    { value: 'Arial, sans-serif', label: 'Arial' },
    { value: 'Times New Roman, serif', label: 'Times New Roman' },
    { value: 'Georgia, serif', label: 'Georgia' },
    { value: 'Courier New, monospace', label: 'Courier New' },
    { value: 'Verdana, sans-serif', label: 'Verdana' }
];

// Når vinduet er smalere enn dette, kollapser sidepanelene automatisk.
const SIDEBAR_AUTO_COLLAPSE_BREAKPOINT = 1500;

type MediaKind = 'image' | 'video';

type SerializedVideoProps = {
    mediaType?: 'video';
    src?: string;
};

type GuideLine = {
    orientation: 'horizontal' | 'vertical';
    position: number;
};

type AlignmentPoint = {
    value: number;
    label: 'start' | 'center' | 'end';
};

const ALIGNMENT_TOLERANCE = 6;

const createVideoElement = (src: string) =>
    new Promise<HTMLVideoElement>((resolve, reject) => {
        const video = document.createElement('video');
        let settled = false;

        const cleanup = () => {
            video.removeEventListener('loadeddata', handleLoadedData);
            video.removeEventListener('error', handleError);
        };

        const finish = () => {
            if (settled) return;
            settled = true;
            cleanup();
            resolve(video);
        };

        const fail = () => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(new Error('Kunne ikke laste video'));
        };

        const handleLoadedData = () => finish();
        const handleError = () => fail();

        video.preload = 'auto';
        video.loop = true;
        video.muted = true;
        video.playsInline = true;
        video.crossOrigin = 'anonymous';
        video.addEventListener('loadeddata', handleLoadedData, { once: true });
        video.addEventListener('error', handleError, { once: true });
        video.src = src;
        video.load();
    });

// Utvid Fabric.Object for å inkludere mediaType
class FabricVideo extends FabricImage {
    static type = 'video';

    constructor(element: HTMLVideoElement, options: Record<string, unknown> = {}) {
        // Video skal rendres direkte fra elementet i stedet for et stillbilde-cache.
        super(element, {
            ...options,
            objectCaching: false,
        });
    }

    static async fromObject(
        { src, mediaType, ...object }: SerializedVideoProps & Record<string, any>,
    ) {
        const videoElement = await createVideoElement(src || '');
        return new this(videoElement, {
            ...object,
            src,
        });
    }
}

classRegistry.setClass(FabricVideo, 'video');

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
type ListStyleType = 'bullet' | 'dash' | 'arrow';
type FabricTextObject = (FabricText | IText | Textbox) & {
    listStyleType?: ListStyleType;
};
type FabricEditableTextObject = (IText | Textbox) & {
    listStyleType?: ListStyleType;
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

const PresentationEditor = (
{ presentation, onSavePresentation, isSaving, onSaveComplete, onDirtyChange }: PresentationEditorProps,
ref: ForwardedRef<PresentationEditorHandle>
) => {
    // Referanser og grunnstate for editoren.
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const fabricCanvasRef = useRef<Canvas | null>(null);
    const mediaUploadInputRef = useRef<HTMLInputElement | null>(null);
    const videoRenderFrameRef = useRef<number | null>(null);
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
    const [shapeHasFill, setShapeHasFill] = useState(true);
    const [hasSelectedShape, setHasSelectedShape] = useState(false);
    const [textColor, setTextColor] = useState<string>('#000000');
    const [hasSelectedText, setHasSelectedText] = useState(false);

    // Sidebar-tilstand: manuell kollaps + responsiv auto-kollaps.
    const [isLeftSidebarCollapsed, setIsLeftSidebarCollapsed] = useState(false);
    const [isRightSidebarCollapsed, setIsRightSidebarCollapsed] = useState(false);
    const [isAutoCollapsed, setIsAutoCollapsed] = useState(false);

    // Referanser/tilstand for responsiv skalering av canvas.
    const canvasViewportRef = useRef<HTMLDivElement | null>(null);
    const canvasScaleWrapperRef = useRef<HTMLDivElement | null>(null);
    const listMenuRef = useRef<HTMLDivElement | null>(null);
    const shapeMenuRef = useRef<HTMLDivElement | null>(null);
    const shapeColorPickerRef = useRef<HTMLDivElement | null>(null);
    const [canvasScale, setCanvasScale] = useState(1);
    const hasUnsavedChangesRef = useRef(false);
    const skipHistoryResetRef = useRef(false);
    const [presentationVariables, setPresentationVariables] = useState<PresentationVariable[]>([]);
    const [guideLines, setGuideLines] = useState<GuideLine[]>([]);
    const [fontFamily, setFontFamily] = useState('Arial, sans-serif');
    const [isTextBold, setIsTextBold] = useState(false);
    const [isTextItalic, setIsTextItalic] = useState(false);
    const [listStyleType, setListStyleType] = useState<ListStyleType>('bullet');
    const [isListMenuOpen, setIsListMenuOpen] = useState(false);
    const [isTextMenuOpen, setIsTextMenuOpen] = useState(false);
    const [isShapeMenuOpen, setIsShapeMenuOpen] = useState(false);
    const [isShapeColorPickerOpen, setIsShapeColorPickerOpen] = useState(false);
    const textMenuRef = useRef<HTMLDivElement | null>(null);

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

    const isShapeObject = (obj: any) => obj?.type === 'rect' || obj?.type === 'circle';
    const isTextObject = (obj: any) => obj?.type === 'i-text' || obj?.type === 'textbox' || obj?.type === 'text';
    const isVideoObject = (obj: any) => obj?.type === 'video';
    const isEditableTextObject = (obj: any): obj is FabricEditableTextObject => obj?.type === 'i-text' || obj?.type === 'textbox';
    const isBoldFontWeight = (weight: any) => weight === 'bold' || Number(weight) >= 700;
    const handleGuideReset = () => setGuideLines([]);

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

        if (selectedShape) {
            const hasFill = selectedShape.fill !== null && selectedShape.fill !== undefined && selectedShape.fill !== 'transparent';
            setShapeHasFill(hasFill);

            if (typeof selectedShape.fill === 'string' && selectedShape.fill !== 'transparent') {
                setShapeColor(selectedShape.fill);
            }
        }

        if (selectedText && typeof selectedText.fill === 'string') {
            setTextColor(selectedText.fill);
        }

        if (selectedText && typeof (selectedText as any).fontFamily === 'string') {
            setFontFamily((selectedText as any).fontFamily);
        }
        if (selectedText) {
            setIsTextBold(isBoldFontWeight((selectedText as any).fontWeight));
            setIsTextItalic((selectedText as any).fontStyle === 'italic');
        }
    };

    const getObjectAlignmentPoints = useCallback((obj: any): { x: AlignmentPoint[]; y: AlignmentPoint[] } => {
        const width = (obj.getScaledWidth?.() || obj.width || 0) / 2;
        const height = (obj.getScaledHeight?.() || obj.height || 0) / 2;
        const center = obj.getCenterPoint();

        return {
            x: [
                { label: 'start', value: center.x - width },
                { label: 'center', value: center.x },
                { label: 'end', value: center.x + width },
            ],
            y: [
                { label: 'start', value: center.y - height },
                { label: 'center', value: center.y },
                { label: 'end', value: center.y + height },
            ],
        };
    }, []);

    const nudgeObjectBy = useCallback((obj: any, deltaX = 0, deltaY = 0) => {
        if (typeof obj.left === 'number') {
            obj.left += deltaX;
        }
        if (typeof obj.top === 'number') {
            obj.top += deltaY;
        }
        obj.setCoords();
    }, []);

    const clearGuideLines = useCallback(() => {
        setGuideLines([]);
    }, []);

    const currentSlideIdRef = useRef<string | null>(null);
    useEffect(() => {
        currentSlideIdRef.current = slides[currentSlideIndex]?.id || null;
    }, [slides, currentSlideIndex]);

    const stopVideoRenderLoop = useCallback(() => {
        if (videoRenderFrameRef.current !== null) {
            cancelAnimationFrame(videoRenderFrameRef.current);
            videoRenderFrameRef.current = null;
        }
    }, []);

    const syncCanvasVideos = useCallback(() => {
        const canvas = fabricCanvasRef.current;
        if (!canvas) {
            stopVideoRenderLoop();
            return;
        }

        const videoObjects = canvas.getObjects().filter(isVideoObject) as FabricVideo[];
        if (!videoObjects.length) {
            stopVideoRenderLoop();
            return;
        }

        videoObjects.forEach((videoObject) => {
            const element = videoObject.getElement();
            if (!(element instanceof HTMLVideoElement)) return;

            // Muted autoplay gjør at videoene kan starte uten ekstra brukerklikk.
            element.loop = true;
            element.muted = true;
            element.playsInline = true;
            void element.play().catch(() => {});
        });

        const renderVideoFrame = () => {
            const activeCanvas = fabricCanvasRef.current;
            if (!activeCanvas) {
                stopVideoRenderLoop();
                return;
            }

            const hasActiveVideo = activeCanvas
                .getObjects()
                .filter(isVideoObject)
                .some((videoObject: any) => {
                    const element = videoObject.getElement?.();
                    return element instanceof HTMLVideoElement && !element.paused && !element.ended;
                });

            if (!hasActiveVideo) {
                stopVideoRenderLoop();
                return;
            }

            activeCanvas.requestRenderAll();
            videoRenderFrameRef.current = requestAnimationFrame(renderVideoFrame);
        };

        if (videoRenderFrameRef.current === null) {
            videoRenderFrameRef.current = requestAnimationFrame(renderVideoFrame);
        }
    }, [stopVideoRenderLoop]);

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

    // Samler tunge oppdateringer slik at de bare kjører når brukeren er ferdig med et fargevalg.
    const commitCanvasColorChange = () => {
        markDirty();
        pushHistorySnapshot(createCanvasSnapshot());

        const currentId = currentSlideIdRef.current;
        const preview = captureCanvasPreview();
        if (!currentId || !preview) return;

        setSlidePreviewImages((prev) => ({
            ...prev,
            [currentId]: preview,
        }));
    };

    // Lagrer bakgrunnsfargen til lysbildet etter at live-forhåndsvisningen er ferdig.
    const commitBackgroundColorChange = (color: string) => {

        commitCanvasColorChange();
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
    const applyCanvasSnapshot = useCallback(async (snapshot: CanvasSnapshot) => {
        if (!fabricCanvasRef.current || !snapshot) return;

        isApplyingCanvasStateRef.current = true;

        try {
            await fabricCanvasRef.current.loadFromJSON(snapshot.fabricData || null);
            // Fix text colors after loading from snapshot
            fabricCanvasRef.current.getObjects().forEach((obj: any) => {
                if (isTextObject(obj) && !obj.listStyleType) {
                    if (typeof obj.fill === 'string' && (obj.fill === '#6b7280' || obj.fill === 'rgb(107, 114, 128)')) {
                        obj.set({ fill: '#000000' });
                    }
                }
            });
            fabricCanvasRef.current.backgroundColor = snapshot.backgroundColor || '#ffffff';
            fabricCanvasRef.current.renderAll();
            syncCanvasVideos();
        } finally {
            isApplyingCanvasStateRef.current = false;
        }
    }, [syncCanvasVideos]);

    // Synkroniserer innkommende presentasjon fra parent til lokal editor-state.
    useEffect(() => {
        if (!presentation) {
            setPresentationId(null);
            setPresentationTitle('Uten navn');
            setSlides([defaultSlide()]);
            setPresentationVariables([]);
            setCurrentSlideIndex(0);
            setDirtyState(false);
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
        setDirtyState(false);
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
            stopVideoRenderLoop();
            if (fabricCanvasRef.current) {
                fabricCanvasRef.current.dispose();
                fabricCanvasRef.current = null;
            }
        };
    }, [stopVideoRenderLoop]);

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
        const shouldSkipHistoryReset = skipHistoryResetRef.current;
        skipHistoryResetRef.current = false;

        if (fabricCanvasRef.current && slides[currentSlideIndex]) {
            const currentSlide = slides[currentSlideIndex];

            const backgroundColor = currentSlide.backgroundColor || '#ffffff';
            clearGuideLines();

            isApplyingCanvasStateRef.current = true;

            if (currentSlide.fabricData) {
                fabricCanvasRef.current.loadFromJSON(currentSlide.fabricData).then(() => {
                    clampAllObjectsToCanvas();
                    fabricCanvasRef.current.backgroundColor = backgroundColor;
                    fabricCanvasRef.current.renderAll();
                    syncCanvasVideos();
                    isApplyingCanvasStateRef.current = false;

                    if (!shouldSkipHistoryReset) {
                        resetHistoryWithSnapshot(createCanvasSnapshot());
                    }
                });
            } else {
                fabricCanvasRef.current.clear();
                fabricCanvasRef.current.set({ backgroundColor });
                fabricCanvasRef.current.renderAll();
                stopVideoRenderLoop();
                isApplyingCanvasStateRef.current = false;

                if (!shouldSkipHistoryReset) {
                    resetHistoryWithSnapshot(createCanvasSnapshot());
                }
            }
        } else {
            if (!shouldSkipHistoryReset) {
                setUndoStack([]);
                setRedoStack([]);
            }
        }
    }, [currentSlideIndex, slides]);

    // Lyttere for endringer på lerretet (legge til, flytte eller fjerne objekter) for å bygge opp angre-historikken
    useEffect(() => {
        const canvas = fabricCanvasRef.current;
        if (!canvas) return;

        const handleObjectMoving = (event: any) => {
            const target = event.target;
            if (!target) return;

            const targetPoints = getObjectAlignmentPoints(target);
            const nextGuideLines: GuideLine[] = [];
            let deltaX = 0;
            let deltaY = 0;
            let bestXDistance = ALIGNMENT_TOLERANCE + 1;
            let bestYDistance = ALIGNMENT_TOLERANCE + 1;

            const xCandidates: AlignmentPoint[] = [
                { value: CANVAS_WIDTH / 2, label: 'center' as const },
            ];
            const yCandidates: AlignmentPoint[] = [
                { value: CANVAS_HEIGHT / 2, label: 'center' as const },
            ];

            canvas.getObjects().forEach((obj) => {
                if (obj === target) return;

                const points = getObjectAlignmentPoints(obj);
                xCandidates.push(...points.x);
                yCandidates.push(...points.y);
            });

            targetPoints.x.forEach((point) => {
                xCandidates.forEach((candidate) => {
                    if (point.label !== candidate.label) return;

                    const distance = Math.abs(point.value - candidate.value);
                    if (distance >= bestXDistance || distance > ALIGNMENT_TOLERANCE) return;

                    bestXDistance = distance;
                    deltaX = candidate.value - point.value;
                    nextGuideLines.push({
                        orientation: 'vertical',
                        position: candidate.value,
                    });
                });
            });

            targetPoints.y.forEach((point) => {
                yCandidates.forEach((candidate) => {
                    if (point.label !== candidate.label) return;

                    const distance = Math.abs(point.value - candidate.value);
                    if (distance >= bestYDistance || distance > ALIGNMENT_TOLERANCE) return;

                    bestYDistance = distance;
                    deltaY = candidate.value - point.value;
                    nextGuideLines.push({
                        orientation: 'horizontal',
                        position: candidate.value,
                    });
                });
            });

            setGuideLines(
                nextGuideLines.filter(
                    (line, index, lines) =>
                        lines.findIndex(
                            (candidate) =>
                                candidate.orientation === line.orientation &&
                                Math.abs(candidate.position - line.position) < 0.5
                        ) === index
                )
            );

            if (deltaX !== 0 || deltaY !== 0) {
                // En liten nudge gir snapping uten at flyttingen føles låst.
                nudgeObjectBy(target, deltaX, deltaY);
            }
        };

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
        };

        canvas.on('object:added', handleCanvasChangeWithPreview);
        canvas.on('object:modified', handleCanvasChangeWithPreview);
        canvas.on('object:removed', handleCanvasChangeWithPreview);
        canvas.on('text:changed', handleCanvasChangeWithPreview);
        canvas.on('selection:created', syncHasSelectedShape);
        canvas.on('selection:updated', syncHasSelectedShape);
        canvas.on('selection:cleared', handleGuideReset);
        canvas.on('selection:cleared', syncHasSelectedShape);

        syncHasSelectedShape();

        return () => {
            canvas.off('object:added', handleCanvasChangeWithPreview);
            canvas.off('object:modified', handleCanvasChangeWithPreview);
            canvas.off('object:removed', handleCanvasChangeWithPreview);
            canvas.off('text:changed', handleCanvasChangeWithPreview);
            canvas.off('selection:created', syncHasSelectedShape);
            canvas.off('selection:updated', syncHasSelectedShape);
            canvas.off('selection:cleared', handleGuideReset);
            canvas.off('selection:cleared', syncHasSelectedShape);
        };
    }, [clearGuideLines, getObjectAlignmentPoints, nudgeObjectBy, syncCanvasVideos]);

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
            if (event.key === 'Enter') {
                const canvas = fabricCanvasRef.current;
                if (!canvas) return;

                const activeObject = canvas.getActiveObject() as any;
                const activeListStyle =
                    activeObject?.listStyleType ||
                    (typeof activeObject?.text === 'string' ? getListStyleFromText(activeObject.text) : null);

                if (activeObject && activeObject.isEditing && isEditableTextObject(activeObject) && activeListStyle) {
                    const currentText = typeof activeObject.text === 'string' ? activeObject.text : '';
                    const selectionStart = typeof activeObject.selectionStart === 'number' ? activeObject.selectionStart : currentText.length;
                    const isOnListLine = isCursorOnListLine(currentText, selectionStart, activeListStyle as ListStyleType);

                    if (!isOnListLine) {
                        return;
                    }

                    event.preventDefault();

                    const marker = getListMarker(activeListStyle as ListStyleType);
                    const selectionEnd = typeof activeObject.selectionEnd === 'number' ? activeObject.selectionEnd : currentText.length;
                    const nextText = `${currentText.slice(0, selectionStart)}\n${marker} ${currentText.slice(selectionEnd)}`;
                    const nextCursorPosition = selectionStart + 1 + marker.length + 1;

                    activeObject.set('text', nextText);
                    if (typeof activeObject.setSelectionStart === 'function') {
                        activeObject.setSelectionStart(nextCursorPosition);
                    } else {
                        activeObject.selectionStart = nextCursorPosition;
                    }
                    if (typeof activeObject.setSelectionEnd === 'function') {
                        activeObject.setSelectionEnd(nextCursorPosition);
                    } else {
                        activeObject.selectionEnd = nextCursorPosition;
                    }

                    // Keep Fabric's hidden textarea in sync so the next typed character is
                    // inserted on the new bullet line (not on the previous line).
                    if (activeObject.hiddenTextarea) {
                        activeObject.hiddenTextarea.value = nextText;
                        activeObject.hiddenTextarea.selectionStart = nextCursorPosition;
                        activeObject.hiddenTextarea.selectionEnd = nextCursorPosition;
                        activeObject.hiddenTextarea.focus();
                    }

                    if (typeof activeObject._updateTextarea === 'function') {
                        activeObject._updateTextarea();
                    }

                    activeObject.setCoords();
                    canvas.requestRenderAll();

                    markDirty();
                    pushHistorySnapshot(createCanvasSnapshot());

                    const currentId = currentSlideIdRef.current;
                    if (currentId) {
                        const dataUrl = captureCanvasPreview();
                        if (dataUrl) {
                            setSlidePreviewImages((prev) => ({
                                ...prev,
                                [currentId]: dataUrl,
                            }));
                        }
                    }

                    return;
                }
            }

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
    const saveCurrentSlide = (persistToState = true) => {
        const newSlides = buildSlidesWithCurrentCanvasState();
        if (persistToState) setSlides(newSlides);
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
        
        const pos = getSafePosition(80, 150, 420, 80);
        const text = new Textbox('Klikk for å redigere', { // Click to edit
            left: pos.left,
            top: pos.top,
            width: 420,
            originX: 'left',
            originY: 'top',
            fontSize: 28,
            fill: textColor,
            fontFamily,
            fontWeight: isTextBold ? 'bold' : 'normal',
            fontStyle: isTextItalic ? 'italic' : 'normal',
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
            fontFamily,
            fontWeight: 'bold',
            fontStyle: isTextItalic ? 'italic' : 'normal',
            lineHeight: 1.16,
            templateText: 'Tittel',
        });
        
        fabricCanvasRef.current.add(text);
        fabricCanvasRef.current.setActiveObject(text);
        fabricCanvasRef.current.renderAll();
        text.enterEditing();
        text.selectAll();
    };
    const getListMarker = (styleType: ListStyleType) => {
        switch (styleType) {
            case 'dash':
                return '-';
            case 'arrow':
                return '->';
            case 'bullet':
            default:
                return '•';
        }
    };

    const getListStyleFromText = (text: string): ListStyleType | null => {
        const firstContentLine = text
            .split(/\r?\n/)
            .map((line) => line.trimStart())
            .find((line) => line.length > 0);

        if (!firstContentLine) return null;
        if (firstContentLine.startsWith('• ')) return 'bullet';
        if (firstContentLine.startsWith('-> ')) return 'arrow';
        if (firstContentLine.startsWith('- ')) return 'dash';
        return null;
    };

    const normalizeListText = (text: string, styleType: ListStyleType) => {
        const marker = getListMarker(styleType);

        return text
            .split(/\r?\n/)
            .map((line) => {
                const trimmedLine = line.trimStart();

                if (!trimmedLine) {
                    return `${marker} `;
                }

                if (trimmedLine.startsWith(`${marker} `)) {
                    return trimmedLine;
                }

                return `${marker} ${trimmedLine}`;
            })
            .join('\n');
    };

    const isCursorOnListLine = (text: string, cursorPosition: number, styleType: ListStyleType) => {
        const marker = getListMarker(styleType);
        const safeCursor = Math.max(0, Math.min(cursorPosition, text.length));
        const lineStart = text.lastIndexOf('\n', Math.max(0, safeCursor - 1)) + 1;
        const lineEndIndex = text.indexOf('\n', safeCursor);
        const lineEnd = lineEndIndex === -1 ? text.length : lineEndIndex;
        const currentLine = text.slice(lineStart, lineEnd).trimStart();

        return currentLine.startsWith(`${marker} `);
    };

    const addBulletList = (styleType: ListStyleType = listStyleType) => {
        if (!fabricCanvasRef.current) return;

        const pos = getSafePosition(80, 150, 420, 140);
        const marker = getListMarker(styleType);
        const text = new Textbox(`${marker} `, {
            left: pos.left,
            top: pos.top,
            width: 420,
            originX: 'left',
            originY: 'top',
            fontSize: 24,
            fill: '#000000',
            fontFamily: 'Arial',
            lineHeight: 1.35,
        });
        text.set('listStyleType', styleType);

        fabricCanvasRef.current.add(text);
        fabricCanvasRef.current.setActiveObject(text);
        fabricCanvasRef.current.renderAll();
        text.enterEditing();
        text.selectAll();
    };

 useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
        if (!isListMenuOpen) return;

        const target = event.target as Node | null;
        if (listMenuRef.current && target && !listMenuRef.current.contains(target)) {
            setIsListMenuOpen(false);
        }
    };

    const handleEscape = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
            setIsListMenuOpen(false);
        }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);

    return () => {
        document.removeEventListener('mousedown', handleOutsideClick);
        document.removeEventListener('keydown', handleEscape);
    };
}, [isListMenuOpen]);

useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
        const target = event.target as Node | null;

        if (isTextMenuOpen && textMenuRef.current && target && !textMenuRef.current.contains(target)) {
            setIsTextMenuOpen(false);
        }
    };

    const handleEscape = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
            setIsTextMenuOpen(false);
        }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);

    return () => {
        document.removeEventListener('mousedown', handleOutsideClick);
        document.removeEventListener('keydown', handleEscape);
    };
}, [isTextMenuOpen]);

// Holder menyene lukket når brukeren klikker utenfor eller avbryter med Escape.
useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
        const target = event.target as Node | null;

        if (isShapeMenuOpen && shapeMenuRef.current && target && !shapeMenuRef.current.contains(target)) {
            setIsShapeMenuOpen(false);
        }

        if (
            isShapeColorPickerOpen &&
            shapeColorPickerRef.current &&
            target &&
            !shapeColorPickerRef.current.contains(target)
        ) {
            setIsShapeColorPickerOpen(false);
            commitCanvasColorChange();
        }
    };

    const handleEscape = (event: KeyboardEvent) => {
        if (event.key !== 'Escape') return;

        if (isShapeMenuOpen) {
            setIsShapeMenuOpen(false);
        }

        if (isShapeColorPickerOpen) {
            setIsShapeColorPickerOpen(false);
            commitCanvasColorChange();
        }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);

    return () => {
        document.removeEventListener('mousedown', handleOutsideClick);
        document.removeEventListener('keydown', handleEscape);
    };
}, [isShapeMenuOpen, isShapeColorPickerOpen]);

    const addImageObject = async (source: string) => {
        if (!fabricCanvasRef.current) return;

        const img = await FabricImage.fromURL(source);
        img.scaleToWidth(400);
        const scaledHeight = (img.height || 0) * (img.scaleY || 1);
        const pos = getSafePosition(80, 150, 400, scaledHeight || 300);
        img.set({ left: pos.left, top: pos.top });
        fabricCanvasRef.current.add(img);
        fabricCanvasRef.current.setActiveObject(img);
        fabricCanvasRef.current.renderAll();
    };

    const addVideoObject = async (source: string) => {
        if (!fabricCanvasRef.current) return;

        const videoElement = await createVideoElement(source);
        const video = new FabricVideo(videoElement, {
            left: 80,
            top: 150,
        });
        video.scaleToWidth(420);
        const scaledHeight = (video.height || 0) * (video.scaleY || 1);
        const pos = getSafePosition(80, 150, 420, scaledHeight || 236);
        video.set({ left: pos.left, top: pos.top });
        fabricCanvasRef.current.add(video);
        fabricCanvasRef.current.setActiveObject(video);
        fabricCanvasRef.current.renderAll();
        syncCanvasVideos();
    };

    const handleMediaFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || !fabricCanvasRef.current) return;

        // Leser inn lokal fil som data-URL slik at media kan serialiseres i Fabric-JSON.
        const reader = new FileReader();
        reader.onload = async (loadEvent) => {
            const mediaSource = loadEvent.target?.result;
            if (!mediaSource || typeof mediaSource !== 'string') return;

            const mediaKind: MediaKind = file.type.startsWith('video/') ? 'video' : 'image';

            try {
                if (mediaKind === 'video') {
                    await addVideoObject(mediaSource);
                } else {
                    await addImageObject(mediaSource);
                }
            } catch (error) {
                console.error('Media upload failed:', error);
            }
        };

        reader.readAsDataURL(file);
        event.target.value = '';
    };

    const addImage = () => {
        mediaUploadInputRef.current?.click();
    };
    // Legger til en valgt form, rektangel eller sirkel
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
                    fill: shapeHasFill ? shapeColor : null,
                    stroke: shapeColor,
                    strokeWidth: 2,
                });
                break;
            case 'circle':
                shape = new Circle({
                    left: pos.left,
                    top: pos.top,
                    radius: 75,
                    fill: shapeHasFill ? shapeColor : null,
                    stroke: shapeColor,
                    strokeWidth: 2,
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

    // Oppdaterer valgte figurer direkte på canvas mens brukeren drar i fargevelgeren.
    const applySelectedShapeFillLive = (hasFill: boolean) => {
        if (!fabricCanvasRef.current) return;

        const activeObjects = fabricCanvasRef.current.getActiveObjects();
        if (!activeObjects.length) return;

        let changed = false;

        activeObjects.forEach((obj: any) => {
            if (obj.type === 'rect' || obj.type === 'circle') {
                obj.set({
                    fill: hasFill ? shapeColor : null,
                    stroke: shapeColor,
                    strokeWidth: 2,
                });
                changed = true;
            }
        });

        if (!changed) return;

        fabricCanvasRef.current.requestRenderAll();
    };

    // Oppdaterer valgte figurer direkte pÃ¥ canvas mens brukeren drar i fargevelgeren.
    const applySelectedShapeColorLive = (color: string) => {
        if (!fabricCanvasRef.current) return;

        const activeObjects = fabricCanvasRef.current.getActiveObjects();
        if (!activeObjects.length) return;

        let changed = false;

        activeObjects.forEach((obj: any) => {
            if (obj.type === 'rect' || obj.type === 'circle') {
                obj.set({
                    fill: shapeHasFill ? color : null,
                    stroke: color,
                    strokeWidth: 2,
                });
                changed = true;
            }
        });

        if (!changed) return;

        fabricCanvasRef.current.requestRenderAll();
    };

    // Oppdaterer valgt tekst direkte på canvas uten å lagre historikk for hver lille endring.
    const applySelectedTextColorLive = (color: string) => {
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

        fabricCanvasRef.current.requestRenderAll();
    };

    const applySelectedTextStylesLive = (styles: Record<string, unknown>) => {
        if (!fabricCanvasRef.current) return;

        const activeObjects = fabricCanvasRef.current.getActiveObjects();
        if (!activeObjects.length) return;

        let changed = false;

        activeObjects.forEach((obj: any) => {
            if (isTextObject(obj)) {
                obj.set(styles);
                obj.setCoords();
                changed = true;
            }
        });

        if (!changed) return;

        fabricCanvasRef.current.requestRenderAll();
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

    // Oppdaterer bakgrunnsfargen live, mens lagring og historikk skjer når valget bekreftes.
    const applyBackgroundColorLive = (color: string) => {
        if (!fabricCanvasRef.current) return;
        fabricCanvasRef.current.backgroundColor = color;
        fabricCanvasRef.current.requestRenderAll();
    };

    const changeBackgroundColor = (color: string) => {
        applyBackgroundColorLive(color);
        commitBackgroundColorChange(color);
    };
    const changeSelectedShapeColor = (color: string) => {
        applySelectedShapeColorLive(color);
    };
    const changeSelectedTextColor = (color: string) => {
        applySelectedTextColorLive(color);
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
    const slidesToSave = saveCurrentSlide(false)
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

            skipHistoryResetRef.current = true;
      setSlides(normalizedSlides)
      setCurrentSlideIndex((prev) => Math.min(prev, normalizedSlides.length - 1))
    }

    const savedAt = new Date();
    onSaveComplete?.(savedAt);
        setDirtyState(false);
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
                ref={mediaUploadInputRef}
                type="file"
                accept="image/*,video/*"
                className="hidden"
                onChange={handleMediaFileChange}
            />

            <div className={`${isLeftSidebarCollapsed ? 'w-14' : 'w-72.5'} flex h-full shrink-0 grow-0 basis-auto flex-col rounded-xl border border-border bg-card shadow-[2px_0_14px_rgba(0,0,0,0.05)] ring-1 ring-border/30 transition-all duration-200`}>
                <div className="flex items-center justify-between border-b border-border p-3">
                    {!isLeftSidebarCollapsed && <h3 className="text-lg text-foreground">Lysbilder</h3>}
                    <Button
                        onClick={() => setIsLeftSidebarCollapsed((prev) => !prev)}
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
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
                            className="order-1 flex items-center gap-1.5"
                            disabled={undoStack.length <= 1}
                        >
                            <Undo2 className="h-3.5 w-3.5" /> Angre
                        </Button>
                        <Button
                            onClick={handleRedo}
                            variant="secondary"
                            size="sm"
                            className="order-2 flex items-center gap-1.5"
                            disabled={!redoStack.length}
                        >
                            <Redo2 className="h-3.5 w-3.5" /> Gjør om
                        </Button>
                        <div ref={textMenuRef} className="relative order-3">
                            <Button
                                onClick={() => setIsTextMenuOpen((prev) => !prev)}
                                variant="outline"
                                size="sm"
                                className="flex items-center gap-1.5"
                                aria-haspopup="menu"
                                aria-expanded={isTextMenuOpen}
                            >
                                <Type className="h-3.5 w-3.5" />
                                Tekststil
                                <ChevronDown className="h-3.5 w-3.5" />
                            </Button>
                            {isTextMenuOpen && (
                                <div className="absolute left-0 top-full z-20 mt-2 min-w-44 overflow-hidden rounded-md border border-border bg-background p-1 shadow-lg">
                                    <button
                                        type="button"
                                        className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                                        onClick={() => {
                                            addTitle();
                                            setIsTextMenuOpen(false);
                                        }}
                                    >
                                        <TypeIcon className="h-4 w-4" />
                                        <span>Tittel</span>
                                    </button>
                                    <button
                                        type="button"
                                        className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                                        onClick={() => {
                                            addText();
                                            setIsTextMenuOpen(false);
                                        }}
                                    >
                                        <Type className="h-4 w-4" />
                                        <span>Tekst</span>
                                    </button>
                                </div>
                            )}
                        </div>

                        <div ref={listMenuRef} className="relative order-7">
                            <Button
                                onClick={() => setIsListMenuOpen((prev) => !prev)}
                                variant="outline"
                                size="sm"
                                className="flex items-center gap-1.5"
                                aria-haspopup="menu"
                                aria-expanded={isListMenuOpen}
                            >
                                <List className="h-3.5 w-3.5" />
                                <ChevronDown className="h-3.5 w-3.5" />
                            </Button>
                            {isListMenuOpen && (
                                <div className="absolute left-0 top-full z-20 mt-2 min-w-44 overflow-hidden rounded-md border border-border bg-background p-1 shadow-lg">
                                    <button
                                        type="button"
                                        className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                                        onClick={() => {
                                            setListStyleType('bullet');
                                            addBulletList('bullet');
                                            setIsListMenuOpen(false);
                                        }}
                                    >
                                        <List className="h-4 w-4" />
                                        <span>Punkt</span>
                                    </button>
                                    <button
                                        type="button"
                                        className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                                        onClick={() => {
                                            setListStyleType('dash');
                                            addBulletList('dash');
                                            setIsListMenuOpen(false);
                                        }}
                                    >
                                        <Minus className="h-4 w-4" />
                                        <span>Bindestrek</span>
                                    </button>
                                    <button
                                        type="button"
                                        className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                                        onClick={() => {
                                            setListStyleType('arrow');
                                            addBulletList('arrow');
                                            setIsListMenuOpen(false);
                                        }}
                                    >
                                        <ArrowRight className="h-4 w-4" />
                                        <span>Pil</span>
                                    </button>
                                </div>
                            )}
                        </div>
                        <div className="order-8 basis-full" />
                        <Button onClick={addImage} variant="outline" size="sm" className="order-9 flex items-center gap-1.5"><ImageIcon className="h-3.5 w-3.5" /> Media</Button>

                        <div ref={shapeMenuRef} className="relative order-10">
                            <Button
                                onClick={() => setIsShapeMenuOpen((prev) => !prev)}
                                variant="outline"
                                size="sm"
                                className="flex items-center gap-1.5"
                                aria-haspopup="menu"
                                aria-expanded={isShapeMenuOpen}
                            >
                                <Square className="h-3.5 w-3.5" /> Former
                                <ChevronDown className="h-3.5 w-3.5" />
                            </Button>
                            {isShapeMenuOpen && (
                                <div className="absolute left-0 top-full z-20 mt-2 min-w-44 overflow-hidden rounded-md border border-border bg-background p-1 shadow-lg">
                                    <button
                                        type="button"
                                        className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                                        onClick={() => {
                                            addShape('rectangle');
                                            setIsShapeMenuOpen(false);
                                        }}
                                    >
                                        <Square className="h-4 w-4" />
                                        <span>Rektangel</span>
                                    </button>
                                    <button
                                        type="button"
                                        className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                                        onClick={() => {
                                            addShape('circle');
                                            setIsShapeMenuOpen(false);
                                        }}
                                    >
                                        <CircleIcon className="h-4 w-4" />
                                        <span>Sirkel</span>
                                    </button>
                                </div>
                            )}
                        </div>
                        <Button onClick={deleteSelected} variant="destructive" size="sm" className="order-14 flex items-center gap-1.5"><Trash2 className="h-3.5 w-3.5" /> Slett</Button>
                        <div className="contents">
                            <div className="relative order-11">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="relative flex items-center gap-1.5"
                                >
                                    <Palette className="h-3.5 w-3.5" /> Bakgrunnsfarge
                                    <span
                                        className="h-4 w-4 rounded-sm border border-border"
                                        style={{ backgroundColor: slides[currentSlideIndex]?.backgroundColor || '#ffffff' }}
                                    />
                                </Button>
                                <input
                                    type="color"
                                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                                    value={slides[currentSlideIndex]?.backgroundColor || '#ffffff'}
                                    onInput={(e) => {
                                        applyBackgroundColorLive((e.target as HTMLInputElement).value);
                                    }}
                                    onChange={(e) => {
                                        const color = e.target.value;
                                        applyBackgroundColorLive(color);
                                        commitBackgroundColorChange(color);
                                    }}
                                />
                            </div>
                            <div ref={shapeColorPickerRef} className="relative order-12">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="flex items-center gap-1.5"
                                    disabled={!hasSelectedShape}
                                    onClick={() => setIsShapeColorPickerOpen((prev) => !prev)}
                                >
                                    <Square className="h-3.5 w-3.5" /> Figurfarge
                                    <span
                                        className="h-4 w-4 rounded-sm border border-border"
                                        style={{ backgroundColor: shapeColor }}
                                    />
                                </Button>
                                {isShapeColorPickerOpen && hasSelectedShape && (
                                    <div className="absolute left-0 top-full z-30 mt-2 min-w-52 rounded-md border border-border bg-background p-3 shadow-lg">
                                        <Label className="flex items-center gap-2 px-0 py-0 text-xs font-medium">
                                            <span>Farge</span>
                                            <input
                                                type="color"
                                                className="h-8 w-10 cursor-pointer rounded border-0 bg-transparent p-0"
                                                value={shapeColor}
                                                onInput={(e) => {
                                                    const color = (e.target as HTMLInputElement).value;
                                                    setShapeColor(color);
                                                    applySelectedShapeColorLive(color);
                                                }}
                                                onChange={(e) => {
                                                    const color = e.target.value;
                                                    setShapeColor(color);
                                                    applySelectedShapeColorLive(color);
                                                    commitCanvasColorChange();
                                                }}
                                            />
                                        </Label>
                                        <Label className="mt-3 flex items-center gap-2 px-0 py-0 text-xs font-medium">
                                            <input
                                                type="checkbox"
                                                className="h-4 w-4 cursor-pointer"
                                                checked={shapeHasFill}
                                                onChange={(e) => {
                                                    const nextHasFill = e.target.checked;
                                                    setShapeHasFill(nextHasFill);
                                                    applySelectedShapeFillLive(nextHasFill);
                                                    commitCanvasColorChange();
                                                }}
                                            />
                                            Fyll figur
                                        </Label>
                                    </div>
                                )}
                            </div>
                            <div className="relative order-13">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="relative flex items-center gap-1.5"
                                    disabled={!hasSelectedText}
                                >
                                    <Type className="h-3.5 w-3.5" /> Tekstfarge
                                    <span
                                        className="h-4 w-4 rounded-sm border border-border"
                                        style={{ backgroundColor: textColor }}
                                    />
                                </Button>
                                <input
                                    type="color"
                                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
                                    value={textColor}
                                    disabled={!hasSelectedText}
                                    onInput={(e) => {
                                        const color = (e.target as HTMLInputElement).value;
                                        setTextColor(color);
                                        applySelectedTextColorLive(color);
                                    }}
                                    onChange={(e) => {
                                        const color = e.target.value;
                                        setTextColor(color);
                                        applySelectedTextColorLive(color);
                                        commitCanvasColorChange();
                                    }}
                                />
                            </div>
                            <select
                                value={fontFamily}
                                className="order-4 h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground"
                                onChange={(e) => {
                                    const nextFontFamily = e.target.value;
                                    setFontFamily(nextFontFamily);
                                    if (hasSelectedText) {
                                        applySelectedTextStylesLive({ fontFamily: nextFontFamily });
                                        commitCanvasColorChange();
                                    }
                                }}
                            >
                                {FONT_FAMILIES.map((font) => (
                                    <option key={font.value} value={font.value}>
                                        {font.label}
                                    </option>
                                ))}
                            </select>
                            <Button
                                variant={isTextBold ? 'default' : 'outline'}
                                size="sm"
                                className="order-5 min-w-9 px-3 font-bold"
                                onClick={() => {
                                    const nextIsTextBold = !isTextBold;
                                    setIsTextBold(nextIsTextBold);
                                    if (hasSelectedText) {
                                        applySelectedTextStylesLive({ fontWeight: nextIsTextBold ? 'bold' : 'normal' });
                                        commitCanvasColorChange();
                                    }
                                }}
                            >
                                B
                            </Button>
                            <Button
                                variant={isTextItalic ? 'default' : 'outline'}
                                size="sm"
                                className="order-6 min-w-9 px-3 italic"
                                onClick={() => {
                                    const nextIsTextItalic = !isTextItalic;
                                    setIsTextItalic(nextIsTextItalic);
                                    if (hasSelectedText) {
                                        applySelectedTextStylesLive({ fontStyle: nextIsTextItalic ? 'italic' : 'normal' });
                                        commitCanvasColorChange();
                                    }
                                }}
                            >
                                I
                            </Button>
                        </div>
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
                            className="relative h-135 w-240 origin-center rounded-lg ring-1 ring-border/45 shadow-[0_6px_28px_rgba(0,0,0,0.05),0_1px_4px_rgba(0,0,0,0.04)] dark:ring-border/35 dark:shadow-[0_10px_36px_rgba(0,0,0,0.35)] [&_canvas]:rounded-lg"
                        >
                            <canvas ref={canvasRef} />
                            <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg">
                                {guideLines.map((line, index) => (
                                    <div
                                        key={`${line.orientation}-${line.position}-${index}`}
                                        className="absolute bg-blue-600/80"
                                        style={
                                            line.orientation === 'vertical'
                                                ? {
                                                    left: `${line.position}px`,
                                                    top: 0,
                                                    bottom: 0,
                                                    width: '1px',
                                                    borderLeft: '1px dashed rgba(37,99,235,0.95)',
                                                }
                                                : {
                                                    top: `${line.position}px`,
                                                    left: 0,
                                                    right: 0,
                                                    height: '1px',
                                                    borderTop: '1px dashed rgba(37,99,235,0.95)',
                                                }
                                        }
                                    />
                                ))}
                            </div>
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

                {!isRightSidebarCollapsed && <div className="flex-1 overflow-y-auto p-4">
                    <div className="mb-6">
                        <div className="flex items-center justify-between mb-3">
                            <h4 className="text-sm font-semibold">Variabler</h4>
                            <Button onClick={addVariable} size="sm" variant="outline" className="h-8 flex items-center justify-center gap-1.5">
                                <Plus className="h-3.5 w-3.5" /> Ny
                            </Button>
                        </div>
                        <p className="text-xs text-muted-foreground mb-3">
                            Bruk variabler i tekstbokser med <code className="rounded bg-muted px-1 py-0.5 font-mono">{'{{navn}}'}</code>
                        </p>
                        {presentationVariables.length === 0 ? (
                            <div className="text-center mt-4 border border-dashed border-border rounded-xl p-4">
                                <strong className="block text-foreground mb-1">Ingen variabler</strong>
                                <span className="text-sm text-muted-foreground">Legg til variabler for dynamisk innhold i presentasjonen.</span>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-2">
                                {presentationVariables.map((variable) => (
                                    <div key={variable.id} className="border border-border rounded-xl p-3 bg-background shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
                                        <div className="flex flex-col gap-2">
                                            <div className="flex items-center gap-2">
                                                <label className="w-12 shrink-0 text-xs text-muted-foreground">Navn</label>
                                                <input
                                                    type="text"
                                                    className="h-7 flex-1 min-w-0 rounded-md border border-border bg-input px-2 text-xs text-foreground"
                                                    value={variable.name}
                                                    onChange={(e) => updateVariable(variable.id, 'name', e.target.value)}
                                                    placeholder="variabelnavn"
                                                />
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <label className="w-12 shrink-0 text-xs text-muted-foreground">Verdi</label>
                                                <input
                                                    type="text"
                                                    className="h-7 flex-1 min-w-0 rounded-md border border-border bg-input px-2 text-xs text-foreground"
                                                    value={variable.value}
                                                    onChange={(e) => updateVariable(variable.id, 'value', e.target.value)}
                                                    placeholder="0"
                                                />
                                            </div>
                                        </div>
                                        <div className="flex justify-end pt-2 mt-1 border-t border-border">
                                            <Button
                                                variant="destructive"
                                                size="sm"
                                                onClick={() => deleteVariable(variable.id)}
                                                className="h-7 text-xs bg-destructive/15 text-destructive border border-destructive/30 hover:bg-destructive/25 hover:text-destructive hover:border-destructive/40 transition-colors"
                                            >
                                                Slett
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="border-t border-border pt-4 mb-6">
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
                    </div>
                }
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
};

export default forwardRef(PresentationEditor);

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