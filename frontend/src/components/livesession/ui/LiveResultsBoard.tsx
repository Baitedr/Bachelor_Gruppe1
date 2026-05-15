import { useMemo } from 'react'
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
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card'

/**
 * Resultatvisning for polls/spørsmål i live-økt (stolper + ordsky/svarliste).
 * @author T3lluz
 */
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
  pollResults: Record<string, PollAggregate>
  questionResults: Record<string, QuestionAggregate>
  sessionEnded: boolean
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

type WordCloudItem = {
  text: string
  count: number
  size: number
  opacity: number
}

const styles = {
  chartWrap: 'h-64 w-full rounded-lg border border-border bg-muted/20 p-2',
  mutedInfoText: 'text-sm text-muted-foreground',
  wordCloudWrap: 'rounded-lg border border-border bg-muted/30 p-4',
  wordCloudList: 'flex flex-wrap items-center justify-center gap-x-4 gap-y-3',
  wordCloudItem: 'inline-block font-semibold leading-none transition-all duration-300 ease-out',
  rootCard: 'w-full border-2 border-border shadow-sm dark:border-border dark:shadow-md',
  cardHeader: 'border-b border-border/80 pb-3 dark:border-border/60',
  cardTitle: 'text-xl',
  cardContent: 'space-y-6',
  section: 'space-y-3',
  sectionHeader: 'flex items-center justify-between',
  sectionTitle: 'text-base font-semibold',
  sectionCount: 'text-xs text-muted-foreground',
  rowsWrap: 'space-y-1',
  row: 'flex justify-between text-sm',
  rowValue: 'text-muted-foreground',
  questionSection: 'space-y-3 border-t border-border pt-4',
  displayModeBanner:
    'flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground',
  answersList: 'space-y-2',
  answerRow: 'flex items-start justify-between gap-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm',
  answerText: 'break-words',
  answerCount: 'shrink-0 text-muted-foreground',
  recentAnswers: 'space-y-2',
  recentAnswerText: 'rounded-md border border-border bg-muted/50 px-3 py-2 text-sm font-medium leading-snug text-foreground',
} as const

const BAR_PALETTE = ['#2563eb', '#0ea5e9', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6']

const normalizeType = (value?: string | null): BoardType => {
  if (value === 'poll' || value === 'question' || value === 'both') return value
  return 'both'
}

// Gjør id-felt robust når kilden kan være number/null/undefined.
const toId = (value?: string | number | null) => (value == null ? '' : String(value))

// Normaliserer tekst for å slå sammen like ord med ulik casing/tegnsetting.
const normalizeWordSource = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^\p{L}\p{N}\s-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const formatPhraseForDisplay = (value: string) => value.replace(/\s+/g, ' ').trim()

const buildWordCloudItems = (results?: Record<string, number>): WordCloudItem[] => {
  // Samler like ord/fraser og beregner størrelse/opasitet basert på frekvens.
  if (!results) return []

  const counts = new Map<string, { text: string; count: number }>()
  for (const [rawAnswer, answerCount] of Object.entries(results)) {
    const normalizedPhrase = normalizeWordSource(rawAnswer)
    const displayPhrase = formatPhraseForDisplay(rawAnswer)
    if (!normalizedPhrase || normalizedPhrase.replace(/\s/g, '').length < 3) continue

    const existing = counts.get(normalizedPhrase)
    if (existing) {
      existing.count += answerCount
      continue
    }

    counts.set(normalizedPhrase, {
      text: displayPhrase || normalizedPhrase,
      count: answerCount,
    })
  }

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
      size: 16 + Math.round(Math.sqrt(ratio) * 28),
      opacity: 0.55 + ratio * 0.45,
    }
  })
}

const colorFromWord = (word: string): string => {
  let hash = 0
  for (let index = 0; index < word.length; index += 1) {
    hash = word.charCodeAt(index) + ((hash << 5) - hash)
  }
  const hue = Math.abs(hash) % 360
  return `hsl(${hue}, 70%, 42%)`
}

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
    // Gjenbrukbar stolpegraf for både poll og flervalg-spørsmål.
    <div className={styles.chartWrap}>
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
              const percent = typeof item?.payload?.percent === 'number' ? item.payload.percent : 0
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

