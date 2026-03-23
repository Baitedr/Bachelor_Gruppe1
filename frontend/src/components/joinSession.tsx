import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { LogIn } from "lucide-react";

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

        const normalizedCode = joinCode.trim().toUpperCase();

        if (!normalizedCode) {
            setJoinStatus({
                type: 'error',
                title: 'Kode mangler',
                message: 'Skriv inn en gyldig kode for å bli med i live interaction.',
            });
            return;
        }

        if (normalizedCode.length < 4) {
            setJoinStatus({
                type: 'error',
                title: 'For kort kode',
                message: 'Koden må være minst 4 tegn.',
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
                    <CardDescription>Skriv inn live-koden for å koble til økten.</CardDescription>
                </CardHeader>

                <CardContent className="space-y-4">
                    <form className="space-y-4" onSubmit={handleJoinInteraction}>
                        <div className="space-y-2">
                            <Label htmlFor="liveInteractionCode">Live-kode</Label>
                            <Input
                                id="liveInteractionCode"
                                type="text"
                                value={joinCode}
                                onChange={(event) => setJoinCode(event.target.value)}
                                placeholder="F.eks. LIVE-1234"
                                autoComplete="off"
                            />
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
