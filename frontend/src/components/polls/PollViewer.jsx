import React, { useState, useEffect } from 'react'
import PollResults from './PollResults'
import { Button } from '../ui/button'

const PollViewer = ({ pollData, userId, onVote, showResults = false }) => {
  const [hasVoted, setHasVoted] = useState(showResults)
  const [selectedOption, setSelectedOption] = useState(null)

  useEffect(() => {
    // Prefer backend truth
    if (pollData?.user_has_voted) {
      const selectedIndex = pollData.options.findIndex(
        (opt) => opt.text === pollData.user_vote_answer
      )
      setHasVoted(true)
      setSelectedOption(selectedIndex >= 0 ? selectedIndex : null)
      return
    }

    // Fallback to local storage (per user + poll)
    const votedPolls = JSON.parse(localStorage.getItem('votedPolls') || '{}')
    const key = `${userId || 'anon'}:${pollData.id}`
    const storedOptionId = votedPolls[key]

    if (storedOptionId) {
      const selectedIndex = pollData.options.findIndex((opt) => opt.id === storedOptionId)
      setHasVoted(selectedIndex >= 0)
      setSelectedOption(selectedIndex >= 0 ? selectedIndex : null)
    } else {
      setHasVoted(false)
      setSelectedOption(null)
    }
  }, [pollData, userId])

  const handleVote = (option, index) => {
    if (hasVoted) {
      alert('Du har allerede stemt på denne avstemningen')
      return
    }

    const votedPolls = JSON.parse(localStorage.getItem('votedPolls') || '{}')
    const key = `${userId || 'anon'}:${pollData.id}`
    votedPolls[key] = option.id
    localStorage.setItem('votedPolls', JSON.stringify(votedPolls))

    setHasVoted(true)
    setSelectedOption(index)

    if (onVote) onVote(option.id)
  }

  if (!pollData) {
    return (
      <div className='rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground'>
        Ingen avstemningsdata tilgjengelig
      </div>
    )
  }

  return (
    <div className='mx-auto w-full max-w-2xl space-y-4'>
      <h2 className='text-center text-xl font-semibold text-foreground'>{pollData.question}</h2>

      {!hasVoted ? (
        <div className='mt-4 grid gap-2'>
          {pollData.options.map((option, index) => (
            <Button
              key={option.id || index}
              variant='outline'
              className='h-auto w-full justify-start px-4 py-3 text-left'
              onClick={() => handleVote(option, index)}
            >
              {option.text}
            </Button>
          ))}
        </div>
      ) : (
        <PollResults pollData={pollData} selectedOption={selectedOption} />
      )}
    </div>
  )
}

export default PollViewer
