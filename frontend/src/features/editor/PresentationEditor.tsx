import react, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type ForwardedRef } from 'react';
import {
    Canvas,
    Control,
    IText,
    Textbox,
    FabricImage,
    Rect,
    Circle,
    FabricText,
    FabricObject,
    config,
    controlsUtils,
    type TransformActionHandler,
} from 'fabric';

const {
    changeWidth,
    changeHeight,
    changeObjectWidth,
    changeObjectHeight,
    wrapWithFireEvent,
    wrapWithFixedAnchor,
    rotationWithSnapping,
    rotationStyleHandler,
} = controlsUtils;
import {
    AlignCenter,
    AlignLeft,
    AlignRight,
    BarChart3,
    Circle as CircleIcon,
    ArrowRight,
    ChevronDown,
    Image as ImageIcon,
    Link2,
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
    Video,
    X,
    Play,
    MonitorPlay,
    Loader2,
    Pipette,
    Ban,
    Check,
} from 'lucide-react';
import SlideThumbnails from './SlideThumbnails';
import PollCreator from '@/features/polls/components/PollCreator';
import Question from './Question';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { createDefaultSlideFabricData } from '@/lib/fabricDefaults';
// hjelpefunksjoner for å normalisere og håndtere presentasjonsvariabler
import {
    normalizePresentationVariables,
    normalizeVariableName,
    resolveFabricDataWithVariables,
    type PresentationVariable,
} from '@/lib/utils';
import { parseYoutubeId, parseVimeoId } from '@/lib/embedUrls';
import { FabricEmbed, FabricVideo, createVideoElement } from '@/lib/fabricSlideObjects';
import SlideEmbedOverlays from './SlideEmbedOverlays';
import { cn } from '@/lib/utils';

const CANVAS_WIDTH = 960;
const CANVAS_HEIGHT = 540;
const CANVAS_PADDING = 30;

/**
 * Lerretet skaleres med CSS `transform: scale()` for å passe viewporteren. Uten ekstra
 * pikseltetthet blir tekst uklar fordi bitmap oppskaleres. Fabric bruker `devicePixelRatio`
 * på backing store; vi multipliserer med den faktiske skaleringen (avgrenset for ytelse).
 */
const MAX_EDITOR_CANVAS_PIXEL_RATIO = 3;

function getSafePosition(
    preferredLeft: number,
    preferredTop: number,
    elementWidth = 200,
    elementHeight = 150,
): { left: number; top: number } {
    const minPos = CANVAS_PADDING;
    const maxLeft = CANVAS_WIDTH - elementWidth - CANVAS_PADDING;
    const maxTop = CANVAS_HEIGHT - elementHeight - CANVAS_PADDING;

    return {
        left: Math.max(minPos, Math.min(preferredLeft, maxLeft)),
        top: Math.max(minPos, Math.min(preferredTop, maxTop)),
    };
}
/** Ekstra luft rundt den skalerte sliden i viewporter (ikke samme som lerrets-padding for objekter). */
const CANVAS_VIEWPORT_OUTSET = 8;
const FONT_FAMILIES = [
    { value: 'Arial, sans-serif', label: 'Arial' },
    { value: 'Times New Roman, serif', label: 'Times New Roman' },
    { value: 'Georgia, serif', label: 'Georgia' },
    { value: 'Courier New, monospace', label: 'Courier New' },
    { value: 'Verdana, sans-serif', label: 'Verdana' },
];

/** Forhåndsvalg for skriftstørrelse på lysbilde-tekst (Fabric `fontSize`). */
const FONT_SIZE_OPTIONS: readonly number[] = [12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 64, 72];

type TextAlignChoice = 'left' | 'center' | 'right';

/** 16 forhåndsvalg: hvit/svart i venstre kolonne + regnbuegradient i to rader. */
const TOOLBAR_COLOR_PRESETS: readonly string[] = [
    '#FFFFFF',
    '#FF2D2D', '#FF6A00', '#FFAA00', '#FFD400', '#E8FF1A', '#78D200', '#00B87A',
    '#000000',
    '#00C2CC', '#009BFF', '#1F6BFF', '#4B42FF', '#7D3CFF', '#B139FF', '#FF2FA8',
];

const PRESET_SWATCH_CLASS =
    'relative flex h-6 w-6 items-center justify-center rounded-full border-2 border-input transition-transform hover:scale-105 hover:ring-2 hover:ring-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const SELECTED_PRESET_SWATCH_CLASS =
    'ring-2 ring-blue-500 ring-offset-1 ring-offset-background shadow-[0_0_0_1px_rgba(59,130,246,0.55)]';

