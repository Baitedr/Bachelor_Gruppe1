import React, { useState, useEffect } from 'react';
import PollResults from './PollResults';
import '../../CSScomponents/PollCSScomponents/PollViewer.css';

const PollViewer = ({ pollData, userId, onVote, showResults = false }) => {
  const [hasVoted, setHasVoted] = useState(showResults);
  const [selectedOption, setSelectedOption] = useState(null);

  useEffect(() => {
    // Prefer backend truth
    if (pollData?.user_has_voted) {
      const selectedIndex = pollData.options.findIndex(
        (opt) => opt.text === pollData.user_vote_answer
      );
      setHasVoted(true);
      setSelectedOption(selectedIndex >= 0 ? selectedIndex : null);
      return;
    }

    // Fallback to local storage (per user + poll)
    const votedPolls = JSON.parse(localStorage.getItem('votedPolls') || '{}');
    const key = `${userId || 'anon'}:${pollData.id}`;
    const storedOptionId = votedPolls[key];

    if (storedOptionId) {
      const selectedIndex = pollData.options.findIndex((opt) => opt.id === storedOptionId);
      setHasVoted(selectedIndex >= 0);
      setSelectedOption(selectedIndex >= 0 ? selectedIndex : null);
    } else {
      setHasVoted(false);
      setSelectedOption(null);
    }
  }, [pollData, userId]);

  const handleVote = (option, index) => {
    if (hasVoted) {
      alert('You have already voted on this poll');
      return;
    }

    const votedPolls = JSON.parse(localStorage.getItem('votedPolls') || '{}');
    const key = `${userId || 'anon'}:${pollData.id}`;
    votedPolls[key] = option.id; // store stable option id, not index
    localStorage.setItem('votedPolls', JSON.stringify(votedPolls));

    setHasVoted(true);
    setSelectedOption(index);

    if (onVote) onVote(option.id);
  };

  if (!pollData) {
    return <div className="poll-viewer">No poll data available</div>;
  }

  return (
    <div className="poll-viewer">
      <h2 className="poll-question">{pollData.question}</h2>

      {!hasVoted ? (
        <div className="poll-options">
          {pollData.options.map((option, index) => (
            <button
              key={option.id || index}
              className="poll-option-btn"
              onClick={() => handleVote(option, index)}
            >
              {option.text}
            </button>
          ))}
        </div>
      ) : (
        <PollResults pollData={pollData} selectedOption={selectedOption} />
      )}
    </div>
  );
};

export default PollViewer;