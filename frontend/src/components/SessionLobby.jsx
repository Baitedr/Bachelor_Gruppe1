import React from 'react';
import { useEffect } from 'react';
import { usePresentation } from '../hooks/usePresentation';

const SessionLobby = ({ presentationId, joinCode, isPresenter, onSessionStarted }) => {
const {
    participantCount,
    sessionStarted,
    startSession,
} = usePresentation(presentationId, localStorage.getItem('auth_token'));

useEffect(() => {
    if (sessionStarted) {
        onSessionStarted();
    }
}, [sessionStarted])

return (
    <div style={{padding: '3rem', textAlign: 'center'}}>
        <h2>Session Lobby</h2>¨

        {isPresenter && joinCode && (
            <div style={{margin: '2rem 0'}}>
                <p>del denne koden med publikum:</p>
                <div style={{ fontSize: '2.5rem', fontWeight: 'bold', letterSpacing: '0.25rem'}}>
                    {joinCode}
                </div>
            </div>
        )}

        <div style={{margin: '2rem 0'}}>
            <p style={{fontSize: '1.25rem'}}>Deltakere i lobbyen: <strong> {participantCount} </strong></p>
        </div>

        {isPresenter ? (
            <button 
                onClick={startSession}
                disabled={participantCount === 0}
                style={{ padding: '0.75rem 2rem', fontSize: '1rem', cursor: 'pointer'}}
            >
                Start Presentasjon
            </button>
        ) : (
            <p>Venter på at presentatør skal starte...</p>
        )}
    </div>
);
};

export default SessionLobby;