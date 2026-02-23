import React, { useState } from 'react';
import PollCreator from './PollComponents/PollCreator';
import PollViewer from './PollComponents/PollViewer';
import PollResults from './PollComponents/PollResults';
import '../CSScomponents/PollPage.css';

const PollPage = ({ onNavigate, user }) => {
  const [activeTab, setActiveTab] = useState('create');
  const [polls, setPolls] = useState([]);

  const handleSavePoll = (pollData) => {
    setPolls([...polls, pollData]);
    setActiveTab('view');
  };

  const handleVote = (pollId, optionIndex) => {
    setPolls(polls.map(poll => {
      if (poll.id === pollId) {
        const updatedOptions = poll.options.map((opt, idx) => 
          idx === optionIndex ? { ...opt, votes: opt.votes + 1 } : opt
        );
        return { ...poll, options: updatedOptions };
      }
      return poll;
    }));
  };

  const handleDeletePoll = (pollId) => {
    setPolls(polls.filter(poll => poll.id !== pollId));
  };

  return (
    <div className="poll-page">
      <div className="poll-container">
        <h1>Polls</h1>
        
        <div className="poll-tabs">
          <button 
            className={activeTab === 'create' ? 'active' : ''} 
            onClick={() => setActiveTab('create')}
          >
            Create Poll
          </button>
          <button 
            className={activeTab === 'view' ? 'active' : ''} 
            onClick={() => setActiveTab('view')}
          >
            View Polls ({polls.length})
          </button>
        </div>

        {activeTab === 'create' ? (
          <PollCreator onSave={handleSavePoll} />
        ) : (
          <div className="view-polls-section">
            {polls.length === 0 ? (
              <div className="no-polls">
                <p>No polls created yet. Create your first poll!</p>
              </div>
            ) : (
              polls.map(poll => (
                <div key={poll.id} className="poll-card">
                  <div className="poll-header">
                    <h3>{poll.question}</h3>
                    <button 
                      className="delete-poll-btn"
                      onClick={() => handleDeletePoll(poll.id)}
                    >
                      Delete
                    </button>
                  </div>
                  <PollViewer 
                    pollData={poll}
                    userId={user?.id}
                    onVote={(optionIndex) => handleVote(poll.id, optionIndex)}
                  />
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default PollPage;