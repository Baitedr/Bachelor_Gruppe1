type PollOption = {
  text: string
  votes?: number
}

type PollData = {
  options: PollOption[]
}

type PollResultsProps = {
  pollData: PollData
  selectedOption?: number | null
}

const PollResults = ({ pollData, selectedOption = null }: PollResultsProps) => {
  const getTotalVotes = () => {
    return pollData.options.reduce((sum, opt) => sum + Number(opt.votes || 0), 0)
  }

  const getPercentage = (votes: number, total: number) => {
    return total === 0 ? 0 : Math.round((votes / total) * 100)
  }

  const totalVotes = getTotalVotes()

  return (
    <div className='space-y-4'>
      <div className='space-y-3'>
        {pollData.options.map((option, index) => {
          const votes = Number(option.votes || 0)
          const percentage = getPercentage(votes, totalVotes)
          const isSelected = selectedOption === index

          return (
            <div
              key={index}
              className={`rounded-xl border p-3 transition-colors ${
                isSelected
                  ? 'border-primary/40 bg-primary/10'
                  : 'border-border/70 bg-muted/30'
              }`}
            >
              <div className='mb-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between'>
                <span className='text-sm font-medium text-foreground'>
                  {option.text}
                  {isSelected && <span className='ml-1 text-xs text-primary'>(Din stemme)</span>}
                </span>
                <span className='text-sm font-semibold text-primary'>
                  {votes} ({percentage}%)
                </span>
              </div>
              <div className='h-2 overflow-hidden rounded bg-muted'>
                <div
                  className='h-full rounded bg-primary transition-[width] duration-500 ease-out'
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>

      <div className='border-t border-border/70 pt-3 text-center text-sm font-medium text-muted-foreground'>
        Totalt antall stemmer: {totalVotes}
      </div>
    </div>
  )
}

export default PollResults