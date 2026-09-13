import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { apiFetch } from '../utils/api';
import { trackEvent } from '../utils/analytics';
import Spinner from '../components/Spinner';

export default function InterestEditor() {
  const { getToken } = useAuth();

  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [error, setError] = useState(null);
  const [validationError, setValidationError] = useState(null);

  const [lastAction, setLastAction] = useState('load');

  // Load existing topics
  const loadInterests = useCallback(async () => {
    setLoading(true);
    setError(null);
    setLastAction('load');
    try {
      const data = await apiFetch('/api/interests', {}, getToken);
      if (data && Array.isArray(data.topics)) {
        setTopics(data.topics);
      }
    } catch (err) {
      setError(err.message || "Couldn't load your interests — try again");
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    loadInterests();
  }, [loadInterests]);

  function handleTopicChange(index, value) {
    const updated = [...topics];
    updated[index].topic = value;
    setTopics(updated);
    if (validationError) setValidationError(null);
  }

  function handleWeightChange(index, value) {
    const parsed = parseFloat(value);
    // Clamp between 0.0 and 1.0 (0 allows muting topic without deletion)
    const clamped = Math.max(0.0, Math.min(1.0, isNaN(parsed) ? 0.5 : parsed));
    const updated = [...topics];
    updated[index].weight = clamped;
    setTopics(updated);
  }

  function handleAddTopic() {
    setTopics([...topics, { topic: '', weight: 0.8 }]);
    if (validationError) setValidationError(null);
  }

  function handleRemoveTopic(index) {
    const updated = topics.filter((_, i) => i !== index);
    setTopics(updated);
    if (validationError) setValidationError(null);
  }

  async function handleSaveChanges() {
    setError(null);
    setSavedNotice(false);
    setLastAction('save');

    // Validation 1: At least 1 topic required
    if (topics.length === 0) {
      setValidationError('Please add at least one topic for your personalized digest.');
      return;
    }

    // Validation 2: No empty topic strings
    const hasEmpty = topics.some((t) => !t.topic || !t.topic.trim());
    if (hasEmpty) {
      setValidationError('Topic description cannot be empty. Please fill or remove blank rows.');
      return;
    }

    setSaving(true);
    try {
      const cleanTopics = topics.map((t) => {
        const num = Number(t.weight);
        return {
          topic: t.topic.trim(),
          weight: Math.max(0.0, Math.min(1.0, isNaN(num) ? 0.5 : num)),
        };
      });

      const data = await apiFetch(
        '/api/interests',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topics: cleanTopics }),
        },
        getToken
      );

      setTopics(data.topics || cleanTopics);
      setSavedNotice(true);
      setValidationError(null);
      trackEvent('interests_saved', { topicCount: cleanTopics.length });
      setTimeout(() => setSavedNotice(false), 2500);
    } catch (err) {
      setError(err.message || "Couldn't save changes — try again");
    } finally {
      setSaving(false);
    }
  }

  // Check validity for disabling save button
  const hasEmptyFields = topics.some((t) => !t.topic || !t.topic.trim());
  const isSaveDisabled = saving || loading || topics.length === 0 || hasEmptyFields;

  if (loading) {
    return (
      <div style={{ maxWidth: '720px' }}>
        <h1>Interest Profile</h1>
        <p className="text-slate">
          Define topics and importance weights. High weights prioritize stories in your top 5 digest.
        </p>
        <div className="loading-container" id="interest-loading-container">
          <Spinner size="md" />
          <span>Loading your interest profile...</span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '720px' }}>
      <h1>Interest Profile</h1>
      <p className="text-slate">
        Define topics and importance weights. High weights prioritize stories in your top 5 digest.
      </p>

      {/* Network / Server Error Banner with Retry */}
      {error && (
        <div className="error-banner" role="alert" id="interest-error-banner">
          <span className="error-banner-text">{error}</span>
          <button
            onClick={lastAction === 'save' ? handleSaveChanges : loadInterests}
            className="btn-retry"
            id="btn-retry-interests"
          >
            Try again
          </button>
        </div>
      )}

      {/* Client-side Form Validation Warning */}
      {validationError && (
        <div
          style={{
            margin: '1.25rem 0',
            padding: '0.75rem 1rem',
            backgroundColor: '#FFF9F8',
            border: '1px solid #E8B4AC',
            borderRadius: '4px',
            color: '#9C382A',
            fontSize: '0.9rem',
          }}
          role="alert"
          id="interest-validation-banner"
        >
          {validationError}
        </div>
      )}

      {topics.length === 0 ? (
        <div
          style={{
            margin: '2.5rem 0',
            padding: '1.5rem',
            border: '1px dashed var(--color-hairline)',
            borderRadius: '4px',
          }}
        >
          <p style={{ marginBottom: '1rem', color: 'var(--color-slate)' }}>
            No topics yet — add at least one topic below to start getting a personalized digest.
          </p>
          <button onClick={handleAddTopic} className="btn-secondary" id="btn-add-first-topic">
            Add topic
          </button>
        </div>
      ) : (
        <div className="topic-list" id="topic-list-container">
          {topics.map((t, idx) => {
            const isRowEmpty = !t.topic || !t.topic.trim();
            return (
              <div key={idx} className="topic-row" id={`topic-row-${idx}`}>
                <div className="topic-header-row">
                  <div style={{ flex: 1 }}>
                    <input
                      type="text"
                      value={t.topic}
                      placeholder="e.g. LLM reasoning, coding agents, multimodal models..."
                      onChange={(e) => handleTopicChange(idx, e.target.value)}
                      className={isRowEmpty ? 'input-invalid' : ''}
                      id={`input-topic-${idx}`}
                      aria-label={`Topic ${idx + 1}`}
                    />
                    {isRowEmpty && (
                      <div className="validation-msg">Topic description cannot be empty</div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveTopic(idx)}
                    className="btn-destructive"
                    title="Remove topic"
                    id={`btn-remove-${idx}`}
                    aria-label={`Remove topic ${idx + 1}`}
                  >
                    Remove
                  </button>
                </div>

                <div className="topic-slider-row">
                  <span className="slider-label">Weight multiplier:</span>
                  <input
                    type="range"
                    min="0.0"
                    max="1.0"
                    step="0.05"
                    value={t.weight}
                    onChange={(e) => handleWeightChange(idx, e.target.value)}
                    id={`slider-weight-${idx}`}
                    aria-label={`Weight for topic ${idx + 1}`}
                  />
                  <span className="slider-value" id={`val-weight-${idx}`}>
                    {Number(t.weight).toFixed(2)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          flexWrap: 'wrap',
          marginTop: '2rem',
        }}
      >
        <button
          onClick={handleAddTopic}
          className="btn-secondary btn-full-mobile"
          id="btn-add-topic"
        >
          Add topic
        </button>

        <button
          onClick={handleSaveChanges}
          disabled={isSaveDisabled}
          className="btn-primary btn-full-mobile"
          id="btn-save-changes"
          title={hasEmptyFields ? 'Fix blank topic rows before saving' : ''}
        >
          {saving ? 'Saving...' : 'Save changes'}
        </button>

        {savedNotice && (
          <span className="inline-confirmation" id="msg-saved-notice">
            Saved
          </span>
        )}
      </div>
    </div>
  );
}
