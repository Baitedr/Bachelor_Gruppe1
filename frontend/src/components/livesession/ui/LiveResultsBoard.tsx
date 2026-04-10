import { useMemo } from 'react';
import { usePresentation } from '../../../hooks/usePresentation';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';

type BoardType = 'poll' | 'question' | 'both'

type PollOption = {
    id: string | number
    text: string
}

type QuestionOption = {
    id: string | number
    text: string
}

type ActivePoll = {
    id: string | number
    question: string
    options?: PollOption[]
}

type ActiveQuestion = {
    id: string | number
    prompt: string
    type?: 'single_choice' | 'open_text'
    options?: QuestionOption[]
}

type PollAggregate = {
    results?: Record<string, number>
    total?: number
}

type QuestionAggregate = {
    results?: Record<string, number>
    total?: number
    recent_answers?: string[]
    question_type?: 'single_choice' | 'open_text'
}

type LiveResultsBoardProps = {
    presentationId?: string | number | null
    initialType?: BoardType | string | null
    initialItemId?: string | number | null
}

const normalizeType = (value?: string | null): BoardType => {
    if (value === 'poll' || value === 'question' || value === 'both') return value
    return 'both'
}

const toId = (value?: string | number | null) => (value == null ? '' : String(value))

const LiveResultsBoard = ({ presentationId, initialType, initialItemId }: LiveResultsBoardProps) => {
    const token = localStorage.getItem('auth_token') ?? ''

    const {
        activePoll,
        pollResults,
        activeQuestion,
        questionResults,
        sessionEnded,
    } = usePresentation(presentationId, token) as {
        activePoll: ActivePoll | null
        pollResults: Record<string, PollAggregate>
        activeQuestion: ActiveQuestion | null
        questionResults: Record<string, QuestionAggregate>
        sessionEnded: boolean
    }

    const type = normalizeType(initialType ?? null)
    const pinnedItemId = toId(initialItemId)

    const showPoll = type === 'poll' || type === 'both'
    const showQuestion = type === 'question' || type === 'both'

    const pollId = useMemo(() => {
        if (!showPoll) return ''
        if (type === 'poll' && pinnedItemId) return pinnedItemId
        return activePoll ? toId(activePoll.id) : ''
    }, [showPoll, type, pinnedItemId, activePoll])

    const questionId = useMemo(() => {
        if (!showQuestion) return ''
        if (type === 'question' && pinnedItemId) return pinnedItemId
        return activeQuestion ? toId(activeQuestion.id) : ''
    }, [showQuestion, type, pinnedItemId, activeQuestion])

    const pollResult = pollId ? pollResults?.[pollId] : undefined
    const questionResult = questionId ? questionResults?.[questionId] : undefined

    const pollOptions = useMemo(() => {
        if (!showPoll || !pollId) return []
        if (activePoll && toId(activePoll.id) === pollId) return activePoll.options ?? []

        const keys = Object.keys(pollResult?.results ?? {})
        return keys.map((text, index) => ({
            id: `poll-fallback-${index}`,
            text,
        }))
    }, [showPoll, pollId, activePoll, pollResult])

    const questionOptions = useMemo(() => {
        if (!showQuestion || !questionId) return []
        if (activeQuestion && toId(activeQuestion.id) === questionId) return activeQuestion.options ?? []

        const keys = Object.keys(questionResult?.results ?? {})
        return keys.map((text, index) => ({
            id: `question-fallback-${index}`,
            text,
        }))
    }, [showQuestion, questionId, activeQuestion, questionResult])

    const pollRows = useMemo(() => {
        const total = pollResult?.total ?? 0
        return pollOptions.map((option) => {
            const votes = pollResult?.results?.[option.text] ?? 0
            const percent = total > 0 ? Math.round((votes / total) * 100) : 0
            return {
                id: option.id,
                text: option.text,
                votes,
                percent,
            }
        })
    }, [pollOptions, pollResult])

    const questionType = (questionResult?.question_type ??
        activeQuestion?.type ??
        'open_text') as 'single_choice' | 'open_text'

    const questionChoiceRows = useMemo(() => {
        const total = questionResult?.total ?? 0
        if (questionType !== 'single_choice') return []

        return questionOptions.map((option) => {
            const count = questionResult?.results?.[option.text] ?? 0
            const percent = total > 0 ? Math.round((count / total) * 100) : 0
            return {
                id: option.id,
                text: option.text,
                count,
                percent,
            }
        })
    }, [questionType, questionOptions, questionResult])

    if (!presentationId) {
        return <div className='text-sm text-muted-foreground'>Mangler presentasjon-id.</div>
    }

    const hasPollData = pollRows.length > 0
    const hasQuestionData = questionType === 'single_choice'
        ? questionChoiceRows.length > 0
        : (questionResult?.recent_answers?.length ?? 0) > 0


    return (
        <Card className='w-full border-2 border-border shadow-sm dark:border-border dark:shadow-md'>
            <CardHeader className='border-b border-border/80 pb-3 dark:border-border/60'>
                <CardTitle className='text-xl'>Live resultater</CardTitle>
                {sessionEnded ? (
                    <p className='text-sm text-muted-foreground'>Økten er avsluttet. Viser siste registrerte resultater.</p>
                ) : (
                    <p className='text-sm text-muted-foreground'>Resultater oppdateres i sanntid.</p>
                )}
            </CardHeader>

            <CardContent className='space-y-6'>
                {showPoll && (
                    <section className='space-y-3'>
                        <div className='flex items-center justify-between'>
                            <h3 className='text-base font-semibold'>Avstemning</h3>
                            <span className='text-xs text-muted-foreground'>
                                Totalt antall stemmer: {pollResult?.total ?? 0}
                            </span>
                        </div>

                        {!pollId && !hasPollData && (
                            <p className='text-sm text-muted-foreground'>Ingen svar registrert ennå.</p>
                        )}

                        {pollRows.map((row) => (
                            <div key={row.id} className='space-y-1'>
                                <div className='flex justify-between text-sm'>
                                    <span>{row.text}</span>
                                    <span className='text-muted-foreground'>
                                        {row.votes} ({row.percent}%)
                                    </span>
                                </div>
                                <div className='h-2 w-full overflow-hidden rounded bg-muted'>
                                    <div
                                        className='h-full bg-primary transition-[width] duration-300'
                                        style={{ width: `${row.percent}%` }}
                                    />
                                </div>
                            </div>
                        ))}
                    </section>
                )}

                {showQuestion && (
                    <section className='space-y-3 border-t border-border pt-4'>
                        <div className='flex items-center justify-between'>
                            <h3 className='text-base font-semibold'>Spørsmål</h3>
                            <span className='text-xs text-muted-foreground'>
                                Totalt antall svar: {questionResult?.total ?? 0}
                            </span>
                        </div>

                        {!questionId && questionType === 'single_choice' && !hasQuestionData && (
                            <p className='text-sm text-muted-foreground'>Ingen svar registrert ennå.</p>
                        )}

                        {questionId && questionType === 'single_choice' && questionChoiceRows.map((row) => (
                            <div key={row.id} className='space-y-1'>
                                <div className='flex justify-between text-sm'>
                                    <span>{row.text}</span>
                                    <span className='text-muted-foreground'>
                                        {row.count} ({row.percent}%)
                                    </span>
                                </div>
                                <div className='h-2 w-full overflow-hidden rounded bg-muted'>
                                    <div
                                        className='h-full bg-primary transition-[width] duration-300'
                                        style={{ width: `${row.percent}%` }}
                                    />
                                </div>
                            </div>
                        ))}

                        {questionId && questionType !== 'single_choice' && (
                            <div className='space-y-2'>
                                {(questionResult?.recent_answers ?? []).slice(-8).map((answer, index) => (
                                    <p
                                        key={`open-answer-${index}`}
                                        className='rounded-md border border-border bg-muted/50 px-3 py-2 text-sm font-medium leading-snug text-foreground'
                                    >
                                        {answer}
                                    </p>
                                ))}
                                {!hasQuestionData && (
                                    <p className='text-sm text-muted-foreground'>Ingen tekstsvar registrert ennå.</p>
                                )}
                            </div>
                        )}
                    </section>
                )}
            </CardContent>
        </Card>
    )
}

export default LiveResultsBoard
