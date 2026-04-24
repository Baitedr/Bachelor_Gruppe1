import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
// TODO: Denne komponenten har vokst seg ganske stor og kompleks, og kunne nok hatt godt av å bli delt opp i mindre deler.
type BoardType = 'poll' | 'question' | 'both'
type OpenTextDisplayMode = 'word_cloud' | 'answer_list'

type PollOption = {
  id: string | number
  text: string
}

type QuestionOption = {
  id: string | number
  text: string
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
  openTextDisplayMode?: OpenTextDisplayMode
  open_text_display_mode?: OpenTextDisplayMode
}

type LiveResultsBoardProps = {
  initialType?: BoardType | string | null
  initialItemId?: string | number | null
  /** Må komme fra samme usePresentation som resten av live-økten (ett WebSocket-abonnement). */
  pollResults: Record<string, PollAggregate>
  questionResults: Record<string, QuestionAggregate>
  sessionEnded: boolean
  /** Lysbilde-meta for pinned poll (valgtekster uten aktiv poll). */
  pollMeta?: {
    id?: string | number
    question?: string
    options?: PollOption[]
  } | null
  questionMeta?: {
    id?: string | number
    prompt?: string
    type?: string
    openTextDisplayMode?: OpenTextDisplayMode
    open_text_display_mode?: OpenTextDisplayMode
    options?: QuestionOption[]
  } | null
}

type ResultsBarChartRow = {
  id: string | number
  text: string
  value: number
  percent: number
}

