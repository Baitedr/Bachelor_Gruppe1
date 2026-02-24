import React, { useState, useEffect } from 'react';
import PollCreator from './PollComponents/PollCreator';
import PollViewer from './PollComponents/PollViewer';
import api from '../services/api';
import '../CSScomponents/PollPage.css';

const PollPage = ({ onNavigate, user }) => {
  const [activeTab, setActiveTab] = useState('create');
  const [polls, setPolls] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load polls from backend on mount
  useEffect(() => {
    fetchPolls();
  }, []);

  const fetchPolls = async () => {
    try {
      setIsLoading(true);
      const data = await api.getPolls();
      setPolls(data.polls || []);
      setError(null);
    } catch (err) {
      setError('Failed to load polls');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSavePoll = async (pollData) => {
    try {
      const data = await api.createPoll({
        question: pollData.question,
        options: pollData.options.map(opt => opt.text),
        poll_type: 'multiple_choice',
      });
      setPolls(prev => [...prev, data.poll]);
      setActiveTab('view');
      setError(null);
    } catch (err) {
      setError('Failed to save poll');
    }
  };

  const handleVote = async (pollId, optionId) => {
    try {
      const data = await api.votePoll(pollId, optionId);
      // Replace poll with updated vote counts from backend
      setPolls(prev => prev.map(p => p.id === pollId ? data.poll : p));
      setError(null);
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to vote');
    }
  };

  const handleDeletePoll = async (pollId) => {
    try {
      await api.deletePoll(pollId);
      setPolls(prev => prev.filter(p => p.id !== pollId));
      setError(null);
    } catch (err) {
      setError('Failed to delete poll');
    }
  };

  return (
    <div className="poll-page">
      <div className="poll-container">
        <h1>Polls</h1>

        {error && (
          <div style={{ color: '#ef4444', marginBottom: '1rem', padding: '0.75rem', background: 'rgba(239,68,68,0.1)', borderRadius: '8px' }}>
            {error}
          </div>
        )}

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
        ) : isLoading ? (
          <div className="no-polls"><p>Loading polls...</p></div>
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
                    onVote={(optionId) => handleVote(poll.id, optionId)}
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