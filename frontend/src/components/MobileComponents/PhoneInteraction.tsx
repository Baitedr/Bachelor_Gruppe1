import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import '../../CSScomponents/PhoneInteraction.css';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';


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
        <div className="phone-interaction-page">
            <div className="phone-interaction-shell">
                <header className="phone-interaction-header">
                    <h1>ProSlides</h1>
                    <p>Skriv inn kode for å bli med</p>
                </header>

                <section className="phone-interaction-card">
                    <h2>Bli med med kode</h2>

                    <form className="phone-interaction-join-form" onSubmit={handleJoinInteraction}>
                        <Label htmlFor="liveInteractionCode">Live-kode</Label>
                        <Input
                            id="liveInteractionCode"
                            type="text"
                            value={joinCode}
                            onChange={(event) => setJoinCode(event.target.value)}
                            placeholder="F.eks. LIVE-1234"
                            autoComplete="off"
                        />
                        <Button type="submit" disabled={isJoining}>
                            {isJoining ? 'Kobler til...' : 'Bli med i live interaction'}
                        </Button>
                    </form>

                    {joinStatus.type && (
                        <div className={`phone-interaction-alert ${joinStatus.type}`} role="status" aria-live="polite">
                            <h3>{joinStatus.title}</h3>
                            <p>{joinStatus.message}</p>
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
};

export default PhoneInteraction;
