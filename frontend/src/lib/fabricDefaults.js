import { Canvas, IText } from 'fabric';

const CANVAS_WIDTH = 960;
const CANVAS_HEIGHT = 540;
const CANVAS_PADDING = 30;

const keepObjectInsideCanvas = (object) => {
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

export const createDefaultSlideFabricData = () => {
    // Temporary canvas ensures text metrics are available before serializing JSON.
    const tempCanvasElement = document.createElement('canvas');
    tempCanvasElement.width = CANVAS_WIDTH;
    tempCanvasElement.height = CANVAS_HEIGHT;
    const canvas = new Canvas(tempCanvasElement, {
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        backgroundColor: '#ffffff'
    });

    const title = new IText('Tittel', {
        left: 80,
        top: 60,
        originX: 'left',
        originY: 'top',
        fontSize: 48,
        fontWeight: 'bold',
        fontFamily: 'Arial',
        fill: '#000000',
        textAlign: 'left',
        lineHeight: 1.16,
    });

    const text = new IText('Klikk for å redigere', {
        left: 80,
        top: 150,
        originX: 'left',
        originY: 'top',
        fontSize: 28,
        fontWeight: 'normal',
        fontFamily: 'Arial',
        fill: '#333333',
        textAlign: 'left',
        lineHeight: 1.2,
    });

    // Add then clamp to make sure defaults always stay visible within slide bounds.
    canvas.add(title, text);
    keepObjectInsideCanvas(title);
    keepObjectInsideCanvas(text);
    canvas.renderAll();

    // Serialize objects to JSON
    const data = canvas.toJSON();
    canvas.dispose();

    return data;
};
