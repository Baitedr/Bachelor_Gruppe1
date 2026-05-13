import type { Canvas, StaticCanvas } from 'fabric';
import { FabricImage, Rect, classRegistry, type TClassProperties, type TOptions } from 'fabric';
import type { RectProps, SerializedRectProps } from 'fabric';
import type { ObjectEvents } from 'fabric';
import type { EmbedProvider } from './embedUrls';

/**
 * Egendefinerte Fabric-klasser for lysbilde-JSON: lokal video (`video`) og
 * plassholder for innebygd YouTube/Vimeo (`embed`). Må importeres før loadFromJSON.
 */

export type { EmbedProvider } from './embedUrls';

export type SerializedVideoProps = {
    mediaType?: 'video';
    src?: string;
};

export const createVideoElement = (src: string) =>
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

/** Lokal videofil eller data-URL; rendrer `<video>` direkte på canvas. */
export class FabricVideo extends FabricImage {
    static type = 'video';

    constructor(element: HTMLVideoElement, options: Record<string, unknown> = {}) {
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

interface UniqueEmbedProps {
    embedProvider: EmbedProvider;
    embedId: string;
}

export interface SerializedFabricEmbedProps extends SerializedRectProps, UniqueEmbedProps {}

export interface FabricEmbedProps extends RectProps, UniqueEmbedProps {}

/**
 * Rektangel som lagrer `embedProvider` + `embedId`; geometri brukes til å plassere
 * iframe i redigering og live. Selve videoen tegnes ikke i Fabric under live (se `hideFabricEmbedPlaceholdersForLiveOverlay`).
 */
export class FabricEmbed<
    Props extends TOptions<FabricEmbedProps> = Partial<FabricEmbedProps>,
    SProps extends SerializedFabricEmbedProps = SerializedFabricEmbedProps,
    EventSpec extends ObjectEvents = ObjectEvents,
> extends Rect<Props, SProps, EventSpec> implements UniqueEmbedProps {
    static type = 'embed';

    declare embedProvider: EmbedProvider;
    declare embedId: string;

    constructor(options?: Props) {
        super(options);
    }

    toObject<
        T extends Omit<Props & TClassProperties<this>, keyof SProps>,
        K extends keyof T = never,
    >(propertiesToInclude: K[] = []): Pick<T, K> & SProps {
        return super.toObject(['embedProvider', 'embedId', ...propertiesToInclude] as K[]);
    }
}

classRegistry.setClass(FabricVideo, 'video');
classRegistry.setClass(FabricEmbed, 'embed');

/**
 * Under live vises video i HTML-iframe over lerretet. Placeholder-rektangelet (fill/stroke)
 * ligger ellers synlig i kantene ved avrunding/pikselavrunding. Setter opacity til 0 slik at
 * kun iframe synes; posisjon og getBoundingRect() er uendret.
 */
export function hideFabricEmbedPlaceholdersForLiveOverlay(canvas: Canvas | StaticCanvas) {
    canvas.getObjects().forEach((obj) => {
        if (obj.type !== 'embed') return;
        obj.set({ opacity: 0 });
        obj.setCoords();
    });
    canvas.requestRenderAll();
}
