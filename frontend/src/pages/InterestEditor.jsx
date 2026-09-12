import React, { useState, useEffect } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { getAuthToken } from '../utils/auth';
import { apiUrl } from '../utils/api';

export default function InterestEditor() {
  const { getToken } = useAuth();

  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [error, setError] = useState(null);

  // Load existing topics on mount
  useEffect(() => {
    let isMounted = true;

    async function loadInterests() {
      try {
        const token = await getAuthToken(getToken);
        if (!token) return;

        const res = await fetch(apiUrl('/api/interests'), {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();

        if (isMounted && data && Array.isArray(data.topics)) {
          setTopics(data.topics);
        }
      } catch (err) {
        if (isMounted) setError('Failed to load your interest profile');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadInterests();

    return () => {
      isMounted = false;
    };
  }, [getToken]);

  function handleTopicChange(index, value) {
    const updated = [...topics];
    updated[index].topic = value;
    setTopics(updated);
  }

  function handleWeightChange(index, value) {
    const updated = [...topics];
    updated[index].weight = parseFloat(value);
    setTopics(updated);
  }

  function handleAddTopic() {
    setTopics([...topics, { topic: '', weight: 0.8 }]);
  }

  function handleRemoveTopic(index) {
    const updated = topics.filter((_, i) => i !== index);
    setTopics(updated);
  }

  async function handleSaveChanges() {
    setSaving(true);
    setError(null);
    setSavedNotice(false);

    try {
      // Validate
      const cleanTopics = topics
        .map((t) => ({ topic: t.topic.trim(), weight: Number(t.weight) }))
        .filter((t) => t.topic.length > 0);

      if (cleanTopics.length === 0) {
        throw new Error('Please add at least one topic with description.');
      }

      const token = await getAuthToken(getToken);
      const res = await fetch(apiUrl('/api/interests'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ topics: cleanTopics }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to save changes');
      }

      setTopics(data.topics);
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 2500);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-slate">Loading interest topics...</p>;
  }

  return (
    <div style={{ maxWidth: '720px' }}>
      <h1>Interest Profile</h1>
      <p className="text-slate">
        Define topics and importance weights. High weights prioritize stories in your top 5 digest.
      </p>

      {error && (
        <div
          style={{
            margin: '1.5rem 0',
            padding: '0.85rem 1rem',
            backgroundColor: '#FBEBE8',
            border: '1px solid #E8B4AC',
            borderRadius: '4px',
            color: '#9C382A',
            fontSize: '0.95rem',
          }}
        >
          {error}
        </div>
      )}

      {topics.length === 0 ? (
        <div style={{ margin: '2.5rem 0', padding: '1.5rem', border: '1px dashed var(--color-hairline)', borderRadius: '4px' }}>
          <p style={{ marginBottom: '1rem' }}>
            No topics yet — add one below to start getting a personalized digest.
          </p>
          <button onClick={handleAddTopic} className="btn-secondary" id="btn-add-first-topic">
            Add topic
          </button>
        </div>
      ) : (
        <div className="topic-list" id="topic-list-container">
          {topics.map((t, idx) => (
            <div key={idx} className="topic-row" id={`topic-row-${idx}`}>
              <div className="topic-header-row">
                <input
                  type="text"
                  value={t.topic}
                  placeholder="e.g. LLM reasoning, coding agents, multimodal models..."
                  onChange={(e) => handleTopicChange(idx, e.target.value)}
                  id={`input-topic-${idx}`}
                  aria-label={`Topic ${idx + 1}`}
                />
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
                  min="0.1"
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
          ))}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginTop: '2rem' }}>
        <button
          onClick={handleAddTopic}
          className="btn-secondary btn-full-mobile"
          id="btn-add-topic"
        >
          Add topic
        </button>

        <button
          onClick={handleSaveChanges}
          disabled={saving}
          className="btn-primary btn-full-mobile"
          id="btn-save-changes"
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
