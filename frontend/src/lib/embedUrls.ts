/** Kilde for innebygd spiller (iframe-URL bygges ut fra dette). */
export type EmbedProvider = 'youtube' | 'vimeo';

/** Tolker YouTube-URL eller rå 11-tegns video-ID. */
export function parseYoutubeId(input: string): string | null {
    const raw = input.trim();
    if (!raw) return null;

    if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) return raw;

    try {
        const u = new URL(raw, 'https://example.com');
        const host = u.hostname.replace(/^www\./, '');

        if (host === 'youtu.be') {
            const id = u.pathname.split('/').filter(Boolean)[0];
            return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
        }

        if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
            const v = u.searchParams.get('v');
            if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;

            const shorts = u.pathname.match(/^\/shorts\/([a-zA-Z0-9_-]{11})/);
            if (shorts?.[1]) return shorts[1];

            const embed = u.pathname.match(/^\/embed\/([a-zA-Z0-9_-]{11})/);
            if (embed?.[1]) return embed[1];
        }
    } catch {
        return null;
    }

    return null;
}

/** Tolker Vimeo-URL eller rent numerisk video-ID. */
export function parseVimeoId(input: string): string | null {
    const raw = input.trim();
    if (!raw) return null;

    const direct = raw.match(/^\d+$/);
    if (direct) return direct[0];

    try {
        const u = new URL(raw, 'https://example.com');
        const host = u.hostname.replace(/^www\./, '');

        if (host === 'vimeo.com' || host === 'player.vimeo.com') {
            const m = u.pathname.match(/\/(?:video\/)?(\d+)/);
            if (m?.[1]) return m[1];
        }
    } catch {
        return null;
    }

    return null;
}

export type EmbedIframeOptions = {
    /** Skjul spillerkontroller (publikum i live). */
    hideControls?: boolean;
    /** Slå på JS-API / postMessage (nødvendig for synk i live). */
    enableApi?: boolean;
};

/** Bygger embed-URL med riktige query-parametre for YouTube nocookie / Vimeo player. */
export function getEmbedIframeSrc(provider: EmbedProvider, id: string, options: EmbedIframeOptions = {}): string {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const hideControls = Boolean(options.hideControls);
    const enableApi = Boolean(options.enableApi);

    if (provider === 'youtube') {
        const params = new URLSearchParams({ rel: '0' });
        if (enableApi) {
            params.set('enablejsapi', '1');
            if (origin) params.set('origin', origin);
        }
        if (hideControls) params.set('controls', '0');
        const qs = params.toString();
        return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?${qs}`;
    }

    const vParams = new URLSearchParams();
    if (enableApi) vParams.set('api', '1');
    if (hideControls) vParams.set('controls', '0');
    vParams.set('playsinline', '1');
    const vQs = vParams.toString();
    return `https://player.vimeo.com/video/${encodeURIComponent(id)}?${vQs}`;
}
