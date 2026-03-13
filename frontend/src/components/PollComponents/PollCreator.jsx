import React, { useState } from 'react';
import '../../CSScomponents//PollCSScomponents/PollCreator.css';

const PollCreator = ({ initialData = null, onSave, onCancel }) => {
  const [pollQuestion, setPollQuestion] = useState(initialData?.question || '');
  const [pollOptions, setPollOptions] = useState(
    initialData?.options?.map(opt => opt.text) || ['', '']
  );

  const handleAddOption = () => {
    if (pollOptions.length < 10) {
      setPollOptions([...pollOptions, '']);
    }
  };

  const handleRemoveOption = (index) => {
    if (pollOptions.length > 2) {
      setPollOptions(pollOptions.filter((_, i) => i !== index));
    }
  };

  const handleOptionChange = (index, value) => {
    const newOptions = [...pollOptions];
    newOptions[index] = value;
    setPollOptions(newOptions);
  };

  const handleSave = (e) => {
    e.preventDefault();
    
    if (!pollQuestion.trim()) {
      alert('Vennligst skriv inn et spørsmål'); // Please enter a poll question
      return;
    }

    const validOptions = pollOptions.filter(opt => opt.trim() !== '');
    if (validOptions.length < 2) {
      alert('Vennligst oppgi minst 2 alternativer'); // Please provide at least 2 options
      return;
    }

    const pollData = {
      id: initialData?.id || Date.now(),
      question: pollQuestion,
      options: validOptions.map(opt => ({
        text: opt,
        votes: 0
      })),
      createdAt: initialData?.createdAt || new Date().toISOString()
    };

    onSave(pollData);
  };

  const handleClear = () => {
    setPollQuestion('');
    setPollOptions(['', '']);
  };

  return (
    <div className="poll-creator">
      <h2>Opprett avstemning</h2>
      <form onSubmit={handleSave}>
        <div className="form-group">
          <label>Spørsmål</label>
          <input
            type="text"
            value={pollQuestion}
            onChange={(e) => setPollQuestion(e.target.value)}
            placeholder="Skriv inn spørsmålet ditt"
            maxLength={200}
          />
        </div>

        <div className="form-group">
          <label>Alternativer</label>
          {pollOptions.map((option, index) => (
            <div key={index} className="option-input-group">
              <input
                type="text"
                value={option}
                onChange={(e) => handleOptionChange(index, e.target.value)}
                placeholder={`Alternativ ${index + 1}`}
                maxLength={100}
              />
              {pollOptions.length > 2 && (
                <button
                  type="button"
                  className="remove-option-btn"
                  onClick={() => handleRemoveOption(index)}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="form-actions">
          {pollOptions.length < 10 && (
            <button 
              type="button" 
              className="add-option-btn"
              onClick={handleAddOption}
            >
              + Legg til alternativ
            </button>
          )}
          <button 
            type="button" 
            className="clear-btn"
            onClick={handleClear}
          >
            Tøm
          </button>
          {onCancel && (
            <button 
              type="button" 
              className="cancel-btn"
              onClick={onCancel}
            >
              Avbryt
            </button>
          )}
          <button type="submit" className="save-poll-btn">
            Lagre
          </button>
        </div>
      </form>
    </div>
  );
};

export default PollCreator;