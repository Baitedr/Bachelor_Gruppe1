import React, { useMemo } from 'react';
import { usePresentation } from '../../hooks/usePresentation';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

const normalizeType = (value) => (value === 'question' ? 'question' : 'poll')

const liveResultsBoard = ({ presentationId, initialType, initialItemId }) => {
    const token = localStorage.getItem('auth_token')

    const {
        activePoll,
        pollResults,
        activeQuestion,
        questionResults,
        sessionEnded,
    } = usePresentation(presentationId, token)

    const type = normalizeType(initialType)
    const itemId = String(initialItemId || '')

    const pollResult = type === 'poll' && itemId ? pollResults[itemId] : null
    const questionResult = type === 'question' && itemId ? questionResults[itemId] : null

    const pollOptions = useMemo(() => {
        if (type !== 'poll') return []
        if (activePoll && String(activePoll.id) === itemId) {
            return activePoll.options || []
        }
        const resultKeys = Object.keys(pollResult?.results || {})
            return resultKeys.map((text, index) => ({
            id: `fallback-${index}`,
            text
            }))
    }, [type, itemId, activePoll, pollResult])

    const questionOptions = useMemo(() => {
        if (type !== 'question') return []
        if (activeQuestion && String(activeQuestion.id) === itemId) {
            return activeQuestion.options || []
        }
        const resultKeys = Object.keys(questionResult?.results || {})
            return resultKeys.map((text, index) => ({
            id: `fallback-${index}`,
            text
            }))
    }, [type, itemId, activeQuestion, questionResult])

    if (!presentationId) {
        return <div className="text-sm text-muted-foreground">Mangler presentasjons-id.</div>
    }

}