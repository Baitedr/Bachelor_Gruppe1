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

/**
 * Publikum: sett volum (0–100) via postMessage uten synlige spillerkontroller.
 * YouTube bruker 0–100; Vimeo forventer 0–1.
 */
export function applyHostedVolumeToIframe(iframe: HTMLIFrameElement, provider: EmbedProvider, volumePercent: number) {
    const clamped = Math.max(0, Math.min(100, Math.round(volumePercent)));
    if (provider === 'youtube') {
        postYoutubeCommand(iframe, 'setVolume', [clamped]);
        postYoutubeCommand(iframe, clamped > 0 ? 'unMute' : 'mute', []);
        return;
    }
    postVimeoMethod(iframe, 'setVolume', clamped / 100);
}

/**
 * How far the audience playhead can drift from the presenter before we force a re-seek.
 * Generous threshold avoids micro-seeks that trigger rebuffering.
 */
export const EMBED_PLAYHEAD_RESYNC_THRESHOLD_SEC = 3.5;

export type EmbedPlaybackCoalesceState = {
    lastAppliedState: 'play' | 'pause' | null;
    lastAppliedTime: number;
    /** Wall-clock timestamp (ms) when we last applied a command, used to estimate local playhead. */
    lastAppliedAt: number;
};

/**
 * Apply playback to the audience iframe. Key design:
 * - On pause→play or first-ever: seek + play (unavoidable initial buffer).
 * - On play→play (periodic sync): estimate where the local player should be now using
 *   wall-clock elapsed since we last applied. Only re-seek if the presenter drifted
 *   beyond EMBED_PLAYHEAD_RESYNC_THRESHOLD_SEC from where we estimate the local player is.
 *   If within threshold: do NOTHING (no seekTo, no playVideo). This is the key fix —
 *   every playVideo/play call makes the embedded player re-enter its loading state.
 */
export function applyHostedPlaybackToIframe(
    iframe: HTMLIFrameElement,
    provider: EmbedProvider,
    state: 'play' | 'pause',
    timeSeconds: number,
    coalesce: EmbedPlaybackCoalesceState,
) {
    const t = Math.max(0, timeSeconds);
    const now = Date.now();

    if (provider === 'youtube') {
        if (state === 'pause') {
            postYoutubeCommand(iframe, 'seekTo', [t, true]);
            postYoutubeCommand(iframe, 'pauseVideo', []);
            coalesce.lastAppliedState = 'pause';
            coalesce.lastAppliedTime = t;
            coalesce.lastAppliedAt = now;
            return;
        }
        // First play or resuming from pause — must seek + play.
        if (coalesce.lastAppliedState === null || coalesce.lastAppliedState === 'pause') {
            postYoutubeCommand(iframe, 'seekTo', [t, true]);
            postYoutubeCommand(iframe, 'playVideo', []);
            coalesce.lastAppliedState = 'play';
            coalesce.lastAppliedTime = t;
            coalesce.lastAppliedAt = now;
            return;
        }
        // Already playing — estimate where the local player should be.
        const elapsedSec = (now - coalesce.lastAppliedAt) / 1000;
        const estimatedLocal = coalesce.lastAppliedTime + elapsedSec;
        if (Math.abs(t - estimatedLocal) >= EMBED_PLAYHEAD_RESYNC_THRESHOLD_SEC) {
            postYoutubeCommand(iframe, 'seekTo', [t, true]);
            postYoutubeCommand(iframe, 'playVideo', []);
            coalesce.lastAppliedTime = t;
            coalesce.lastAppliedAt = now;
        }
        // Otherwise: do nothing. Player is playing and roughly in sync.
        return;
    }

    // Vimeo
    if (state === 'pause') {
        postVimeoMethod(iframe, 'setCurrentTime', t);
        postVimeoMethod(iframe, 'pause');
        coalesce.lastAppliedState = 'pause';
        coalesce.lastAppliedTime = t;
        coalesce.lastAppliedAt = now;
        return;
    }
    if (coalesce.lastAppliedState === null || coalesce.lastAppliedState === 'pause') {
        postVimeoMethod(iframe, 'setCurrentTime', t);
        postVimeoMethod(iframe, 'play');
        coalesce.lastAppliedState = 'play';
        coalesce.lastAppliedTime = t;
        coalesce.lastAppliedAt = now;
        return;
    }
    const elapsedSec = (now - coalesce.lastAppliedAt) / 1000;
    const estimatedLocal = coalesce.lastAppliedTime + elapsedSec;
    if (Math.abs(t - estimatedLocal) >= EMBED_PLAYHEAD_RESYNC_THRESHOLD_SEC) {
        postVimeoMethod(iframe, 'setCurrentTime', t);
        postVimeoMethod(iframe, 'play');
        coalesce.lastAppliedTime = t;
        coalesce.lastAppliedAt = now;
    }
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
