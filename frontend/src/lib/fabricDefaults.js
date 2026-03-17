import { Canvas, IText } from 'fabric';

export const createDefaultSlideFabricData = () => {
    // Create a temporary canvas so text metrics are properly calculated
    const tempCanvasElement = document.createElement('canvas');
    tempCanvasElement.width = 960;
    tempCanvasElement.height = 540;
    const canvas = new Canvas(tempCanvasElement, {
        width: 960,
        height: 540,
        backgroundColor: '#ffffff'
    });

    const title = new IText('Tittel', {
        left: 80,
        top: 60,
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
        fontSize: 28,
        fontWeight: 'normal',
        fontFamily: 'Arial',
        fill: '#333333',
        textAlign: 'left',
        lineHeight: 1.2,
    });

    // Add them to the canvas to ensure measurements (width/height etc) are calculated
    canvas.add(title, text);
    canvas.renderAll();

    // Serialize objects to JSON
    const data = canvas.toJSON();
    canvas.dispose();

    return data;
};
