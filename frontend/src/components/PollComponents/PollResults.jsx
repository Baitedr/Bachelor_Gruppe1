import React from 'react';
import '../../CSScomponents//PollCSScomponents/PollResults.css';

const PollResults = ({ pollData, selectedOption = null }) => {
  const getTotalVotes = () => {
    return pollData.options.reduce((sum, opt) => sum + opt.votes, 0);
  };

  const getPercentage = (votes, total) => {
    return total === 0 ? 0 : Math.round((votes / total) * 100);
  };

  const totalVotes = getTotalVotes();

  return (
    <div className="poll-results">
      <div className="results-options">
        {pollData.options.map((option, index) => {
          const percentage = getPercentage(option.votes, totalVotes);
          const isSelected = selectedOption === index;

          return (
            <div key={index} className={`result-option ${isSelected ? 'selected' : ''}`}>
              <div className="result-header">
                <span className="option-text">
                  {option.text}
                  {isSelected && <span className="your-vote"> (Your vote)</span>}
                </span>
                <span className="option-stats">
                  {option.votes} ({percentage}%)
                </span>
              </div>
              <div className="vote-bar-container">
                <div 
                  className="vote-bar"
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="results-footer">
        Total votes: {totalVotes}
      </div>
    </div>
  );
};

export default PollResults;