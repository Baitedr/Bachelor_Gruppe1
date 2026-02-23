import React, { useState, useEffect } from 'react';
import PollResults from './PollResults';
import '../../CSScomponents/PollCSScomponents/PollViewer.css';

const PollViewer = ({ pollData, userId, onVote, showResults = false }) => {
  const [hasVoted, setHasVoted] = useState(showResults);
  const [selectedOption, setSelectedOption] = useState(null);

  useEffect(() => {
    // Check if user has already voted (could be from localStorage or backend)
    const votedPolls = JSON.parse(localStorage.getItem('votedPolls') || '{}');
    if (votedPolls[pollData.id]) {
      setHasVoted(true);
      setSelectedOption(votedPolls[pollData.id]);
    }
  }, [pollData.id]);

  const handleVote = (optionIndex) => {
    if (hasVoted) {
      alert('You have already voted on this poll');
      return;
    }

    // Save vote to localStorage
    const votedPolls = JSON.parse(localStorage.getItem('votedPolls') || '{}');
    votedPolls[pollData.id] = optionIndex;
    localStorage.setItem('votedPolls', JSON.stringify(votedPolls));

    setHasVoted(true);
    setSelectedOption(optionIndex);
    
    if (onVote) {
      onVote(optionIndex);
    }
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
              key={index}
              className="poll-option-btn"
              onClick={() => handleVote(index)}
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