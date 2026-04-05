import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { LogIn } from "lucide-react";

function sanitizeLiveCodeSuffix(raw: string): string {
    let s = raw.trim().toUpperCase().replace(/^LIVE-?/, '');
    return s.replace(/[^A-Z0-9]/g, '').slice(0, 4);
}

function fullLiveJoinCode(suffix: string): string {
    return `LIVE-${sanitizeLiveCodeSuffix(suffix)}`;
}

interface JoinStatus {
    type: 'success' | 'error' | null;
    title: string;
    message: string;
}

interface JoinResponse {
    message?: string;
    error?: string;
    presentation_id?: string;
    join_code?: string;
}

const PhoneInteraction: React.FC<{ onJoined?: (presentationId: string) => void }> = ({ onJoined }) => {
    const [joinCode, setJoinCode] = useState<string>('');
    const [isJoining, setIsJoining] = useState<boolean>(false);
    const [joinStatus, setJoinStatus] = useState<JoinStatus>({
        type: null,
        title: '',
        message: '',
    });

    useEffect(() => {
        setJoinStatus({ type: null, title: '', message: '' });
    }, []);

    const extractErrorMessage = (error: unknown): string => {
        if (error instanceof Error && error.message) {
            return error.message;
        }
        return 'Noe gikk galt. Prøv igjen.';
    };

    const handleJoinInteraction = async (event: React.FormEvent) => {
        event.preventDefault();

        const suffix = sanitizeLiveCodeSuffix(joinCode);
        const normalizedCode = fullLiveJoinCode(suffix);

        if (!suffix) {
            setJoinStatus({
                type: 'error',
                title: 'Kode mangler',
                message: 'Skriv inn de 4 tegnene i live-koden.',
            });
            return;
        }

        if (suffix.length < 4) {
            setJoinStatus({
                type: 'error',
                title: 'For kort kode',
                message: 'Oppgi alle 4 tegnene (bokstaver eller tall).',
            });
            return;
        }

        setIsJoining(true);
        setJoinStatus({ type: null, title: '', message: '' });

        try {
            const payload = await api.joinByCode(normalizedCode) as JoinResponse;

            setJoinStatus({
                type: 'success',
                title: 'Tilkoblet',
                message: payload?.message || 'Du er nå koblet til live interaction.',
            });
            setJoinCode('');

            if (payload.presentation_id && onJoined) {
                onJoined(payload.presentation_id);
            }
        } catch (err: unknown) {
            const backendMessage =
                (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
            setJoinStatus({
                type: 'error',
                title: 'Kunne ikke koble til',
                message: backendMessage || extractErrorMessage(err),
            });
        } finally {
            setIsJoining(false);
        }
    };

    return (
        <div className="mx-auto w-full max-w-md p-4">
            <Card className="border-border/70">
                <CardHeader>
                    <CardTitle>Delta med kode</CardTitle>
                    <CardDescription>
                        Skriv inn de fire tegnene du ser etter «LIVE-» på skjermen til presentatøren.
                    </CardDescription>
                </CardHeader>

                <CardContent className="space-y-4">
                    <form className="space-y-4" onSubmit={handleJoinInteraction}>
                        <div className="space-y-2">
                            <Label htmlFor="liveInteractionCode">Live-kode</Label>
                            <div className="flex overflow-hidden rounded-md border border-input shadow-sm focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background">
                                <span
                                    className="inline-flex items-center border-r border-input bg-muted px-3 font-mono text-sm text-muted-foreground"
                                    aria-hidden
                                >
                                    LIVE-
                                </span>
                                <Input
                                    id="liveInteractionCode"
                                    type="text"
                                    className="border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 rounded-none font-mono uppercase"
                                    value={joinCode}
                                    onChange={(event) => setJoinCode(sanitizeLiveCodeSuffix(event.target.value))}
                                    placeholder="AB12"
                                    autoComplete="off"
                                    maxLength={4}
                                    inputMode="text"
                                    spellCheck={false}
                                />
                            </div>
                        </div>

                        <Button
                            type="submit"
                            className="w-full flex items-center gap-2"
                            disabled={isJoining}
                        >
                            {!isJoining && <LogIn className="h-4 w-4" />}
                            {isJoining ? 'Vennligst vent...' : 'Bli med'}
                        </Button>
                    </form>

                    {joinStatus.type && (
                        <div
                            role="status"
                            aria-live="polite"
                            className={
                                joinStatus.type === 'error'
                                    ? 'rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive'
                                    : 'rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-500'
                            }
                        >
                            <h3 className="font-medium">{joinStatus.title}</h3>
                            <p>{joinStatus.message}</p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

export default PhoneInteraction;