const BAR_PALETTE = ['#2563eb', '#0ea5e9', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6']

const ResultsBarChart = ({ rows, valueLabel }: { rows: ResultsBarChartRow[]; valueLabel: string }) => {
  if (rows.length === 0) return null

  const data = rows
    .slice()
    .sort((left, right) => right.value - left.value)
    .map((row) => ({
      name: row.text,
      value: row.value,
      percent: row.percent,
      rowId: row.id,
    }))

  return (
    <div className='h-64 w-full rounded-lg border border-border bg-muted/20 p-2'>
      <ResponsiveContainer width='100%' height='100%'>
        <BarChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 36 }}>
          <CartesianGrid strokeDasharray='3 3' vertical={false} />
          <XAxis
            dataKey='name'
            angle={-16}
            textAnchor='end'
            interval={0}
            height={52}
            tick={{ fontSize: 11 }}
          />
          <YAxis allowDecimals={false} />
          <Tooltip
            formatter={(value, _name, item) => {
              const numericValue = typeof value === 'number' ? value : Number(value ?? 0)
              const percent =
                typeof item?.payload?.percent === 'number' ? item.payload.percent : 0

              return [`${numericValue} ${valueLabel} (${percent}%)`, 'Resultat']
            }}
          />
          <Bar dataKey='value' radius={[6, 6, 0, 0]}>
            {data.map((entry, index) => (
              <Cell key={String(entry.rowId)} fill={BAR_PALETTE[index % BAR_PALETTE.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
// -------- WORD CLOUD LOGIKK ---------
type WordCloudItem = {
  text: string
  count: number 
  size: number 
  opacity: number
}

// Normaliserer tekst ved å fjerne diakritiske tegn, gjøre alt til små bokstaver, og fjerne spesialtegn (unntatt mellomrom og bindestreker).
const normalizeWordSource = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^\p{L}\p{N}\s-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

// Formaterer teksten for visning ved å erstatte flere mellomrom med ett enkelt og trimme det.
const formatPhraseForDisplay = (value: string) => value.replace(/\s+/g, ' ').trim()
  // Bygger en liste av WordCloudItem basert på resultatene, og rangerer dem etter forekomst.
  const buildWordCloudItems = (results?: Record<string, number>): WordCloudItem[] => {
    if (!results) return []

    const counts = new Map<string, { text: string; count: number }>()

    Object.entries(results).forEach(([rawAnswer, answerCount]) => {
      const normalizedPhrase = normalizeWordSource(rawAnswer)
      const displayPhrase = formatPhraseForDisplay(rawAnswer)

      if (!normalizedPhrase || normalizedPhrase.replace(/\s/g, '').length < 3) return

      const existing = counts.get(normalizedPhrase)
      if (existing) {
        existing.count += answerCount
        return
      }

      counts.set(normalizedPhrase, {
        text: displayPhrase || normalizedPhrase,
        count: answerCount,
      })
    })
   
    // Rangering og skalering av ord basert på forekomst, og begrenser til topp 30.
    const ranked = Array.from(counts.values())
      .filter((item) => item.count > 0)
      .sort((left, right) => right.count - left.count)
      .slice(0, 30)

      const maxCount = ranked[0]?.count ?? 1

      return ranked.map((item) => {
        const ratio = item.count / maxCount
        return {
          text: item.text,
          count: item.count,
          size: 16 + Math.round(Math.sqrt(ratio) * 28), // Størrelse mellom 16 og 44
          opacity: 0.55 + ratio * 0.45, // Opasitet mellom 0.55 og 1
        }
      })
    }
    // Genererer en farge basert på ordets tekst ved å hashe det og konvertere til en HSL-farge.
    const colorFromWord = (word: string): string => {
      let hash = 0
      for (let index = 0; index < word.length; index += 1) {
        hash = word.charCodeAt(index) + ((hash << 5) - hash)
      }
      const hue = Math.abs(hash) % 360
      return `hsl(${hue}, 70%, 42%)`
    }

    type QuestionWordCloudProps = {
      results?: Record<string, number>
    }
    // Komponent som viser en ordsky basert på tekstsvarene i et spørsmål, 
    // hvor størrelsen og opasiteten til hvert ord reflekterer hvor ofte det har blitt svart.
    const QuestionWordCloud = ({ results }: QuestionWordCloudProps) => {
      const items = useMemo(() => buildWordCloudItems(results), [results])
      if (items.length === 0) {
        return <p className='text-sm text-muted-foreground'>Ingen tekstsvar registrert</p>
      }

      return (
        <div className='rounded-lg border border-border bg-muted/30 p-4'>
          <div className='flex flex-wrap items-center justify-center gap-x-4 gap-y-3'>
            {items.map((item) => (
              <span
                key={item.text}
                className='inline-block font-semibold leading-none transition-all duration-300 ease-out'
                style={{
                  fontSize: `${item.size}px`,
                  opacity: item.opacity,
                  color: colorFromWord(item.text),
                }}
              >
                {item.text}
              </span>
                ))}
            </div>
          </div>
      )
    }

// Normaliserer og validerer typen for resultattavlen, og faller tilbake til 'both' hvis den er ugyldig eller ikke angitt.
const normalizeType = (value?: string | null): BoardType => {
  if (value === 'poll' || value === 'question' || value === 'both') return value
  return 'both'
}
// Konverterer en verdi til en string-ID, og håndterer null eller undefined ved å returnere en tom string.
const toId = (value?: string | number | null) => (value == null ? '' : String(value))

// Hovedkomponenten for LiveResultsBoard som viser sanntidsresultater for avstemninger og spørsmål i en live-økt, basert på de gitte propsene.
const LiveResultsBoard = ({
  initialType,
  initialItemId,
  pollResults,
  questionResults,
  sessionEnded,
  pollMeta,
  questionMeta,
}: LiveResultsBoardProps) => {
  const type = normalizeType(initialType ?? null)
  const pinnedItemId = toId(initialItemId)

  const showPoll = type === 'poll' || type === 'both'
  const showQuestion = type === 'question' || type === 'both'

  const pollId = useMemo(() => {
    if (!showPoll) return ''
    if (type === 'poll' && pinnedItemId) return pinnedItemId
    return ''
  }, [showPoll, type, pinnedItemId])

  const questionId = useMemo(() => {
    if (!showQuestion) return ''
    if (type === 'question' && pinnedItemId) return pinnedItemId
    return ''
  }, [showQuestion, type, pinnedItemId])

  const pollResult = pollId ? pollResults?.[pollId] : undefined
  const questionResult = questionId ? questionResults?.[questionId] : undefined

  const pollOptions = useMemo(() => {
    if (!showPoll || !pollId) return []
    const fromSlide = pollMeta && toId(pollMeta.id) === pollId ? pollMeta.options ?? [] : []
    if (fromSlide.length > 0) return fromSlide

    const keys = Object.keys(pollResult?.results ?? {})
    return keys.map((text, index) => ({
      id: `poll-fallback-${index}`,
      text,
    }))
  }, [showPoll, pollId, pollMeta, pollResult])

  const questionOptions = useMemo(() => {
    if (!showQuestion || !questionId) return []
    const fromSlide =
      questionMeta && toId(questionMeta.id) === questionId ? questionMeta.options ?? [] : []
    if (fromSlide.length > 0) return fromSlide

    const keys = Object.keys(questionResult?.results ?? {})
    return keys.map((text, index) => ({
      id: `question-fallback-${index}`,
      text,
    }))
  }, [showQuestion, questionId, questionMeta, questionResult])

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

  const pollChartRows = useMemo<ResultsBarChartRow[]>(
    () =>
      pollRows.map((row) => ({
        id: row.id,
        text: row.text,
        value: row.votes,
        percent: row.percent,
      })),
    [pollRows]
  )

  const questionType = (questionResult?.question_type ??
    (questionMeta?.type === 'single_choice' ? 'single_choice' : 'open_text')) as
    | 'single_choice'
    | 'open_text'

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

  const questionChartRows = useMemo<ResultsBarChartRow[]>(
    () =>
      questionChoiceRows.map((row) => ({
        id: row.id,
        text: row.text,
        value: row.count,
        percent: row.percent,
      })),
    [questionChoiceRows]
  )

  const openTextDisplayMode: OpenTextDisplayMode =
    questionResult?.openTextDisplayMode === 'answer_list' ||
    questionResult?.open_text_display_mode === 'answer_list' ||
    questionMeta?.openTextDisplayMode === 'answer_list' ||
    questionMeta?.open_text_display_mode === 'answer_list'
      ? 'answer_list'
      : 'word_cloud'

  const openTextRows = useMemo(
    () =>
      Object.entries(questionResult?.results ?? {})
        .map(([answer, count], index) => ({
          id: `open-text-${index}`,
          answer,
          count,
        }))
        .sort((left, right) => right.count - left.count),
    [questionResult]
  )

  return (
    <Card className='w-full border-2 border-border shadow-sm dark:border-border dark:shadow-md'>
      <CardHeader className='border-b border-border/80 pb-3 dark:border-border/60'>
        <CardTitle className='text-xl'>Live resultater</CardTitle>
        {sessionEnded ? (
          <p className='text-sm text-muted-foreground'>
            Økten er avsluttet. Viser siste registrerte resultater.
          </p>
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

            {pollId && pollRows.length === 0 && (
              <p className='text-sm text-muted-foreground'>Ingen svar registrert ennå.</p>
            )}

            {pollRows.length > 0 && <ResultsBarChart rows={pollChartRows} valueLabel='stemmer' />}

            {pollRows.length > 0 && (
              <div className='space-y-1'>
                {pollRows
                  .slice()
                  .sort((left, right) => right.votes - left.votes)
                  .map((row) => (
                    <div key={row.id} className='flex justify-between text-sm'>
                      <span>{row.text}</span>
                      <span className='text-muted-foreground'>
                        {row.votes} ({row.percent}%)
                      </span>
                    </div>
                  ))}
              </div>
            )}
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

            {questionId && questionType === 'single_choice' && questionChoiceRows.length === 0 && (
              <p className='text-sm text-muted-foreground'>Ingen svar registrert ennå.</p>
            )}

            {questionId && questionType === 'single_choice' && questionChoiceRows.length > 0 && (
              <ResultsBarChart rows={questionChartRows} valueLabel='svar' />
            )}

            {questionId && questionType === 'single_choice' && questionChoiceRows.length > 0 && (
              <div className='space-y-1'>
                {questionChoiceRows
                  .slice()
                  .sort((left, right) => right.count - left.count)
                  .map((row) => (
                    <div key={row.id} className='flex justify-between text-sm'>
                      <span>{row.text}</span>
                      <span className='text-muted-foreground'>
                        {row.count} ({row.percent}%)
                      </span>
                    </div>
                  ))}
              </div>
            )}

            {questionId && questionType !== 'single_choice' && (
              <div className='space-y-3'>
                <div className='flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground'>
                  <span>Visning av tekstsvar</span>
                  <span>
                    {openTextDisplayMode === 'word_cloud' ? 'Word cloud' : 'Vanlig svarliste'}
                  </span>
                </div>

                {openTextDisplayMode === 'word_cloud' ? (
                  <QuestionWordCloud results={questionResult?.results} />
                ) : (
                  <div className='space-y-2'>
                    {openTextRows.length === 0 ? (
                      <p className='text-sm text-muted-foreground'>Ingen tekstsvar registrert</p>
                    ) : (
                      openTextRows.slice(0, 12).map((row) => (
                        <div
                          key={row.id}
                          className='flex items-start justify-between gap-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm'
                        >
                          <span className='wrap-break-word'>{row.answer}</span>
                          <span className='shrink-0 text-muted-foreground'>{row.count}</span>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {(questionResult?.recent_answers?.length ?? 0) > 0 && (
                  <div className='space-y-2'>
                    {(questionResult?.recent_answers ?? []).slice(-6).map((answer, index) => (
                      <p
                        key={`open-answer-${index}`}
                        className='rounded-md border border-border bg-muted/50 px-3 py-2 text-sm font-medium leading-snug text-foreground'
                      >
                        {answer}
                      </p>
                    ))}
                  </div>
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
