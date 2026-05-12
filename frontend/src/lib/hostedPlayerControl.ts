import type { EmbedProvider } from './embedUrls';

/** Sender kommando til innebygd YouTube-spiller (IFrame API / postMessage). */
export function postYoutubeCommand(iframe: HTMLIFrameElement, func: string, args: unknown[] = []) {
    const w = iframe.contentWindow;
    if (!w) return;
    w.postMessage(JSON.stringify({ event: 'command', func, args }), '*');
}

/** Sender metode til Vimeo-spiller (postMessage-protokoll). */
export function postVimeoMethod(iframe: HTMLIFrameElement, method: string, value?: number) {
    const w = iframe.contentWindow;
    if (!w) return;
    const payload: Record<string, unknown> = { method };
    if (value !== undefined) payload.value = value;
    w.postMessage(JSON.stringify(payload), '*');
}

/** Spol og spill/pause uten å bruke UI i iframe (brukes på publikum). */
export function applyHostedPlaybackToIframe(
    iframe: HTMLIFrameElement,
    provider: EmbedProvider,
    state: 'play' | 'pause',
    timeSeconds: number,
) {
    const t = Math.max(0, timeSeconds);
    if (provider === 'youtube') {
        postYoutubeCommand(iframe, 'seekTo', [t, true]);
        postYoutubeCommand(iframe, state === 'play' ? 'playVideo' : 'pauseVideo', []);
        return;
    }
    postVimeoMethod(iframe, 'setCurrentTime', t);
    postVimeoMethod(iframe, state === 'play' ? 'play' : 'pause');
}

type HostedVimeoPlayer = {
    destroy?: () => void;
    getCurrentTime?: () => Promise<number>;
    on?: (ev: string, fn: () => void) => void;
    off?: (ev: string, fn: () => void) => void;
};

declare global {
    interface Window {
        YT?: { Player: new (id: string | HTMLElement, options: Record<string, unknown>) => unknown };
        onYouTubeIframeAPIReady?: () => void;
        Vimeo?: { Player: new (element: HTMLIFrameElement) => HostedVimeoPlayer };
    }
}

let youtubeApiPromise: Promise<void> | null = null;

/** Laster youtube.com/iframe_api én gang og venter på `YT.Player`. */
export function ensureYoutubeIframeApi(): Promise<void> {
    if (typeof window === 'undefined') return Promise.resolve();
    if (window.YT?.Player) return Promise.resolve();
    if (youtubeApiPromise) return youtubeApiPromise;

    youtubeApiPromise = new Promise((resolve) => {
        const prior = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = () => {
            try {
                prior?.();
            } finally {
                resolve();
            }
        };
        const existing = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
        if (!existing) {
            const tag = document.createElement('script');
            tag.src = 'https://www.youtube.com/iframe_api';
            document.head.appendChild(tag);
        }
    });
    return youtubeApiPromise;
}

let vimeoScriptPromise: Promise<void> | null = null;

/** Laster Vimeo Player.js én gang. */
export function ensureVimeoPlayerScript(): Promise<void> {
    if (typeof window === 'undefined') return Promise.resolve();
    if (window.Vimeo?.Player) return Promise.resolve();
    if (vimeoScriptPromise) return vimeoScriptPromise;

    vimeoScriptPromise = new Promise((resolve, reject) => {
        const tag = document.createElement('script');
        tag.src = 'https://player.vimeo.com/api/player.js';
        tag.async = true;
        tag.onload = () => resolve();
        tag.onerror = () => reject(new Error('Vimeo player script failed to load'));
        document.head.appendChild(tag);
    });
    return vimeoScriptPromise;
}