/** Gjør farge om til #rrggbb for native fargevelger. */
function toHexColorForInput(cssColor: string, fallback = '#000000'): string {
    if (typeof cssColor !== 'string') return fallback;
    const t = cssColor.trim();
    if (/^#[0-9A-Fa-f]{6}$/i.test(t)) return t.slice(0, 7);
    if (/^#[0-9A-Fa-f]{3}$/i.test(t) && t.length === 4) {
        const r = t[1]!;
        const g = t[2]!;
        const b = t[3]!;
        return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
    }
    const rgb = t.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (rgb) {
        const clamp = (x: string) => Math.min(255, Math.max(0, parseInt(x, 10)));
        const h = (n: number) => n.toString(16).padStart(2, '0');
        return `#${h(clamp(rgb[1]!))}${h(clamp(rgb[2]!))}${h(clamp(rgb[3]!))}`;
    }
    return fallback;
}

function isPresetSelected(selectedColor: string | undefined, presetHex: string, fallback = '#000000'): boolean {
    return toHexColorForInput(selectedColor ?? fallback, fallback).toLowerCase() === presetHex.toLowerCase();
}

// Velger kontrastfarge på haken for god synlighet mot både lyse og mørke preset-farger.
function getPresetCheckmarkClass(hex: string): string {
    const normalized = toHexColorForInput(hex, '#000000');
    const r = parseInt(normalized.slice(1, 3), 16);
    const g = parseInt(normalized.slice(3, 5), 16);
    const b = parseInt(normalized.slice(5, 7), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.62
        ? 'text-black drop-shadow-[0_1px_1px_rgba(255,255,255,0.7)]'
        : 'text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.85)]';
}

/** Sjakkmønster for «ingen fyll» / gjennomsiktig forhåndsvisning (Tailwind for lys/mørk modus). */
const CHECKERBOARD_SWATCH_CLASS =
    'bg-zinc-100 bg-[length:8px_8px] bg-[repeating-conic-gradient(rgb(212_212_216)_0%_25%,rgb(250_250_250)_0%_50%)] dark:bg-zinc-900 dark:bg-[repeating-conic-gradient(rgb(63_63_70)_0%_25%,rgb(24_24_27)_0%_50%)]';

const COLOR_MENU_MORE_BUTTON_CLASS =
    'mt-2 h-9 w-full gap-2 border border-primary/40 bg-primary/10 text-sm font-semibold text-primary shadow-sm hover:bg-primary/18 hover:text-primary dark:border-primary/45 dark:bg-primary/15 dark:hover:bg-primary/25';

// Når vinduet er smalere enn dette, kollapser sidepanelene automatisk.
const SIDEBAR_AUTO_COLLAPSE_BREAKPOINT = 1500;

/** Skriftstørrelser i flytende hurtigmeny for tekst. */
const CONTEXT_MENU_FONT_SIZES: readonly number[] = [18, 24, 28, 36, 48];

const CONTEXT_MENU_GAP_PX = 4;
const CONTEXT_MENU_EST_HEIGHT_PX = 34;
const CONTEXT_MENU_EST_WIDTH_TEXT_PX = 248;
const CONTEXT_MENU_EST_WIDTH_DELETE_PX = 40;

/** Skjermposisjon for hurtigmeny: top-venstre av objekt, over boksen (flipper under ved kant). */
function getEditorContextMenuAnchor(
    canvas: Canvas,
    target: FabricObject,
): { clientX: number; clientY: number; placement: 'above' | 'below' } | null {
    target.setCoords();
    const rect = target.getBoundingRect();
    const canvasEl = canvas.getElement();
    if (!canvasEl) return null;

    const canvasRect = canvasEl.getBoundingClientRect();
    const scaleX = canvasRect.width / canvas.getWidth();
    const scaleY = canvasRect.height / canvas.getHeight();
    const clientX = canvasRect.left + rect.left * scaleX;
    const topY = canvasRect.top + rect.top * scaleY;
    const bottomY = canvasRect.top + (rect.top + rect.height) * scaleY;

    const aboveTop = topY - CONTEXT_MENU_GAP_PX;
    const fitsAbove = aboveTop - CONTEXT_MENU_EST_HEIGHT_PX >= 8;
    if (fitsAbove) {
        return { clientX, clientY: aboveTop, placement: 'above' };
    }
    return { clientX, clientY: bottomY + CONTEXT_MENU_GAP_PX, placement: 'below' };
}

type MediaKind = 'image' | 'video';

type GuideLine = {
    orientation: 'horizontal' | 'vertical';
    position: number;
};

type AlignmentPoint = {
    value: number;
    label: 'start' | 'center' | 'end';
};

/** Pikselradius i lerrets koordinater: kant/senter må være nær en snap-linje. */
const SNAPPING_TOLERANCE = 11;

/** Slå sammen duplikat-kandidater fra flere objekter (samme linje ett steg unna). */
function dedupeSnapValues(values: number[], epsilon = 0.75): number[] {
    const sorted = [...values].filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
    const out: number[] = [];
    for (const v of sorted) {
        if (out.length === 0 || Math.abs(out[out.length - 1]! - v) > epsilon) {
            out.push(v);
        }
    }
    return out;
}

/** Finn beste forskyvning langs én akse og stilling for hjelpelinje. */
function computeAxisSnapAndGuide(
    targetPoints: AlignmentPoint[],
    candidateValues: number[],
    tolerance: number,
): { delta: number; guidePosition: number | null } {
    let bestDistance = tolerance + 1;
    let delta = 0;
    let guidePosition: number | null = null;

    for (const tp of targetPoints) {
        for (const cv of candidateValues) {
            const distance = Math.abs(tp.value - cv);
            if (distance > tolerance || distance >= bestDistance) continue;

            bestDistance = distance;
            delta = cv - tp.value;
            guidePosition = cv;
        }
    }

    return { delta, guidePosition };
}

/** Lodrette snap-kandidater: lysbildekant, marg, horisontalt senter (+ objektdeler legges til ved snap). */
function getSlideSnapXCandidates(): number[] {
    return dedupeSnapValues([
        0,
        CANVAS_PADDING,
        CANVAS_WIDTH / 2,
        CANVAS_WIDTH - CANVAS_PADDING,
        CANVAS_WIDTH,
    ]);
}

function getSlideSnapYCandidates(): number[] {
    return dedupeSnapValues([
        0,
        CANVAS_PADDING,
        CANVAS_HEIGHT / 2,
        CANVAS_HEIGHT - CANVAS_PADDING,
        CANVAS_HEIGHT,
    ]);
}

const TEXTBOX_EDITOR_PROPS = ['editorFixedHeight', 'listStyleType'] as const;

function ensureTextboxCustomProperties() {
    const existing = FabricObject.customProperties || [];
    const merged = [...existing];
    for (const key of TEXTBOX_EDITOR_PROPS) {
        if (!merged.includes(key)) merged.push(key);
    }
    FabricObject.customProperties = merged;
}

function isEditorTextType(type: string | undefined): boolean {
    return type === 'textbox' || type === 'i-text';
}

const changeObjectCornerDimensions: TransformActionHandler = (eventData, transform, x, y) => {
    const widthChanged = changeObjectWidth(eventData, transform, x, y);
    const heightChanged = changeObjectHeight(eventData, transform, x, y);
    return widthChanged || heightChanged;
};

const changeCornerBoxSize = wrapWithFireEvent(
    'resizing',
    wrapWithFixedAnchor(changeObjectCornerDimensions),
);

/** Fabric sin scaleCursorStyleHandler bruker vinkel senter→håndtak; på brede textboxer blir hjørner nesten horisontale. */
const RESIZE_CURSOR_MAP = ['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne', 'e'] as const;

function resizeCursorIndexFromControl(control: Control): number | null {
    const { x, y } = control;
    if (x < 0 && y < 0) return 5;
    if (x > 0 && y < 0) return 7;
    if (x > 0 && y > 0) return 1;
    if (x < 0 && y > 0) return 3;
    if (x !== 0 && y === 0) return x > 0 ? 0 : 4;
    if (x === 0 && y !== 0) return y > 0 ? 2 : 6;
    return null;
}

function editorResizeCursorStyleHandler(
    _eventData: unknown,
    control: Control,
    fabricObject: { angle?: number; getTotalAngle?: () => number },
): string {
    const base = resizeCursorIndexFromControl(control);
    if (base === null) return 'default';
    const rawAngle =
        (typeof fabricObject.getTotalAngle === 'function'
            ? fabricObject.getTotalAngle()
            : fabricObject.angle) ?? 0;
    const angleDeg = ((rawAngle % 360) + 360) % 360;
    const n = (base + Math.round(angleDeg / 45)) % 8;
    return `${RESIZE_CURSOR_MAP[n]}-resize`;
}

function createEditorTextControls() {
    const side = (x: number, y: number, handler: typeof changeWidth) =>
        new Control({
            x,
            y,
            actionHandler: handler,
            cursorStyleHandler: editorResizeCursorStyleHandler,
            actionName: 'resizing',
        });

    const corner = (x: number, y: number) =>
        new Control({
            x,
            y,
            actionHandler: changeCornerBoxSize,
            cursorStyleHandler: editorResizeCursorStyleHandler,
            actionName: 'resizing',
        });

    return {
        ml: side(-0.5, 0, changeWidth),
        mr: side(0.5, 0, changeWidth),
        mt: side(0, -0.5, changeHeight),
        mb: side(0, 0.5, changeHeight),
        tl: corner(-0.5, -0.5),
        tr: corner(0.5, -0.5),
        bl: corner(-0.5, 0.5),
        br: corner(0.5, 0.5),
        mtr: new Control({
            x: 0,
            y: -0.5,
            actionHandler: rotationWithSnapping,
            cursorStyleHandler: rotationStyleHandler,
            offsetY: -40,
            withConnection: true,
            actionName: 'rotate',
        }),
    };
}

function stabilizeTextboxEditorLayout(obj: any): void {
    if (!obj || !isEditorTextType(obj.type)) return;

    if (typeof obj.initDimensions === 'function') {
        obj.initDimensions();
    }

    const naturalH = typeof obj.height === 'number' ? obj.height : 0;
    const fixedH = obj.editorFixedHeight;
    if (typeof fixedH === 'number' && fixedH > naturalH + 0.5) {
        obj.set({ height: fixedH, scaleX: 1, scaleY: 1 });
    } else {
        obj.set({ scaleX: 1, scaleY: 1 });
        if (typeof fixedH !== 'number' || fixedH < naturalH) {
            obj.set('editorFixedHeight', naturalH);
        }
    }

    obj._clearCache?.();
    obj.setCoords?.();
}

function normalizeTextboxScaleFromCorners(obj: any): boolean {
    if (!obj || obj.type !== 'textbox') return false;
    const sx = typeof obj.scaleX === 'number' ? obj.scaleX : 1;
    const sy = typeof obj.scaleY === 'number' ? obj.scaleY : 1;
    if (Math.abs(sx - 1) < 0.001 && Math.abs(sy - 1) < 0.001) return false;

    const minW = typeof obj.minWidth === 'number' ? obj.minWidth : 20;
    const newWidth = Math.max(minW, Math.round((obj.width || 0) * sx));
    const scaledVisualH = Math.max(0, (obj.height || 0) * sy);

    obj.set({ width: newWidth, scaleX: 1, scaleY: 1 });
    if (typeof obj.initDimensions === 'function') {
        obj.initDimensions();
    }

    const naturalH = typeof obj.height === 'number' ? obj.height : 0;
    const nextFixedH = Math.max(naturalH, Math.round(scaledVisualH));
    obj.set('editorFixedHeight', nextFixedH);
    if (nextFixedH > naturalH + 0.5) {
        obj.set('height', nextFixedH);
    }

    obj._clearCache?.();
    obj.setCoords?.();
    return true;
}

function configureTextboxForEditor(obj: any): void {
    if (!obj || !isEditorTextType(obj.type)) return;

    obj.set({
        lockScalingX: false,
        lockScalingY: false,
        lockScalingFlip: true,
    });
    obj.controls = createEditorTextControls();
    stabilizeTextboxEditorLayout(obj);
}

function configureAllTextboxesOnCanvas(canvas: Canvas | null) {
    if (!canvas) return;
    canvas.getObjects().forEach((obj) => configureTextboxForEditor(obj));
}

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
   onStartLive?: () => void
   onStartLocalPresentation?: () => void
   isStartingLive?: boolean
};

const PresentationEditor = (
{ presentation, onSavePresentation, isSaving, onSaveComplete, onDirtyChange, onStartLive, onStartLocalPresentation, isStartingLive }: PresentationEditorProps,
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
    const [shapeFillColor, setShapeFillColor] = useState<string>('#667eea');
    const [shapeStrokeColor, setShapeStrokeColor] = useState<string>('#667eea');
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
    const backgroundColorMenuRef = useRef<HTMLDivElement | null>(null);
    const textColorMenuRef = useRef<HTMLDivElement | null>(null);
    const backgroundColorNativeInputRef = useRef<HTMLInputElement | null>(null);
    const textColorNativeInputRef = useRef<HTMLInputElement | null>(null);
    const shapeFillNativeInputRef = useRef<HTMLInputElement | null>(null);
    const shapeStrokeNativeInputRef = useRef<HTMLInputElement | null>(null);
    const [canvasScale, setCanvasScale] = useState(1);
    const canvasScaleRef = useRef(1);
    canvasScaleRef.current = canvasScale;
    /** Globale Fabric `config.devicePixelRatio` før denne editoren justerer den (gjenopprettes ved unmount). */
    const fabricDevicePixelRatioRestoreRef = useRef(config.devicePixelRatio);
    const hasUnsavedChangesRef = useRef(false);
    const skipHistoryResetRef = useRef(false);
    const [presentationVariables, setPresentationVariables] = useState<PresentationVariable[]>([]);
    const [guideLines, setGuideLines] = useState<GuideLine[]>([]);
    const [fontFamily, setFontFamily] = useState('Arial, sans-serif');
    const [textFontSize, setTextFontSize] = useState(28);
    const [textAlign, setTextAlign] = useState<TextAlignChoice>('left');
    const [isTextBold, setIsTextBold] = useState(false);
    const [isTextItalic, setIsTextItalic] = useState(false);
    const [listStyleType, setListStyleType] = useState<ListStyleType>('bullet');
    const [isListMenuOpen, setIsListMenuOpen] = useState(false);
    const [isTextMenuOpen, setIsTextMenuOpen] = useState(false);
    const [isFontFamilyMenuOpen, setIsFontFamilyMenuOpen] = useState(false);
    const [isFontSizeMenuOpen, setIsFontSizeMenuOpen] = useState(false);
    const [fontSizeInputValue, setFontSizeInputValue] = useState('28');
    const [isShapeMenuOpen, setIsShapeMenuOpen] = useState(false);
    const [isShapeColorPickerOpen, setIsShapeColorPickerOpen] = useState(false);
    const [isBackgroundColorMenuOpen, setIsBackgroundColorMenuOpen] = useState(false);
    const [isTextColorMenuOpen, setIsTextColorMenuOpen] = useState(false);
    const [isMediaMenuOpen, setIsMediaMenuOpen] = useState(false);
    // Meny for "Presenter"-knappen (live-lobby og "presenter nå"-valg).
    const [isPresentMenuOpen, setIsPresentMenuOpen] = useState(false);
    const [embedDialogKind, setEmbedDialogKind] = useState<'youtube' | 'vimeo' | null>(null);
    const [embedUrlInput, setEmbedUrlInput] = useState('');
    const [embedUrlError, setEmbedUrlError] = useState<string | null>(null);
    const [embedLayoutRevision, setEmbedLayoutRevision] = useState(0);
    const textMenuRef = useRef<HTMLDivElement | null>(null);
    const fontFamilyMenuRef = useRef<HTMLDivElement | null>(null);
    const fontSizeMenuRef = useRef<HTMLDivElement | null>(null);
    const mediaMenuRef = useRef<HTMLDivElement | null>(null);
    const presentMenuRef = useRef<HTMLDivElement | null>(null);
    const editorContextMenuRef = useRef<HTMLDivElement | null>(null);
    /** Flytende hurtigmeny på canvas (skjermkoordinater, forankret til objekt). */
    const [editorContextMenu, setEditorContextMenu] = useState<{
        clientX: number;
        clientY: number;
        placement: 'above' | 'below';
    } | null>(null);

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

        const style = window.getComputedStyle(container);
        const padX = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
        const padY = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
        const outset = CANVAS_VIEWPORT_OUTSET * 2;
        const availableWidth = Math.max(container.clientWidth - padX - outset, 0);
        const availableHeight = Math.max(container.clientHeight - padY - outset, 0);
        const nextScale = Math.min(availableWidth / CANVAS_WIDTH, availableHeight / CANVAS_HEIGHT);

        setCanvasScale(Number.isFinite(nextScale) && nextScale > 0 ? nextScale : 1);
    }, []);

    /** Synkroniserer Fabric-backing store med skjerm-DPR og CSS canvas-skalering for skarp tekst. */
    const applyEditorCanvasHiRes = useCallback(() => {
        const canvas = fabricCanvasRef.current;
        if (!canvas) return;

        const winDpr = typeof window !== 'undefined' && window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;
        const effective = Math.min(
            MAX_EDITOR_CANVAS_PIXEL_RATIO,
            Math.max(1, winDpr * canvasScaleRef.current),
        );

        config.configure({ devicePixelRatio: effective });
        canvas.setDimensions({ width: CANVAS_WIDTH, height: CANVAS_HEIGHT });
    }, []);

    const markDirty = () => {
        setDirtyState(true)
    };

    useEffect(() => {
        setFontSizeInputValue(String(textFontSize));
    }, [textFontSize]);

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
    const isContextMenuEligibleTarget = (obj: unknown): obj is FabricObject =>
        Boolean(obj && typeof obj === 'object' && (obj as { type?: string }).type !== 'activeSelection');
    const isEditableTextObject = (obj: any): obj is FabricEditableTextObject => obj?.type === 'i-text' || obj?.type === 'textbox';

    const openEditorContextMenuForTarget = useCallback((target: FabricObject) => {
        const canvas = fabricCanvasRef.current;
        if (!canvas) return;
        const anchor = getEditorContextMenuAnchor(canvas, target);
        if (anchor) setEditorContextMenu(anchor);
    }, []);

    const isVideoObject = (obj: any) => obj?.type === 'video';
    const isBoldFontWeight = (weight: any) => weight === 'bold' || Number(weight) >= 700;
    const handleGuideReset = () => setGuideLines([]);

    /** Markering av tegn mens man redigerer (ikke kun sammenkoblet musepeker). */
    const hasPartialTextSelection = (obj: any): boolean =>
        Boolean(
            obj &&
                isEditableTextObject(obj) &&
                obj.isEditing &&
                typeof obj.selectionStart === 'number' &&
                typeof obj.selectionEnd === 'number' &&
                obj.selectionEnd !== obj.selectionStart,
        );

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
            const hasFill =
                selectedShape.fill !== null &&
                selectedShape.fill !== undefined &&
                selectedShape.fill !== 'transparent';
            setShapeHasFill(hasFill);

            if (typeof selectedShape.fill === 'string' && selectedShape.fill !== 'transparent') {
                setShapeFillColor(selectedShape.fill);
            }
            if (typeof selectedShape.stroke === 'string') {
                setShapeStrokeColor(selectedShape.stroke);
            }
        }

        if (selectedText && typeof selectedText.fill === 'string') {
            // Oppdater mer detaljert i blokken under hvis ikke redigeringsfelt
            if (!(isEditableTextObject(selectedText) && selectedText.isEditing)) {
                setTextColor(selectedText.fill);
            }
        }

        if (selectedText && typeof (selectedText as any).fontFamily === 'string') {
            if (!(isEditableTextObject(selectedText) && selectedText.isEditing)) {
                setFontFamily((selectedText as any).fontFamily);
            }
        }
        if (selectedText) {
            const ta = (selectedText as any).textAlign as string | undefined;
            if (ta === 'left' || ta === 'center' || ta === 'right') {
                setTextAlign(ta);
            }

            let fillFrom = (selectedText as any).fill;
            let fontFamilyFrom = (selectedText as any).fontFamily;
            let fontSizeFrom = (selectedText as any).fontSize;
            let weightFrom = (selectedText as any).fontWeight;
            let styleFrom = (selectedText as any).fontStyle;

            if (
                isEditableTextObject(selectedText) &&
                selectedText.isEditing &&
                typeof selectedText.selectionStart === 'number' &&
                typeof selectedText.selectionEnd === 'number' &&
                typeof selectedText.getSelectionStyles === 'function'
            ) {
                const start = selectedText.selectionStart;
                const endIdx = Math.max(selectedText.selectionEnd, start + 1);
                const stylesArr = selectedText.getSelectionStyles(start, endIdx, true);
                const atCursor = stylesArr?.[0] || {};

                if (typeof atCursor.fill === 'string') {
                    fillFrom = atCursor.fill;
                }
                if (typeof atCursor.fontFamily === 'string') {
                    fontFamilyFrom = atCursor.fontFamily;
                }
                if (typeof atCursor.fontSize === 'number' && Number.isFinite(atCursor.fontSize)) {
                    fontSizeFrom = atCursor.fontSize;
                }
                if (atCursor.fontWeight !== undefined && atCursor.fontWeight !== '') {
                    weightFrom = atCursor.fontWeight;
                }
                if (atCursor.fontStyle !== undefined && atCursor.fontStyle !== '') {
                    styleFrom = atCursor.fontStyle;
                }
            }

            if (typeof fillFrom === 'string') setTextColor(fillFrom);
            if (typeof fontFamilyFrom === 'string') setFontFamily(fontFamilyFrom);
            if (typeof fontSizeFrom === 'number' && Number.isFinite(fontSizeFrom) && fontSizeFrom > 0) {
                setTextFontSize(Math.round(fontSizeFrom));
            }
            setIsTextBold(isBoldFontWeight(weightFrom));
            setIsTextItalic(styleFrom === 'italic');
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

    // Snapshot brukes for angre/gjør om uten å legge lerretet sammen direkte.
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
    const commitBackgroundColorChange = () => {
        commitCanvasColorChange();
        saveCurrentSlide(true);
    };

    //Resetter undo/redo historie stacks til et singelt snapshot, eller tømmer dem hvis snapshot er null
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
            configureAllTextboxesOnCanvas(fabricCanvasRef.current);
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
    }, [presentation?.id]);

    // Gjenopprett Fabric sin globale devicePixelRatio når editoren forlates (unngår å påvirke andre sider).
    useEffect(() => {
        return () => {
            config.configure({ devicePixelRatio: fabricDevicePixelRatioRestoreRef.current });
        };
    }, []);

    // Initialiserer selve Fabric.js-lerretet når komponenten monteres.
    useEffect(() => {
        if (canvasRef.current && !fabricCanvasRef.current) {
            ensureTextboxCustomProperties();
            fabricCanvasRef.current = new Canvas(canvasRef.current, {
                width: 960,
                height: 540,
                backgroundColor: '#ffffff',
                enableRetinaScaling: true,
                stopContextMenu: false,
            });

            fabricCanvasRef.current.set({ backgroundColor: '#ffffff' });
            fabricCanvasRef.current.renderAll();
            queueMicrotask(() => applyEditorCanvasHiRes());
        }

        return () => {
            stopVideoRenderLoop();
            if (fabricCanvasRef.current) {
                fabricCanvasRef.current.dispose();
                fabricCanvasRef.current = null;
            }
        };
    }, [stopVideoRenderLoop, applyEditorCanvasHiRes]);

    // Oppdater lerrets pikseltetthet når viewporter-skala eller skjerm-DPR-effekt endres.
    useEffect(() => {
        applyEditorCanvasHiRes();
    }, [canvasScale, applyEditorCanvasHiRes]);

    useEffect(() => {
        const onResize = () => applyEditorCanvasHiRes();
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, [applyEditorCanvasHiRes]);

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

    // Laster aktivt lysbilde inn i Fabric ved bytte av slide.
    useEffect(() => {
        const shouldSkipHistoryReset = skipHistoryResetRef.current;
        skipHistoryResetRef.current = false;

        if (fabricCanvasRef.current && slides[currentSlideIndex]) {
            const currentSlide = slides[currentSlideIndex];

            const backgroundColor = currentSlide.backgroundColor || '#ffffff';
            clearGuideLines();
            setEditorContextMenu(null);

            isApplyingCanvasStateRef.current = true;

            if (currentSlide.fabricData) {
                fabricCanvasRef.current.loadFromJSON(currentSlide.fabricData).then(() => {
                    fabricCanvasRef.current.backgroundColor = backgroundColor;
                    configureAllTextboxesOnCanvas(fabricCanvasRef.current);
                    fabricCanvasRef.current.renderAll();
                    syncCanvasVideos();
                    isApplyingCanvasStateRef.current = false;
                    setEmbedLayoutRevision((x) => x + 1);

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
                setEmbedLayoutRevision((x) => x + 1);

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
            setEditorContextMenu(null);

            const targetPoints = getObjectAlignmentPoints(target);
            const slideX = getSlideSnapXCandidates();
            const slideY = getSlideSnapYCandidates();

            const xCandidateValues: number[] = [...slideX];
            const yCandidateValues: number[] = [...slideY];

            const activeTargets = canvas.getActiveObjects();
            canvas.getObjects().forEach((obj) => {
                if (obj === target) return;
                if (activeTargets.includes(obj)) return;

                const points = getObjectAlignmentPoints(obj);
                points.x.forEach((p) => xCandidateValues.push(p.value));
                points.y.forEach((p) => yCandidateValues.push(p.value));
            });

            const uniqueX = dedupeSnapValues(xCandidateValues);
            const uniqueY = dedupeSnapValues(yCandidateValues);

            const snapX = computeAxisSnapAndGuide(targetPoints.x, uniqueX, SNAPPING_TOLERANCE);
            const snapY = computeAxisSnapAndGuide(targetPoints.y, uniqueY, SNAPPING_TOLERANCE);

            const nextGuideLines: GuideLine[] = [];
            if (snapX.guidePosition !== null) {
                nextGuideLines.push({ orientation: 'vertical', position: snapX.guidePosition });
            }
            if (snapY.guidePosition !== null) {
                nextGuideLines.push({ orientation: 'horizontal', position: snapY.guidePosition });
            }

            setGuideLines(
                nextGuideLines.filter(
                    (line, index, lines) =>
                        lines.findIndex(
                            (candidate) =>
                                candidate.orientation === line.orientation &&
                                Math.abs(candidate.position - line.position) < 0.5,
                        ) === index,
                ),
            );

            if (snapX.delta !== 0 || snapY.delta !== 0) {
                nudgeObjectBy(target, snapX.delta, snapY.delta);
            }
        };

        //Håndterer endringer i canvas: legger til en ny undo snaoshot og markerer editor som som "dirty", med mindre en state blir brukt
        const handleCanvasChange = () => {
            if (isApplyingCanvasStateRef.current) return;
            pushHistorySnapshot(createCanvasSnapshot());
            markDirty();
        };

        //Oppdaterer preview bildet for current slide, med mindre lerretet er i ferd med å laste inn en state
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

        //Håndterer en endring i canvas og oppdaterer slide preview bilde 
        const handleCanvasChangeWithPreview = () => {
            setGuideLines([]);
            handleCanvasChange();
            updatePreview();
        };

        /** Textbox: behold bokshøyde og fontSize ved resize. */
        const handleTextboxLayoutOnModified = (event: any) => {
            const obj = event?.target;
            if (!obj || obj.type === 'activeSelection' || !isEditorTextType(obj.type)) return;

            const baked = normalizeTextboxScaleFromCorners(obj);
            if (!baked && typeof obj.height === 'number') {
                obj.set('editorFixedHeight', obj.height);
            }
            stabilizeTextboxEditorLayout(obj);
            canvas.requestRenderAll();
        };

        const handleTextboxLayoutWhileScaling = (event: any) => {
            const obj = event?.target;
            if (!obj || !isEditorTextType(obj.type)) return;
            if (normalizeTextboxScaleFromCorners(obj)) {
                canvas.requestRenderAll();
            }
        };

        const handleTextboxContentChanged = () => {
            const active = canvas.getActiveObject() as { type?: string } | undefined;
            if (active && isEditorTextType(active.type)) {
                stabilizeTextboxEditorLayout(active);
                canvas.requestRenderAll();
            }
        };

        const handleTextSelectionAdjusted = () => {
            syncHasSelectedShape();
        };

        /** Egendefinert hurtig meny (Fabric stopContextMenu=false; vi blokkerer standard nettlesermeny sjøl). */
        const handleEditorContextMenuOpen = (opt: any) => {
            const domEvent = opt?.e as MouseEvent | undefined;
            if (!domEvent) return;
            domEvent.preventDefault();
            domEvent.stopPropagation();

            const t = opt?.target;
            if (!t || !isContextMenuEligibleTarget(t)) {
                setEditorContextMenu(null);
                return;
            }

            canvas.setActiveObject(t);
            canvas.requestRenderAll();
            syncHasSelectedShape();
            openEditorContextMenuForTarget(t);
        };

        const handleSelectionClearedContextMenu = () => {
            setEditorContextMenu(null);
        };

        const handleTextEditingEntered = () => {
            setEditorContextMenu(null);
        };

        const handleObjectScaling = () => {
            setEditorContextMenu(null);
        };

        canvas.on('object:moving', handleObjectMoving);
        canvas.on('object:scaling', handleTextboxLayoutWhileScaling);
        canvas.on('object:modified', handleTextboxLayoutOnModified);
        canvas.on('contextmenu', handleEditorContextMenuOpen);
        canvas.on('text:editing:entered', handleTextEditingEntered);
        canvas.on('object:scaling', handleObjectScaling);
        canvas.on('text:selection:changed', handleTextSelectionAdjusted);
        const handleObjectAdded = (event: { target?: { type?: string } }) => {
            if (isEditorTextType(event.target?.type)) {
                configureTextboxForEditor(event.target);
            }
            handleCanvasChangeWithPreview();
        };

        canvas.on('object:added', handleObjectAdded);
        canvas.on('object:modified', handleCanvasChangeWithPreview);
        canvas.on('object:removed', handleCanvasChangeWithPreview);
        canvas.on('text:changed', handleCanvasChangeWithPreview);
        canvas.on('text:changed', handleTextboxContentChanged);
        canvas.on('selection:created', syncHasSelectedShape);
        canvas.on('selection:updated', syncHasSelectedShape);
        canvas.on('selection:cleared', handleGuideReset);
        canvas.on('selection:cleared', handleSelectionClearedContextMenu);
        canvas.on('selection:cleared', syncHasSelectedShape);

        syncHasSelectedShape();

        return () => {
            canvas.off('object:moving', handleObjectMoving);
            canvas.off('object:scaling', handleTextboxLayoutWhileScaling);
            canvas.off('object:modified', handleTextboxLayoutOnModified);
            canvas.off('contextmenu', handleEditorContextMenuOpen);
            canvas.off('text:editing:entered', handleTextEditingEntered);
            canvas.off('object:scaling', handleObjectScaling);
            canvas.off('text:selection:changed', handleTextSelectionAdjusted);
            canvas.off('object:added', handleObjectAdded);
            canvas.off('object:modified', handleCanvasChangeWithPreview);
            canvas.off('object:removed', handleCanvasChangeWithPreview);
            canvas.off('text:changed', handleCanvasChangeWithPreview);
            canvas.off('text:changed', handleTextboxContentChanged);
            canvas.off('selection:created', syncHasSelectedShape);
            canvas.off('selection:updated', syncHasSelectedShape);
            canvas.off('selection:cleared', handleGuideReset);
            canvas.off('selection:cleared', handleSelectionClearedContextMenu);
            canvas.off('selection:cleared', syncHasSelectedShape);
        };
    }, [
        clearGuideLines,
        getObjectAlignmentPoints,
        nudgeObjectBy,
        openEditorContextMenuForTarget,
        syncCanvasVideos,
        syncHasSelectedShape,
    ]);

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

    //Bygger opp preview bilde for alle slides når slides eller presentasjonsvariabler endres
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
            /** `*` / `-` + mellomrom → punkt- / bindestrekliste (Markdown-lignende). */
            if (event.key === ' ' || event.code === 'Space') {
                const ae = document.activeElement;
                const canvas = fabricCanvasRef.current;
                if (!canvas) return;

                const activeObject = canvas.getActiveObject() as FabricEditableTextObject | undefined;

                const isFabricTextTyping =
                    activeObject?.isEditing &&
                    isEditableTextObject(activeObject) &&
                    activeObject.hiddenTextarea &&
                    ae === activeObject.hiddenTextarea;

                if (isFabricTextTyping) {
                    const currentText = typeof activeObject.text === 'string' ? activeObject.text : '';
                    const cur = typeof activeObject.selectionStart === 'number' ? activeObject.selectionStart : currentText.length;
                    const lineStart = currentText.lastIndexOf('\n', Math.max(0, cur - 1)) + 1;
                    const selectionEnd =
                        typeof activeObject.selectionEnd === 'number' ? activeObject.selectionEnd : cur;

                    const beforeSlice = currentText.slice(lineStart, cur);
                    const listShortcuts: Array<{ trigger: string; styleType: ListStyleType }> = [
                        { trigger: '*', styleType: 'bullet' },
                        { trigger: '-', styleType: 'dash' },
                    ];

                    for (const { trigger, styleType } of listShortcuts) {
                        if (beforeSlice !== trigger || selectionEnd !== cur) continue;

                        event.preventDefault();
                        event.stopPropagation();

                        const marker = getListMarker(styleType);
                        const nextText =
                            `${currentText.slice(0, lineStart)}${marker} ${currentText.slice(cur)}`;
                        const nextCursorPosition = lineStart + marker.length + 1;

                        activeObject.set('listStyleType', styleType);
                        syncActiveTextboxAfterEdit(activeObject, nextText, nextCursorPosition);
                        return;
                    }
                }
            }

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

    useEffect(() => {
        if (!editorContextMenu) return;
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setEditorContextMenu(null);
        };
        const handlePointer = (e: MouseEvent) => {
            if (editorContextMenuRef.current?.contains(e.target as Node)) return;
            setEditorContextMenu(null);
        };
        window.addEventListener('keydown', handleEscape);
        window.addEventListener('mousedown', handlePointer, true);
        return () => {
            window.removeEventListener('keydown', handleEscape);
            window.removeEventListener('mousedown', handlePointer, true);
        };
    }, [editorContextMenu]);
    
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

    //Lagrer gjeldende slide's state og bytter med en selected slide index
    const handleSlideSelect = (index: number) => {
        saveCurrentSlide();
        setCurrentSlideIndex(index);
    };

    // Fabric.js Tools. Legger til en ny teskstboks til canvaset på en sikker måte. Legger til nåværende tekst style
    const addText = () => {
        if (!fabricCanvasRef.current) return;
        
        const pos = getSafePosition(80, 150, 420, 80);
        const text = new Textbox('Klikk for å redigere', { 
            left: pos.left,
            top: pos.top,
            width: 420,
            originX: 'left',
            originY: 'top',
            fontSize: textFontSize,
            textAlign,
            fill: textColor,
            fontFamily,
            fontWeight: isTextBold ? 'bold' : 'normal',
            fontStyle: isTextItalic ? 'italic' : 'normal',
            lineHeight: 1.2,
            templateText: 'Klikk for å redigere',
        });
        configureTextboxForEditor(text);
        
        fabricCanvasRef.current.add(text);
        fabricCanvasRef.current.setActiveObject(text);
        fabricCanvasRef.current.renderAll();
        text.enterEditing();
        text.selectAll();
    };

    //Fabric.js Tools. Legger til et ny title object til canvaset på en sikker måte.
    const addTitle = () => {
        if (!fabricCanvasRef.current) return;
        
        const pos = getSafePosition(80, 60, 480, 72);
        const text = new Textbox('Tittel', {
            left: pos.left,
            top: pos.top,
            width: 480,
            originX: 'left',
            originY: 'top',
            fontSize: 48,
            textAlign,
            fill: textColor,
            fontFamily,
            fontWeight: 'bold',
            fontStyle: isTextItalic ? 'italic' : 'normal',
            lineHeight: 1.16,
            templateText: 'Tittel',
        });
        configureTextboxForEditor(text);

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

    //Bestemmer list style type(bullet, arrow, dash)
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

    //Sjekker om musepeker er på en linje som starter med list marker, for å bestemme om "Enter" skal lage en ny bullet eller bare en ny linje
    const isCursorOnListLine = (text: string, cursorPosition: number, styleType: ListStyleType) => {
        const marker = getListMarker(styleType);
        const safeCursor = Math.max(0, Math.min(cursorPosition, text.length));
        const lineStart = text.lastIndexOf('\n', Math.max(0, safeCursor - 1)) + 1;
        const lineEndIndex = text.indexOf('\n', safeCursor);
        const lineEnd = lineEndIndex === -1 ? text.length : lineEndIndex;
        const currentLine = text.slice(lineStart, lineEnd).trimStart();

        return currentLine.startsWith(`${marker} `);
    };

    const syncActiveTextboxAfterEdit = (
        activeObject: FabricEditableTextObject,
        nextText: string,
        nextCursorPosition: number,
    ) => {
        const canvas = fabricCanvasRef.current;
        if (!canvas) return;

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
    };

    /** Bruker liste i tekstboks brukeren skriver i nå. */
    const applyListStyleToEditingTextbox = (activeObject: FabricEditableTextObject, styleType: ListStyleType) => {
        const marker = getListMarker(styleType);
        const currentText = typeof activeObject.text === 'string' ? activeObject.text : '';
        const cur = typeof activeObject.selectionStart === 'number' ? activeObject.selectionStart : currentText.length;

        const nextText =
            currentText.trim().length > 0 ? normalizeListText(currentText, styleType) : `${marker} `;

        const lineStart = nextText.lastIndexOf('\n', Math.max(0, cur - 1)) + 1;
        const linePrefix = nextText.slice(lineStart);
        const nextCursorPosition = linePrefix.startsWith(`${marker} `)
            ? lineStart + marker.length + 1
            : Math.min(cur, nextText.length);

        activeObject.set('listStyleType', styleType);
        syncActiveTextboxAfterEdit(activeObject, nextText, nextCursorPosition);
    };

    /** Ny liste-boks når brukeren ikke redigerer tekst allerede. */
    const createNewListTextbox = (styleType: ListStyleType) => {
        if (!fabricCanvasRef.current) return;

        const pos = getSafePosition(80, 150, 420, 140);
        const marker = getListMarker(styleType);
        const text = new Textbox(`${marker} `, {
            left: pos.left,
            top: pos.top,
            width: 420,
            originX: 'left',
            originY: 'top',
            fontSize: textFontSize,
            textAlign,
            fill: textColor,
            fontFamily,
            lineHeight: 1.35,
        });
        text.set('listStyleType', styleType);
        configureTextboxForEditor(text);

        fabricCanvasRef.current.add(text);
        fabricCanvasRef.current.setActiveObject(text);
        fabricCanvasRef.current.renderAll();
        text.enterEditing();
        text.selectAll();
    };

    const applyListStyle = (styleType: ListStyleType) => {
        setListStyleType(styleType);
        const canvas = fabricCanvasRef.current;
        if (!canvas) return;

        const activeObject = canvas.getActiveObject();
        if (activeObject && isEditableTextObject(activeObject) && activeObject.isEditing) {
            applyListStyleToEditingTextbox(activeObject, styleType);
            return;
        }

        createNewListTextbox(styleType);
    };

    //Håndterer lukking av list style meny når brukeren klikker utenfor eller trykker esc
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

// Lukker de nye farge-menyene ved klikk utenfor eller Escape, slik at de oppfører seg likt som øvrige verktøymenyer.
useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
        const target = event.target as Node | null;

        if (isTextMenuOpen && textMenuRef.current && target && !textMenuRef.current.contains(target)) {
            setIsTextMenuOpen(false);
        }
        if (isFontFamilyMenuOpen && fontFamilyMenuRef.current && target && !fontFamilyMenuRef.current.contains(target)) {
            setIsFontFamilyMenuOpen(false);
        }
        if (isFontSizeMenuOpen && fontSizeMenuRef.current && target && !fontSizeMenuRef.current.contains(target)) {
            setIsFontSizeMenuOpen(false);
        }
    };

    const handleEscape = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
            setIsTextMenuOpen(false);
            setIsFontFamilyMenuOpen(false);
            setIsFontSizeMenuOpen(false);
        }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);

    return () => {
        document.removeEventListener('mousedown', handleOutsideClick);
        document.removeEventListener('keydown', handleEscape);
    };
}, [isTextMenuOpen, isFontFamilyMenuOpen, isFontSizeMenuOpen]);

useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
        const target = event.target as Node | null;

        if (
            isBackgroundColorMenuOpen &&
            backgroundColorMenuRef.current &&
            target &&
            !backgroundColorMenuRef.current.contains(target)
        ) {
            setIsBackgroundColorMenuOpen(false);
        }

        if (isTextColorMenuOpen && textColorMenuRef.current && target && !textColorMenuRef.current.contains(target)) {
            setIsTextColorMenuOpen(false);
        }
    };

    const handleEscape = (event: KeyboardEvent) => {
        if (event.key !== 'Escape') return;
        if (isBackgroundColorMenuOpen) {
            setIsBackgroundColorMenuOpen(false);
        }
        if (isTextColorMenuOpen) {
            setIsTextColorMenuOpen(false);
        }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);

    return () => {
        document.removeEventListener('mousedown', handleOutsideClick);
        document.removeEventListener('keydown', handleEscape);
    };
}, [isBackgroundColorMenuOpen, isTextColorMenuOpen]);

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

useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
        const target = event.target as Node | null;

        if (isMediaMenuOpen && mediaMenuRef.current && target && !mediaMenuRef.current.contains(target)) {
            setIsMediaMenuOpen(false);
        }
    };

    const handleEscape = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
            setIsMediaMenuOpen(false);
        }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);

    return () => {
        document.removeEventListener('mousedown', handleOutsideClick);
        document.removeEventListener('keydown', handleEscape);
    };
}, [isMediaMenuOpen]);

useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
        const target = event.target as Node | null;
        if (isPresentMenuOpen && presentMenuRef.current && target && !presentMenuRef.current.contains(target)) {
            setIsPresentMenuOpen(false);
        }
    };
    const handleEscape = (event: KeyboardEvent) => {
        if (event.key === 'Escape') setIsPresentMenuOpen(false);
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
        document.removeEventListener('mousedown', handleOutsideClick);
        document.removeEventListener('keydown', handleEscape);
    };
}, [isPresentMenuOpen]);

useEffect(() => {
    if (!embedDialogKind) return;

    const handleEscape = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
            setEmbedDialogKind(null);
            setEmbedUrlInput('');
            setEmbedUrlError(null);
        }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
}, [embedDialogKind]);

    const runPresentMenuAction = (action?: () => void) => {
        setIsPresentMenuOpen(false);
        action?.();
    };

    const addImageObject = useCallback(async (source: string) => {
        if (!fabricCanvasRef.current) return;

        const img = await FabricImage.fromURL(source);
        img.scaleToWidth(400);
        const scaledHeight = (img.height || 0) * (img.scaleY || 1);
        const pos = getSafePosition(80, 150, 400, scaledHeight || 300);
        img.set({ left: pos.left, top: pos.top });
        fabricCanvasRef.current.add(img);
        fabricCanvasRef.current.setActiveObject(img);
        fabricCanvasRef.current.renderAll();
    }, []);

    //Legger til video til canvas i en trygg posisjon. Setter video object som aktiv og starter video
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

    const addEmbedObject = (provider: 'youtube' | 'vimeo', id: string) => {
        if (!fabricCanvasRef.current) return;

        const width = 480;
        const height = 270;
        const pos = getSafePosition(80, 150, width, height);
        const embed = new FabricEmbed({
            left: pos.left,
            top: pos.top,
            width,
            height,
            embedProvider: provider,
            embedId: id,
            fill: 'rgba(15, 23, 42, 0.22)',
            stroke: '#64748b',
            strokeWidth: 2,
            rx: 6,
            ry: 6,
        });

        fabricCanvasRef.current.add(embed);
        fabricCanvasRef.current.setActiveObject(embed);
        fabricCanvasRef.current.renderAll();
        markDirty();
        setEmbedLayoutRevision((x) => x + 1);
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

    /** Lim inn bilder med Ctrl+V når fokus ikke er i et skjemafelt (unngår å kapre tekstlimaling i input/tekstfelt). */
    useEffect(() => {
        const isSkippableFocus = (element: Element | null) => {
            if (!element || !(element instanceof HTMLElement)) return false;
            if (element.closest('[data-skip-slide-clipboard-image]')) return true;
            if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
                return true;
            }
            if (element.isContentEditable) return true;
            if (element.closest('[contenteditable="true"]')) return true;
            return false;
        };

        const handlePaste = (event: ClipboardEvent) => {
            if (!fabricCanvasRef.current) return;
            if (isSkippableFocus(document.activeElement)) return;

            const items = event.clipboardData?.items;
            if (!items?.length) return;

            let imageFile: File | null = null;
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (item.kind === 'file' && typeof item.type === 'string' && item.type.startsWith('image/')) {
                    imageFile = item.getAsFile();
                    if (imageFile) break;
                }
            }
            if (!imageFile) return;

            event.preventDefault();
            event.stopPropagation();

            const reader = new FileReader();
            reader.onload = async (loadEvent) => {
                const dataUrl = loadEvent.target?.result;
                if (typeof dataUrl !== 'string') return;
                try {
                    await addImageObject(dataUrl);
                } catch (error) {
                    console.error('Paste image onto slide failed:', error);
                }
            };
            reader.readAsDataURL(imageFile);
        };

        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
    }, [addImageObject]);

    const openLocalMediaFilePicker = () => {
        setIsMediaMenuOpen(false);
        mediaUploadInputRef.current?.click();
    };

    const closeEmbedDialog = () => {
        setEmbedDialogKind(null);
        setEmbedUrlInput('');
        setEmbedUrlError(null);
    };

    const commitEmbedFromDialog = () => {
        if (!embedDialogKind) return;

        const id =
            embedDialogKind === 'youtube' ? parseYoutubeId(embedUrlInput) : parseVimeoId(embedUrlInput);

        if (!id) {
            setEmbedUrlError(
                embedDialogKind === 'youtube'
                    ? 'Fant ingen gyldig YouTube-video-ID. Lim inn lenke eller 11-tegns ID.'
                    : 'Fant ingen gyldig Vimeo-video-ID. Lim inn lenke eller numerisk ID.',
            );
            return;
        }

        addEmbedObject(embedDialogKind, id);
        closeEmbedDialog();
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
                    fill: shapeHasFill ? shapeFillColor : null,
                    stroke: shapeStrokeColor,
                    strokeWidth: 2,
                });
                break;
            case 'circle':
                shape = new Circle({
                    left: pos.left,
                    top: pos.top,
                    radius: 75,
                    fill: shapeHasFill ? shapeFillColor : null,
                    stroke: shapeStrokeColor,
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

    // Oppdaterer fyllfarge i sanntid uten å skrive historikk før brukeren bekrefter valg.
    const applySelectedShapeFillColorLive = (fillHex: string) => {
        if (!fabricCanvasRef.current) return;

        const activeObjects = fabricCanvasRef.current.getActiveObjects();
        if (!activeObjects.length) return;

        let changed = false;

        activeObjects.forEach((obj: any) => {
            if (obj.type === 'rect' || obj.type === 'circle') {
                obj.set({
                    fill: fillHex,
                    stroke: shapeStrokeColor,
                    strokeWidth: 2,
                });
                changed = true;
            }
        });

        if (!changed) return;

        fabricCanvasRef.current.requestRenderAll();
    };

    // Holder konturfargen separat fra fyll, slik at begge kan justeres uavhengig.
    const applySelectedShapeStrokeColorLive = (strokeHex: string) => {
        if (!fabricCanvasRef.current) return;

        const activeObjects = fabricCanvasRef.current.getActiveObjects();
        if (!activeObjects.length) return;

        let changed = false;

        activeObjects.forEach((obj: any) => {
            if (obj.type === 'rect' || obj.type === 'circle') {
                obj.set({
                    fill: shapeHasFill ? shapeFillColor : null,
                    stroke: strokeHex,
                    strokeWidth: 2,
                });
                changed = true;
            }
        });

        if (!changed) return;

        fabricCanvasRef.current.requestRenderAll();
    };

    // Setter valgt figur til transparent fyll, men beholder synlig kontur.
    const applySelectedShapeNoFillLive = () => {
        if (!fabricCanvasRef.current) return;

        const activeObjects = fabricCanvasRef.current.getActiveObjects();
        if (!activeObjects.length) return;

        let changed = false;

        activeObjects.forEach((obj: any) => {
            if (obj.type === 'rect' || obj.type === 'circle') {
                obj.set({
                    fill: null,
                    stroke: shapeStrokeColor,
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
            if (!isTextObject(obj)) return;

            if (hasPartialTextSelection(obj)) {
                obj.setSelectionStyles({ fill: color }, obj.selectionStart, obj.selectionEnd);
                typeof obj.initDimensions === 'function' && obj.initDimensions();
                changed = true;
                return;
            }

            obj.set('fill', color);
            changed = true;
        });

        if (!changed) return;

        fabricCanvasRef.current.requestRenderAll();
    };

    // Oppdaterer stiler på gjeldende tekst­markering eller hele tekst­objektet (ikke hele boksens innhold ved delvis utvalg).
    const applySelectedTextStylesLive = (styles: Record<string, unknown>) => {
        if (!fabricCanvasRef.current) return;

        const activeObjects = fabricCanvasRef.current.getActiveObjects();
        if (!activeObjects.length) return;

        const textAlignRaw = styles.textAlign as TextAlignChoice | undefined;
        const inlineKeys = ['fontWeight', 'fontStyle', 'fontSize', 'fontFamily', 'underline', 'linethrough', 'fill'] as const;

        let changed = false;

        activeObjects.forEach((obj: any) => {
            if (!isTextObject(obj)) return;

            if (typeof textAlignRaw === 'string' && (textAlignRaw === 'left' || textAlignRaw === 'center' || textAlignRaw === 'right')) {
                obj.set({ textAlign: textAlignRaw });
                changed = true;
            }

            const inlinePatch: Record<string, unknown> = {};
            for (const key of inlineKeys) {
                if (key in styles) {
                    inlinePatch[key] = styles[key];
                }
            }

            if (Object.keys(inlinePatch).length === 0) {
                typeof obj.initDimensions === 'function' && obj.initDimensions();
                obj.setCoords();
                return;
            }

            if (hasPartialTextSelection(obj)) {
                obj.setSelectionStyles(inlinePatch, obj.selectionStart, obj.selectionEnd);
                typeof obj.initDimensions === 'function' && obj.initDimensions();
                changed = true;
            } else {
                obj.set(inlinePatch);
                obj.setCoords();
                changed = true;
            }
        });

        if (!changed) return;

        fabricCanvasRef.current.requestRenderAll();
    };

    const commitFontSizeFromInput = () => {
        const parsed = parseInt(fontSizeInputValue.replace(/px$/i, '').trim(), 10);
        if (!Number.isFinite(parsed) || parsed < 8 || parsed > 400) {
            setFontSizeInputValue(String(textFontSize));
            return;
        }
        const rounded = Math.round(parsed);
        setTextFontSize(rounded);
        setFontSizeInputValue(String(rounded));
        if (hasSelectedText) {
            applySelectedTextStylesLive({ fontSize: rounded });
            commitCanvasColorChange();
        }
    };

    //Fjerner alle nåværende valgte objekter fra canvas og clearer selection
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
        commitBackgroundColorChange();
    };
    const changeSelectedTextColor = (color: string) => {
        applySelectedTextColorLive(color);
    };

    //Reverterer canvas til den forrige state i undo stacken, og oppdaterer slide preview
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

    //Tar tilbake en undo handling ved å bruke redo stacken, og oppdaterer slide preview 
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

    
    //Markere presentasjonen som lagret, og oppdatere dirty state og siste lagret tidspunkt
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

    //Oppdaterer arrayet for spørsmål i den nåværende sliden, ved å bruke en updater funksjon. Markerer editor som dirty og oppdaterer slide state 
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

    //Fjerner polls fra den spesifikke indeksen fra den nåværende sliden
    const handleDeletePoll = (index: number) => {
        updateCurrentSlidePolls((currentPolls) => currentPolls.filter((_, pollIndex) => pollIndex !== index));
    };

    // Lagrer eller oppdaterer et spørsmål på gjeldende lysbilde ved å bruke en hjelpefunksjon for normalisering og en updater-funksjon for stateoppdatering
    const handleSaveQuestion = (questionData: unknown) => {
        const normalizedQuestion = normalizeQuestion(
            questionData,
            editingQuestionIndex !== null ? editingQuestionIndex : 0
        );

        //Legger til et nytt spørsmål eller oppdater den eksisterende spørsmålet i current slide 
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

    //Fjerner et spørmsmål på den spesifiserte indeksen fra current slide
    const handleDeleteQuestion = (index: number) => {
        updateCurrentSlideQuestions((currentQuestions) => currentQuestions.filter((_, questionIndex) => questionIndex !== index));
    };

    //Bekfrefter og sletter den selekterte poll eller spørsmål
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

    //Reorder slidene ved å flytte en slide fra en indeks til en annen, og oppdaterer slide state
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


    let contextMenuFabricTarget: unknown = null;
    if (fabricCanvasRef.current) {
        contextMenuFabricTarget = fabricCanvasRef.current.getActiveObject();
    }
    const contextMenuTargetIsText = Boolean(contextMenuFabricTarget && isTextObject(contextMenuFabricTarget));
    const contextMenuShowDelete = Boolean(contextMenuFabricTarget);

    const contextMenuStyle = (() => {
        if (!editorContextMenu) return null;
        const estWidth = contextMenuTargetIsText
            ? CONTEXT_MENU_EST_WIDTH_TEXT_PX
            : CONTEXT_MENU_EST_WIDTH_DELETE_PX;
        const maxLeft =
            typeof window !== 'undefined' ? Math.max(8, window.innerWidth - estWidth - 8) : editorContextMenu.clientX;
        const left = Math.min(Math.max(editorContextMenu.clientX, 8), maxLeft);
        const transform =
            editorContextMenu.placement === 'above'
                ? 'translateY(-100%)'
                : undefined;
        return { left, top: editorContextMenu.clientY, transform };
    })();

    return (
        <div className="flex min-h-0 flex-1 items-stretch gap-2 overflow-hidden bg-background p-2">
            <Input
                ref={mediaUploadInputRef}
                type="file"
                accept="image/*,video/*"
                className="hidden"
                onChange={handleMediaFileChange}
            />

            {embedDialogKind && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="embed-dialog-title"
                    onClick={() => closeEmbedDialog()}
                >
                    <div
                        className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-lg"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="mb-3 flex items-start justify-between gap-3">
                            <h2 id="embed-dialog-title" className="text-base font-semibold text-foreground">
                                {embedDialogKind === 'youtube' ? 'YouTube' : 'Vimeo'}
                            </h2>
                            <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => closeEmbedDialog()} aria-label="Lukk">
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                        <p className="mb-2 text-sm text-muted-foreground">
                            {embedDialogKind === 'youtube'
                                ? 'Lim inn YouTube-lenke'
                                : 'Lim inn Vimeo-lenke'}
                        </p>
                        <Input
                            autoFocus
                            data-skip-slide-clipboard-image
                            value={embedUrlInput}
                            onChange={(e) => {
                                setEmbedUrlInput(e.target.value);
                                setEmbedUrlError(null);
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    commitEmbedFromDialog();
                                }
                            }}
                            placeholder={embedDialogKind === 'youtube' ? 'https://www.youtube.com/watch?v=…' : 'https://vimeo.com/…'}
                            className="mb-2"
                        />
                        {embedUrlError && <p className="mb-3 text-sm text-destructive">{embedUrlError}</p>}
                        <div className="flex justify-end gap-2">
                            <Button type="button" variant="outline" onClick={() => closeEmbedDialog()}>
                                Avbryt
                            </Button>
                            <Button type="button" onClick={() => commitEmbedFromDialog()}>
                                Legg til
                            </Button>
                        </div>
                    </div>
                </div>
            )}

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

            <div className="flex min-h-0 min-w-0 flex-1 flex-col items-stretch justify-start gap-2 overflow-hidden bg-muted/22 px-2 py-1 sm:gap-3 sm:px-3 sm:py-2 md:gap-4 dark:bg-transparent">
                <div className="mx-auto flex w-full max-w-225 shrink-0 flex-col items-stretch gap-2 rounded-[10px] border border-border bg-card px-4 py-2.5 shadow-[0_2px_10px_rgba(0,0,0,0.05),0_1px_2px_rgba(0,0,0,0.03)] sm:gap-2.5 sm:px-6 sm:py-3">
                    {/* Øverste rad: tittel + lysbilde-teller (lagre ligger i navbar) */}
                    <div className="flex min-w-0 flex-wrap items-center gap-4">
                        <Input
                            type="text"
                            className="h-auto min-w-0 flex-1 basis-[min(100%,280px)] rounded-md border-border bg-input px-3 py-[0.55rem] text-base text-foreground"
                            value={presentationTitle}
                            data-skip-slide-clipboard-image
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
                            <div ref={presentMenuRef} className="relative">
                                <Button
                                    onClick={() => setIsPresentMenuOpen((prev) => !prev)}
                                    variant="outline"
                                    size="sm"
                                    disabled={isStartingLive}
                                    aria-haspopup="menu"
                                    aria-expanded={isPresentMenuOpen}
                                    className="h-8 shrink-0 gap-2 border-emerald-500/30 bg-emerald-500/15 px-3 text-emerald-600 hover:border-input hover:bg-accent hover:text-accent-foreground"
                                >
                                    {isStartingLive ? (
                                        <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                                    ) : (
                                        <Play className="h-4 w-4 shrink-0" />
                                    )}
                                    Presenter
                                    <ChevronDown className="h-3.5 w-3.5" />
                                </Button>
                                {isPresentMenuOpen && (
                                    <div className="absolute right-0 top-full z-20 mt-2 min-w-56 overflow-hidden rounded-md border border-border bg-background p-1 shadow-lg">
                                        <p className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Presenter</p>
                                        <button
                                            type="button"
                                            className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                                            disabled={isStartingLive}
                                            onClick={() => runPresentMenuAction(onStartLive)}
                                        >
                                            <MonitorPlay className="h-4 w-4 shrink-0 text-emerald-500" />
                                            <span>Start live (med lobby)</span>
                                        </button>
                                        <button
                                            type="button"
                                            className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                                            disabled={isStartingLive}
                                            onClick={() => runPresentMenuAction(onStartLocalPresentation)}
                                        >
                                            <Play className="h-4 w-4 shrink-0 text-emerald-500" />
                                            <span>Start nå (uten lobby)</span>
                                        </button>
                                    </div>
                                )}
                            </div>
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
                                            applyListStyle('bullet');
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
                                            applyListStyle('dash');
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
                                            applyListStyle('arrow');
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
                        <div ref={mediaMenuRef} className="relative order-9">
                            <Button
                                type="button"
                                onClick={() => setIsMediaMenuOpen((prev) => !prev)}
                                variant="outline"
                                size="sm"
                                className="flex items-center gap-1.5"
                                aria-haspopup="menu"
                                aria-expanded={isMediaMenuOpen}
                            >
                                <ImageIcon className="h-3.5 w-3.5" />
                                Media
                                <ChevronDown className="h-3.5 w-3.5" />
                            </Button>
                            {isMediaMenuOpen && (
                                <div className="absolute left-0 top-full z-20 mt-2 min-w-52 overflow-hidden rounded-md border border-border bg-background p-1 shadow-lg">
                                    <button
                                        type="button"
                                        className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                                        onClick={() => {
                                            setIsMediaMenuOpen(false);
                                            setEmbedUrlInput('');
                                            setEmbedUrlError(null);
                                            setEmbedDialogKind('youtube');
                                        }}
                                    >
                                        <Video className="h-4 w-4 shrink-0" />
                                        <span>YouTube</span>
                                    </button>
                                    <button
                                        type="button"
                                        className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                                        onClick={() => {
                                            setIsMediaMenuOpen(false);
                                            setEmbedUrlInput('');
                                            setEmbedUrlError(null);
                                            setEmbedDialogKind('vimeo');
                                        }}
                                    >
                                        <Link2 className="h-4 w-4 shrink-0" />
                                        <span>Vimeo</span>
                                    </button>
                                    <button
                                        type="button"
                                        className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                                        onClick={() => {
                                            openLocalMediaFilePicker();
                                        }}
                                    >
                                        <ImageIcon className="h-4 w-4 shrink-0" />
                                        <span>Fra datamaskin</span>
                                    </button>
                                </div>
                            )}
                        </div>

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
                            <div ref={backgroundColorMenuRef} className="relative order-11">
                                <input
                                    ref={backgroundColorNativeInputRef}
                                    type="color"
                                    className="sr-only"
                                    aria-hidden
                                    tabIndex={-1}
                                    value={toHexColorForInput(slides[currentSlideIndex]?.backgroundColor || '#ffffff', '#ffffff')}
                                    onInput={(e) => {
                                        applyBackgroundColorLive((e.target as HTMLInputElement).value);
                                    }}
                                    onChange={(e) => {
                                        const color = e.target.value;
                                        applyBackgroundColorLive(color);
                                        commitBackgroundColorChange();
                                    }}
                                />
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="flex items-center gap-1.5"
                                    aria-haspopup="menu"
                                    aria-expanded={isBackgroundColorMenuOpen}
                                    onClick={() => {
                                        setIsTextColorMenuOpen(false);
                                        setIsShapeColorPickerOpen(false);
                                        setIsBackgroundColorMenuOpen((prev) => !prev);
                                    }}
                                >
                                    <Palette className="h-3.5 w-3.5" /> Bakgrunnsfarge
                                    <span
                                        className="h-4 w-4 rounded-sm border border-border"
                                        style={{ backgroundColor: slides[currentSlideIndex]?.backgroundColor || '#ffffff' }}
                                    />
                                    <ChevronDown className="h-3.5 w-3.5" />
                                </Button>
                                {isBackgroundColorMenuOpen && (
                                    <div className="absolute left-0 top-full z-30 mt-2 w-64 rounded-md border border-border bg-background p-2 shadow-lg">
                                        <p className="mb-2 px-1 text-xs font-medium text-muted-foreground">Forhåndsdefinerte farger</p>
                                        <div className="grid grid-cols-8 gap-1.5">
                                            {TOOLBAR_COLOR_PRESETS.map((hex) => {
                                                const isSelected = isPresetSelected(slides[currentSlideIndex]?.backgroundColor, hex, '#ffffff');
                                                return (
                                                    <button
                                                        key={hex}
                                                        type="button"
                                                        title={hex}
                                                        aria-pressed={isSelected}
                                                        className={`${PRESET_SWATCH_CLASS} ${
                                                            isSelected ? SELECTED_PRESET_SWATCH_CLASS : ''
                                                        }`}
                                                        style={{ backgroundColor: hex }}
                                                        onClick={() => {
                                                            changeBackgroundColor(hex);
                                                            setIsBackgroundColorMenuOpen(false);
                                                        }}
                                                    >
                                                        {isSelected && <Check className={`h-3.5 w-3.5 ${getPresetCheckmarkClass(hex)}`} strokeWidth={3} />}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            size="sm"
                                            className={COLOR_MENU_MORE_BUTTON_CLASS}
                                            onClick={() => {
                                                setIsBackgroundColorMenuOpen(false);
                                                requestAnimationFrame(() => backgroundColorNativeInputRef.current?.click());
                                            }}
                                        >
                                            <Pipette className="h-4 w-4 shrink-0" />
                                            <span>Flere farger…</span>
                                        </Button>
                                    </div>
                                )}
                            </div>
                            <div ref={shapeColorPickerRef} className="relative order-12">
                                <input
                                    ref={shapeFillNativeInputRef}
                                    type="color"
                                    className="sr-only"
                                    aria-hidden
                                    tabIndex={-1}
                                    value={toHexColorForInput(shapeFillColor, '#667eea')}
                                    onInput={(e) => {
                                        const color = (e.target as HTMLInputElement).value;
                                        setShapeFillColor(color);
                                        setShapeHasFill(true);
                                        applySelectedShapeFillColorLive(color);
                                    }}
                                    onChange={(e) => {
                                        const color = e.target.value;
                                        setShapeFillColor(color);
                                        setShapeHasFill(true);
                                        applySelectedShapeFillColorLive(color);
                                        commitCanvasColorChange();
                                    }}
                                />
                                <input
                                    ref={shapeStrokeNativeInputRef}
                                    type="color"
                                    className="sr-only"
                                    aria-hidden
                                    tabIndex={-1}
                                    value={toHexColorForInput(shapeStrokeColor, '#667eea')}
                                    onInput={(e) => {
                                        const color = (e.target as HTMLInputElement).value;
                                        setShapeStrokeColor(color);
                                        applySelectedShapeStrokeColorLive(color);
                                    }}
                                    onChange={(e) => {
                                        const color = e.target.value;
                                        setShapeStrokeColor(color);
                                        applySelectedShapeStrokeColorLive(color);
                                        commitCanvasColorChange();
                                    }}
                                />
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="flex items-center gap-1.5"
                                    disabled={!hasSelectedShape}
                                    aria-haspopup="menu"
                                    aria-expanded={isShapeColorPickerOpen}
                                    onClick={() => {
                                        if (!hasSelectedShape) return;
                                        setIsBackgroundColorMenuOpen(false);
                                        setIsTextColorMenuOpen(false);
                                        setIsShapeColorPickerOpen((prev) => !prev);
                                    }}
                                >
                                    <Square className="h-3.5 w-3.5" /> Figurfarge
                                    <span className="flex h-4 w-[18px] shrink-0 overflow-hidden rounded-sm border border-border">
                                        <span
                                            className={`h-full min-w-0 flex-1 ${!shapeHasFill ? CHECKERBOARD_SWATCH_CLASS : ''}`}
                                            style={shapeHasFill ? { backgroundColor: shapeFillColor } : undefined}
                                        />
                                        <span
                                            className="h-full min-w-0 flex-1 border-l border-border/80"
                                            style={{ backgroundColor: shapeStrokeColor }}
                                        />
                                    </span>
                                    <ChevronDown className="h-3.5 w-3.5" />
                                </Button>
                                {isShapeColorPickerOpen && hasSelectedShape && (
                                    <div className="absolute left-0 top-full z-30 mt-2 w-72 overflow-hidden rounded-md border border-border bg-background shadow-lg">
                                        <div className="space-y-3 p-2">
                                            <div>
                                                <p className="mb-1.5 px-0.5 text-xs font-medium text-muted-foreground">Fyll</p>
                                                <button
                                                    type="button"
                                                    title="Ingen fyll (gjennomsiktig)"
                                                    className={`relative mb-1.5 flex h-9 w-full items-center justify-center gap-2 overflow-hidden rounded-md border text-xs font-semibold transition-shadow hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                                                        !shapeHasFill
                                                            ? 'border-primary shadow-sm ring-2 ring-primary/30'
                                                            : 'border-border text-foreground'
                                                    }`}
                                                    onClick={() => {
                                                        setShapeHasFill(false);
                                                        applySelectedShapeNoFillLive();
                                                        commitCanvasColorChange();
                                                    }}
                                                >
                                                    <span
                                                        className={`pointer-events-none absolute inset-0 ${CHECKERBOARD_SWATCH_CLASS}`}
                                                    />
                                                    <Ban className="relative z-[1] h-3.5 w-3.5 text-muted-foreground" />
                                                    <span className="relative z-[1]">Ingen fyll</span>
                                                </button>
                                                <div className="grid grid-cols-8 gap-1.5">
                                                    {TOOLBAR_COLOR_PRESETS.map((hex) => {
                                                        const isSelected = shapeHasFill && isPresetSelected(shapeFillColor, hex, '#667eea');
                                                        return (
                                                            <button
                                                                key={`fill-${hex}`}
                                                                type="button"
                                                                title={hex}
                                                                aria-pressed={isSelected}
                                                                className={`${PRESET_SWATCH_CLASS} ${
                                                                    isSelected ? SELECTED_PRESET_SWATCH_CLASS : ''
                                                                }`}
                                                                style={{ backgroundColor: hex }}
                                                                onClick={() => {
                                                                    setShapeFillColor(hex);
                                                                    setShapeHasFill(true);
                                                                    applySelectedShapeFillColorLive(hex);
                                                                    commitCanvasColorChange();
                                                                }}
                                                            >
                                                                {isSelected && <Check className={`h-3.5 w-3.5 ${getPresetCheckmarkClass(hex)}`} strokeWidth={3} />}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                                <Button
                                                    type="button"
                                                    variant="secondary"
                                                    size="sm"
                                                    className={`${COLOR_MENU_MORE_BUTTON_CLASS} mb-2`}
                                                    onClick={() => {
                                                        requestAnimationFrame(() => shapeFillNativeInputRef.current?.click());
                                                    }}
                                                >
                                                    <Pipette className="h-4 w-4 shrink-0" />
                                                    <span>Andre fyllfarger…</span>
                                                </Button>
                                            </div>
                                            <div className="border-t border-border pt-3">
                                                <p className="mb-1.5 px-0.5 text-xs font-medium text-muted-foreground">Kontur</p>
                                                <div className="grid grid-cols-8 gap-1.5">
                                                    {TOOLBAR_COLOR_PRESETS.map((hex) => {
                                                        const isSelected = isPresetSelected(shapeStrokeColor, hex, '#667eea');
                                                        return (
                                                            <button
                                                                key={`stroke-${hex}`}
                                                                type="button"
                                                                title={hex}
                                                                aria-pressed={isSelected}
                                                                className={`${PRESET_SWATCH_CLASS} ${
                                                                    isSelected ? SELECTED_PRESET_SWATCH_CLASS : ''
                                                                }`}
                                                                style={{ backgroundColor: hex }}
                                                                onClick={() => {
                                                                    setShapeStrokeColor(hex);
                                                                    applySelectedShapeStrokeColorLive(hex);
                                                                    commitCanvasColorChange();
                                                                }}
                                                            >
                                                                {isSelected && <Check className={`h-3.5 w-3.5 ${getPresetCheckmarkClass(hex)}`} strokeWidth={3} />}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                                <Button
                                                    type="button"
                                                    variant="secondary"
                                                    size="sm"
                                                    className={`${COLOR_MENU_MORE_BUTTON_CLASS} mb-2`}
                                                    onClick={() => {
                                                        requestAnimationFrame(() => shapeStrokeNativeInputRef.current?.click());
                                                    }}
                                                >
                                                    <Pipette className="h-4 w-4 shrink-0" />
                                                    <span>Andre konturfarger…</span>
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div ref={textColorMenuRef} className="relative order-13">
                                <input
                                    ref={textColorNativeInputRef}
                                    type="color"
                                    className="sr-only"
                                    aria-hidden
                                    tabIndex={-1}
                                    value={toHexColorForInput(textColor, '#000000')}
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
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="flex items-center gap-1.5"
                                    disabled={!hasSelectedText}
                                    aria-haspopup="menu"
                                    aria-expanded={isTextColorMenuOpen}
                                    onClick={() => {
                                        if (!hasSelectedText) return;
                                        setIsBackgroundColorMenuOpen(false);
                                        setIsShapeColorPickerOpen(false);
                                        setIsTextColorMenuOpen((prev) => !prev);
                                    }}
                                >
                                    <Type className="h-3.5 w-3.5" /> Tekstfarge
                                    <span
                                        className="h-4 w-4 rounded-sm border border-border"
                                        style={{ backgroundColor: textColor }}
                                    />
                                    <ChevronDown className="h-3.5 w-3.5" />
                                </Button>
                                {isTextColorMenuOpen && hasSelectedText && (
                                    <div className="absolute left-0 top-full z-30 mt-2 w-64 rounded-md border border-border bg-background p-2 shadow-lg">
                                        <p className="mb-2 px-1 text-xs font-medium text-muted-foreground">Forhåndsdefinerte farger</p>
                                        <div className="grid grid-cols-8 gap-1.5">
                                            {TOOLBAR_COLOR_PRESETS.map((hex) => {
                                                const isSelected = isPresetSelected(textColor, hex, '#000000');
                                                return (
                                                    <button
                                                        key={hex}
                                                        type="button"
                                                        title={hex}
                                                        aria-pressed={isSelected}
                                                        className={`${PRESET_SWATCH_CLASS} ${
                                                            isSelected ? SELECTED_PRESET_SWATCH_CLASS : ''
                                                        }`}
                                                        style={{ backgroundColor: hex }}
                                                        onClick={() => {
                                                            setTextColor(hex);
                                                            applySelectedTextColorLive(hex);
                                                            commitCanvasColorChange();
                                                            setIsTextColorMenuOpen(false);
                                                        }}
                                                    >
                                                        {isSelected && <Check className={`h-3.5 w-3.5 ${getPresetCheckmarkClass(hex)}`} strokeWidth={3} />}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            size="sm"
                                            className={COLOR_MENU_MORE_BUTTON_CLASS}
                                            onClick={() => {
                                                setIsTextColorMenuOpen(false);
                                                requestAnimationFrame(() => textColorNativeInputRef.current?.click());
                                            }}
                                        >
                                            <Pipette className="h-4 w-4 shrink-0" />
                                            <span>Flere farger…</span>
                                        </Button>
                                    </div>
                                )}
                            </div>
                            <div className="order-4 flex max-w-full flex-wrap items-center gap-2">
                                <div ref={fontFamilyMenuRef} className="relative">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="h-9 min-w-[5.5rem] max-w-[9rem] gap-1.5 px-2 sm:max-w-none sm:px-3"
                                        aria-haspopup="menu"
                                        aria-expanded={isFontFamilyMenuOpen}
                                        onClick={() => {
                                            setIsFontFamilyMenuOpen((prev) => !prev);
                                            setIsFontSizeMenuOpen(false);
                                        }}
                                    >
                                        <span className="truncate">
                                            {FONT_FAMILIES.find((f) => f.value === fontFamily)?.label ?? 'Skrift'}
                                        </span>
                                        <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                                    </Button>
                                    {isFontFamilyMenuOpen && (
                                        <div className="absolute left-0 top-full z-20 mt-2 min-w-44 overflow-hidden rounded-md border border-border bg-background p-1 shadow-lg">
                                            {FONT_FAMILIES.map((font) => (
                                                <button
                                                    key={font.value}
                                                    type="button"
                                                    className={`flex w-full items-center rounded-sm px-2 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground ${
                                                        fontFamily === font.value ? 'bg-accent/60 font-medium' : ''
                                                    }`}
                                                    onClick={() => {
                                                        setFontFamily(font.value);
                                                        if (hasSelectedText) {
                                                            applySelectedTextStylesLive({ fontFamily: font.value });
                                                            commitCanvasColorChange();
                                                        }
                                                        setIsFontFamilyMenuOpen(false);
                                                    }}
                                                >
                                                    {font.label}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div ref={fontSizeMenuRef} className="relative shrink-0">
                                    <div className="flex h-9 w-[5.5rem] items-stretch overflow-hidden rounded-md border border-border bg-background">
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            aria-label="Skriftstørrelse"
                                            className="min-w-0 flex-1 border-0 bg-transparent px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                                            value={fontSizeInputValue}
                                            onChange={(e) => setFontSizeInputValue(e.target.value)}
                                            onBlur={() => commitFontSizeFromInput()}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    (e.target as HTMLInputElement).blur();
                                                }
                                            }}
                                        />
                                        <button
                                            type="button"
                                            className="flex shrink-0 items-center border-l border-border px-1.5 hover:bg-accent"
                                            aria-label="Velg skriftstørrelse fra liste"
                                            aria-haspopup="menu"
                                            aria-expanded={isFontSizeMenuOpen}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setIsFontSizeMenuOpen((prev) => !prev);
                                                setIsFontFamilyMenuOpen(false);
                                            }}
                                        >
                                            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                                        </button>
                                    </div>
                                    {isFontSizeMenuOpen && (
                                        <div className="absolute left-0 top-full z-50 mt-2 max-h-56 min-w-[5.5rem] overflow-y-auto rounded-md border border-border bg-background p-1 shadow-lg">
                                            {FONT_SIZE_OPTIONS.map((size) => (
                                                <button
                                                    key={size}
                                                    type="button"
                                                    className={`flex w-full items-center rounded-sm px-2 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground ${
                                                        textFontSize === size ? 'bg-accent/60 font-medium' : ''
                                                    }`}
                                                    onClick={() => {
                                                        setTextFontSize(size);
                                                        setFontSizeInputValue(String(size));
                                                        if (hasSelectedText) {
                                                            applySelectedTextStylesLive({ fontSize: size });
                                                            commitCanvasColorChange();
                                                        }
                                                        setIsFontSizeMenuOpen(false);
                                                    }}
                                                >
                                                    {size}px
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div
                                    className="flex shrink-0 items-center gap-0.5 rounded-md border border-border bg-background p-0.5"
                                    role="group"
                                    aria-label="Tekstjustering"
                                >
                                    <Button
                                        type="button"
                                        variant={textAlign === 'left' ? 'default' : 'ghost'}
                                        size="icon"
                                        className="h-8 w-8"
                                        title="Venstrejuster tekst"
                                        aria-label="Venstrejuster tekst"
                                        aria-pressed={textAlign === 'left'}
                                        onClick={() => {
                                            setTextAlign('left');
                                            if (hasSelectedText) {
                                                applySelectedTextStylesLive({ textAlign: 'left' });
                                                commitCanvasColorChange();
                                            }
                                        }}
                                    >
                                        <AlignLeft className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        type="button"
                                        variant={textAlign === 'center' ? 'default' : 'ghost'}
                                        size="icon"
                                        className="h-8 w-8"
                                        title="Midtstill tekst"
                                        aria-label="Midtstill tekst"
                                        aria-pressed={textAlign === 'center'}
                                        onClick={() => {
                                            setTextAlign('center');
                                            if (hasSelectedText) {
                                                applySelectedTextStylesLive({ textAlign: 'center' });
                                                commitCanvasColorChange();
                                            }
                                        }}
                                    >
                                        <AlignCenter className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        type="button"
                                        variant={textAlign === 'right' ? 'default' : 'ghost'}
                                        size="icon"
                                        className="h-8 w-8"
                                        title="Høyrejuster tekst"
                                        aria-label="Høyrejuster tekst"
                                        aria-pressed={textAlign === 'right'}
                                        onClick={() => {
                                            setTextAlign('right');
                                            if (hasSelectedText) {
                                                applySelectedTextStylesLive({ textAlign: 'right' });
                                                commitCanvasColorChange();
                                            }
                                        }}
                                    >
                                        <AlignRight className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
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
                        className="relative flex min-h-0 w-full flex-1 items-center justify-center rounded-[10px] bg-transparent px-2 py-1 sm:px-4 sm:py-1.5 md:px-5 md:py-2 dark:bg-zinc-950/40"
                    >
                        {/* Ytre ramme = skalert pikselstørrelse; indre div scale(top-left). outline-none mot global * outline-ring. */}
                        <div
                            className={cn(
                                'relative shrink-0 overflow-hidden rounded-lg border border-border bg-transparent',
                                'shadow-[0_4px_22px_rgba(0,0,0,0.07)]',
                                'dark:border-[3px] dark:border-white/40 dark:shadow-[0_0_0_1px_rgba(255,255,255,0.14),0_12px_44px_rgba(0,0,0,0.62)]',
                                'outline-none focus-visible:outline-none',
                            )}
                            style={{
                                width: CANVAS_WIDTH * canvasScale,
                                height: CANVAS_HEIGHT * canvasScale,
                            }}
                        >
                            <div
                                ref={canvasScaleWrapperRef}
                                className="relative origin-top-left"
                                style={{
                                    width: CANVAS_WIDTH,
                                    height: CANVAS_HEIGHT,
                                    transform: `scale(${canvasScale})`,
                                }}
                            >
                                <canvas ref={canvasRef} />
                                <SlideEmbedOverlays
                                    fabricCanvasRef={fabricCanvasRef}
                                    variant="editor"
                                    layoutRevision={embedLayoutRevision}
                                    sceneSize={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}
                                />
                                <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden rounded-lg">
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
                </div>

                <div className="mx-auto w-full max-w-225 shrink-0 rounded-[10px] border border-border bg-card px-4 py-2.5 shadow-[0_2px_10px_rgba(0,0,0,0.05),0_1px_2px_rgba(0,0,0,0.03)] sm:px-6 sm:py-3">
                    <Label htmlFor="presenter-notes" className="mb-1.5 block text-xs font-semibold text-foreground">Notater for slides</Label>
                    <Textarea
                        id="presenter-notes"
                        data-skip-slide-clipboard-image
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
                        <Badge
                            variant="secondary"
                            className="rounded-md border border-border px-1.5 py-0 text-[10px] font-semibold uppercase leading-none text-secondary-foreground"
                        >
                            S {(slides[currentSlideIndex]?.questions || []).length}
                        </Badge>
                        <Badge
                            variant="secondary"
                            className="rounded-md border border-border px-1.5 py-0 text-[10px] font-semibold uppercase leading-none text-secondary-foreground"
                        >
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

            {editorContextMenu && contextMenuStyle && (
                <div
                    ref={editorContextMenuRef}
                    role="menu"
                    aria-label="Elementhurtigmeny"
                    className="fixed z-[9999] overflow-hidden rounded-md border border-border/80 bg-popover text-popover-foreground shadow-lg"
                    style={contextMenuStyle}
                    onMouseDown={(e) => e.stopPropagation()}
                >
                    <div className="flex items-center gap-1 p-1">
                        {contextMenuTargetIsText && (
                            <>
                                <div
                                    className="flex shrink-0 items-center rounded border border-border/70 bg-background/80 p-0.5"
                                    role="group"
                                    aria-label="Tekststil"
                                >
                                    <button
                                        type="button"
                                        role="menuitemcheckbox"
                                        aria-checked={isTextBold}
                                        aria-label={isTextBold ? 'Fjern fet' : 'Fet'}
                                        title={isTextBold ? 'Fjern fet' : 'Fet'}
                                        className={cn(
                                            'flex h-7 w-7 items-center justify-center rounded-sm text-xs font-bold transition-colors',
                                            isTextBold
                                                ? 'bg-primary text-primary-foreground'
                                                : 'text-foreground hover:bg-accent',
                                        )}
                                        onClick={() => {
                                            applySelectedTextStylesLive({ fontWeight: isTextBold ? 'normal' : 'bold' });
                                            commitCanvasColorChange();
                                            syncHasSelectedShape();
                                        }}
                                    >
                                        B
                                    </button>
                                    <button
                                        type="button"
                                        role="menuitemcheckbox"
                                        aria-checked={isTextItalic}
                                        aria-label={isTextItalic ? 'Fjern kursiv' : 'Kursiv'}
                                        title={isTextItalic ? 'Fjern kursiv' : 'Kursiv'}
                                        className={cn(
                                            'flex h-7 w-7 items-center justify-center rounded-sm text-xs italic transition-colors',
                                            isTextItalic
                                                ? 'bg-primary text-primary-foreground'
                                                : 'text-foreground hover:bg-accent',
                                        )}
                                        onClick={() => {
                                            applySelectedTextStylesLive({ fontStyle: isTextItalic ? 'normal' : 'italic' });
                                            commitCanvasColorChange();
                                            syncHasSelectedShape();
                                        }}
                                    >
                                        I
                                    </button>
                                </div>
                                <div className="flex shrink-0 items-center gap-0.5" role="group" aria-label="Skriftstørrelse">
                                    {CONTEXT_MENU_FONT_SIZES.map((sz) => (
                                        <button
                                            key={`ctx-fs-${sz}`}
                                            type="button"
                                            role="menuitemradio"
                                            aria-checked={textFontSize === sz}
                                            aria-label={`${sz} piksler`}
                                            title={`${sz}px`}
                                            className={cn(
                                                'h-7 min-w-[2rem] rounded-sm border px-1 text-[11px] font-medium tabular-nums leading-none transition-colors',
                                                textFontSize === sz
                                                    ? 'border-primary bg-primary/15 text-foreground'
                                                    : 'border-border/70 bg-background/80 text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                                            )}
                                            onClick={() => {
                                                applySelectedTextStylesLive({ fontSize: sz });
                                                commitCanvasColorChange();
                                                syncHasSelectedShape();
                                            }}
                                        >
                                            {sz}
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}

                        {contextMenuShowDelete && (
                            <button
                                type="button"
                                role="menuitem"
                                aria-label="Slett element"
                                title="Slett element"
                                className={cn(
                                    'flex h-7 shrink-0 items-center justify-center rounded-sm text-destructive transition-colors hover:bg-destructive/15',
                                    contextMenuTargetIsText ? 'w-7' : 'gap-1 px-2 text-xs font-medium',
                                )}
                                onClick={() => {
                                    deleteSelected();
                                    setEditorContextMenu(null);
                                    syncHasSelectedShape();
                                }}
                            >
                                <Trash2 className="h-3.5 w-3.5 shrink-0" />
                                {!contextMenuTargetIsText && <span>Slett</span>}
                            </button>
                        )}
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