const QuestionWordCloud = ({ results }: { results?: Record<string, number> }) => {
  const items = useMemo(() => buildWordCloudItems(results), [results])
  if (items.length === 0) return <p className={styles.mutedInfoText}>Ingen tekstsvar registrert</p>

  return (
    // Enkel ordsky: størrelse/opacity reflekterer relativ frekvens.
    <div className={styles.wordCloudWrap}>
      <div className={styles.wordCloudList}>
        {items.map((item) => (
          <span
            key={item.text}
            className={styles.wordCloudItem}
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

const LiveResultsBoard = ({
  initialType,
  initialItemId,
  pollResults,
  questionResults,
  sessionEnded,
  pollMeta,
  questionMeta,
}: LiveResultsBoardProps) => {
  // "Pinned" mode viser eksplisitt ett element, ellers kan komponenten vise begge seksjoner.
  const type = normalizeType(initialType ?? null)
  const pinnedItemId = toId(initialItemId)
  const showPoll = type === 'poll' || type === 'both'
  const showQuestion = type === 'question' || type === 'both'

  // Id settes kun når komponenten er låst til én konkret poll/spørsmål.
  const pollId = showPoll && type === 'poll' ? pinnedItemId : ''
  const questionId = showQuestion && type === 'question' ? pinnedItemId : ''

  const pollResult = pollId ? pollResults[pollId] : undefined
  const questionResult = questionId ? questionResults[questionId] : undefined

  const pollOptions = useMemo(() => {
    // Foretrekker metadata fra slide; fallback til keys i resultatobjekt.
    if (!showPoll || !pollId) return []
    const fromSlide = pollMeta && toId(pollMeta.id) === pollId ? pollMeta.options ?? [] : []
    if (fromSlide.length > 0) return fromSlide

    return Object.keys(pollResult?.results ?? {}).map((text, index) => ({
      id: `poll-fallback-${index}`,
      text,
    }))
  }, [showPoll, pollId, pollMeta, pollResult])

  const questionOptions = useMemo(() => {
    // Samme strategi som pollOptions, men for spørsmålsalternativer.
    if (!showQuestion || !questionId) return []
    const fromSlide = questionMeta && toId(questionMeta.id) === questionId ? questionMeta.options ?? [] : []
    if (fromSlide.length > 0) return fromSlide

    return Object.keys(questionResult?.results ?? {}).map((text, index) => ({
      id: `question-fallback-${index}`,
      text,
    }))
  }, [showQuestion, questionId, questionMeta, questionResult])

  const pollRows = useMemo(() => {
    // Mapper til visningsrader med prosentregning.
    const total = pollResult?.total ?? 0
    return pollOptions.map((option) => {
      const votes = pollResult?.results?.[option.text] ?? 0
      return {
        id: option.id,
        text: option.text,
        votes,
        percent: total > 0 ? Math.round((votes / total) * 100) : 0,
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
    [pollRows],
  )

  // Endelig spørsmålsmodus (backend prioriteres foran metadata-fallback).
  const questionType = (questionResult?.question_type ??
    (questionMeta?.type === 'single_choice' ? 'single_choice' : 'open_text')) as
    | 'single_choice'
    | 'open_text'

  const questionChoiceRows = useMemo(() => {
    // Flervalg-spørsmål gjøres om til prosentbaserte rader.
    if (questionType !== 'single_choice') return []
    const total = questionResult?.total ?? 0

    return questionOptions.map((option) => {
      const count = questionResult?.results?.[option.text] ?? 0
      return {
        id: option.id,
        text: option.text,
        count,
        percent: total > 0 ? Math.round((count / total) * 100) : 0,
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
    [questionChoiceRows],
  )

  // Åpne tekstsvar kan vises som ordsky eller tradisjonell liste.
  const openTextDisplayMode: OpenTextDisplayMode =
    questionResult?.openTextDisplayMode === 'answer_list' ||
    questionResult?.open_text_display_mode === 'answer_list' ||
    questionMeta?.openTextDisplayMode === 'answer_list' ||
    questionMeta?.open_text_display_mode === 'answer_list'
      ? 'answer_list'
      : 'word_cloud'

  const openTextRows = useMemo(
    // Sorterer åpne tekstsvar etter forekomst for lesbar listevisning.
    () =>
      Object.entries(questionResult?.results ?? {})
        .map(([answer, count], index) => ({
          id: `open-text-${index}`,
          answer,
          count,
        }))
        .sort((left, right) => right.count - left.count),
    [questionResult],
  )

  return (
    <Card className={styles.rootCard}>
      <CardHeader className={styles.cardHeader}>
        <CardTitle className={styles.cardTitle}>Live resultater</CardTitle>
        <p className={styles.mutedInfoText}>
          {sessionEnded ? 'Økten er avsluttet. Viser siste registrerte resultater.' : 'Resultater oppdateres i sanntid.'}
        </p>
      </CardHeader>

      <CardContent className={styles.cardContent}>
        {showPoll && (
          // Poll-seksjon med graf + detaljlinjer.
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h3 className={styles.sectionTitle}>Avstemning</h3>
              <span className={styles.sectionCount}>Totalt antall stemmer: {pollResult?.total ?? 0}</span>
            </div>

            {pollId && pollRows.length === 0 && <p className={styles.mutedInfoText}>Ingen svar registrert ennå.</p>}
            {pollRows.length > 0 && <ResultsBarChart rows={pollChartRows} valueLabel='stemmer' />}

            {pollRows.length > 0 && (
              <div className={styles.rowsWrap}>
                {pollRows
                  .slice()
                  .sort((left, right) => right.votes - left.votes)
                  .map((row) => (
                    <div key={row.id} className={styles.row}>
                      <span>{row.text}</span>
                      <span className={styles.rowValue}>
                        {row.votes} ({row.percent}%)
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </section>
        )}

        {showQuestion && (
          // Spørsmål-seksjon: flervalg bruker graf, åpne svar bruker ordsky/liste.
          <section className={styles.questionSection}>
            <div className={styles.sectionHeader}>
              <h3 className={styles.sectionTitle}>Spørsmål</h3>
              <span className={styles.sectionCount}>Totalt antall svar: {questionResult?.total ?? 0}</span>
            </div>

            {questionId && questionType === 'single_choice' && questionChoiceRows.length === 0 && (
              <p className={styles.mutedInfoText}>Ingen svar registrert ennå.</p>
            )}

            {questionId && questionType === 'single_choice' && questionChoiceRows.length > 0 && (
              <>
                <ResultsBarChart rows={questionChartRows} valueLabel='svar' />
                <div className={styles.rowsWrap}>
                  {questionChoiceRows
                    .slice()
                    .sort((left, right) => right.count - left.count)
                    .map((row) => (
                      <div key={row.id} className={styles.row}>
                        <span>{row.text}</span>
                        <span className={styles.rowValue}>
                          {row.count} ({row.percent}%)
                        </span>
                      </div>
                    ))}
                </div>
              </>
            )}

            {questionId && questionType !== 'single_choice' && (
              <div className={styles.section}>
                <div className={styles.displayModeBanner}>
                  <span>Visning av tekstsvar</span>
                  <span>{openTextDisplayMode === 'word_cloud' ? 'Word cloud' : 'Vanlig svarliste'}</span>
                </div>

                {openTextDisplayMode === 'word_cloud' ? (
                  <QuestionWordCloud results={questionResult?.results} />
                ) : (
                  <div className={styles.answersList}>
                    {openTextRows.length === 0 ? (
                      <p className={styles.mutedInfoText}>Ingen tekstsvar registrert</p>
                    ) : (
                      openTextRows.slice(0, 12).map((row) => (
                        <div key={row.id} className={styles.answerRow}>
                          <span className={styles.answerText}>{row.answer}</span>
                          <span className={styles.answerCount}>{row.count}</span>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {(questionResult?.recent_answers?.length ?? 0) > 0 && (
                  <div className={styles.recentAnswers}>
                    {(questionResult?.recent_answers ?? []).slice(-6).map((answer, index) => (
                      <p key={`open-answer-${index}`} className={styles.recentAnswerText}>
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
