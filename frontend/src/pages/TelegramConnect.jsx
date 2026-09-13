import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { apiFetch } from '../utils/api';
import Spinner from '../components/Spinner';

const BOT_USERNAME = 'ai_news_reader0310_bot';

export default function TelegramConnect() {
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const { setTelegramLinked } = useOutletContext() || {};

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState({ linked: false, telegramChatId: null, linkedAt: null });
  const [codeData, setCodeData] = useState(null); // { code, expiry }
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [showFlow, setShowFlow] = useState(false);

  const pollTimerRef = useRef(null);

  // Check initial link status on page load
  useEffect(() => {
    let isMounted = true;

    async function checkStatus() {
      try {
        const data = await apiFetch('/api/telegram/status', {}, getToken);
        if (isMounted && data) {
          setStatus(data);
          if (data.linked) {
            setTelegramLinked?.(true);
            setShowFlow(false);
          } else {
            setShowFlow(true);
          }
        }
      } catch (err) {
        if (isMounted) setError(err.message || 'Failed to check Telegram connection status');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    checkStatus();

    return () => {
      isMounted = false;
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [getToken, setTelegramLinked]);

  // Polling loop while waiting for link confirmation
  useEffect(() => {
    if (!codeData || status.linked) {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      return;
    }

    pollTimerRef.current = setInterval(async () => {
      try {
        const data = await apiFetch('/api/telegram/status', {}, getToken);
        if (data && data.linked) {
          setStatus(data);
          setTelegramLinked?.(true);
          setShowFlow(false);
          clearInterval(pollTimerRef.current);
        }
      } catch (err) {
        console.error('[TelegramConnect] Polling check failed:', err);
      }
    }, 3000);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [codeData, status.linked, getToken, setTelegramLinked]);

  async function handleGenerateCode() {
    setGenerating(true);
    setError(null);
    try {
      const data = await apiFetch('/api/telegram/link-code', { method: 'POST' }, getToken);
      if (!data || !data.success) {
        throw new Error(data?.message || 'Failed to generate code');
      }
      setCodeData({ code: data.code, expiry: data.expiry });
    } catch (err) {
      setError(err.message || "Couldn't generate code — try again");
    } finally {
      setGenerating(false);
    }
  }

  if (loading) {
    return (
      <div style={{ maxWidth: '640px' }}>
        <h1>Telegram Channel</h1>
        <div className="loading-container" id="telegram-loading-container">
          <Spinner size="md" />
          <span>Checking connection status...</span>
        </div>
      </div>
    );
  }

  // State A: Already Connected State (or newly confirmed)
  if (status.linked && !showFlow) {
    return (
      <div style={{ maxWidth: '640px' }}>
        <h1>Telegram Channel</h1>
        <p className="text-slate" style={{ marginBottom: '2rem' }}>
          Your daily digests are delivered to your Telegram chat.
        </p>

        <div
          className="status-pill connected"
          style={{ marginBottom: '1.5rem', padding: '0.6rem 1.2rem' }}
          id="telegram-connected-pill"
        >
          <span className="status-indicator-dot" />
          <span>Telegram connected (Chat ID: {status.telegramChatId})</span>
        </div>

        <p style={{ marginBottom: '2rem', fontSize: '0.95rem' }}>
          Morning digest arrives at 8:00 AM IST. Evening incremental digest arrives at 6:00 PM IST.
        </p>

        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => navigate('/interests')}
            className="btn-primary"
            id="btn-continue-interests"
          >
            Manage interests
          </button>
          <button
            onClick={() => {
              setShowFlow(true);
              setCodeData(null);
            }}
            className="btn-secondary"
            id="btn-relink-telegram"
          >
            Relink Telegram
          </button>
        </div>
      </div>
    );
  }

  // State B: Numbered 3-step Connection Sequence
  const deepLink = codeData ? `https://t.me/${BOT_USERNAME}?start=${codeData.code}` : null;

  return (
    <div style={{ maxWidth: '640px' }}>
      <h1>Connect Telegram</h1>
      <p className="text-slate">
        Link your Telegram account to receive personalized daily AI news digests.
      </p>

      {error && (
        <div className="error-banner" role="alert" id="telegram-error-banner">
          <span className="error-banner-text">{error}</span>
          <button onClick={handleGenerateCode} className="btn-retry" id="btn-retry-telegram">
            Try again
          </button>
        </div>
      )}

      <div className="step-sequence">
        {/* Step 1: Generate Code */}
        <div className="step-item">
          <div className="step-number">1</div>
          <div className="step-body">
            <h3>Generate linking code</h3>
            <p>Generate a one-time 10-minute code tied to your account.</p>

            {!codeData ? (
              <button
                onClick={handleGenerateCode}
                disabled={generating}
                className="btn-primary btn-full-mobile"
                id="btn-generate-code"
              >
                {generating ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Spinner size="sm" style={{ borderTopColor: '#FFFFFF' }} />
                    Generating...
                  </span>
                ) : (
                  'Generate code'
                )}
              </button>
            ) : (
              <div>
                <div className="code-display" id="display-link-code">
                  {codeData.code}
                </div>
                <div style={{ marginTop: '0.75rem' }}>
                  <a
                    href={deepLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-primary btn-full-mobile"
                    style={{ textDecoration: 'none' }}
                    id="link-open-telegram"
                  >
                    Open in Telegram
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Step 2: Message the bot */}
        <div className="step-item">
          <div className="step-number">2</div>
          <div className="step-body">
            <h3>Message the bot</h3>
            <p>
              Tap the button above, or open{' '}
              <a
                href={`https://t.me/${BOT_USERNAME}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--color-ink)', fontWeight: 600 }}
              >
                @{BOT_USERNAME}
              </a>{' '}
              in Telegram and send:
            </p>
            <div
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.95rem',
                backgroundColor: '#FAF9F5',
                padding: '0.5rem 0.75rem',
                borderRadius: '4px',
                border: '1px solid var(--color-hairline)',
                display: 'inline-block',
              }}
            >
              /start {codeData ? codeData.code : 'CODE'}
            </div>
          </div>
        </div>

        {/* Step 3: Confirmation */}
        <div className="step-item">
          <div className="step-number">3</div>
          <div className="step-body">
            <h3>Confirmation</h3>
            {status.linked ? (
              <div>
                <div className="status-pill connected" style={{ marginBottom: '1rem' }}>
                  <span className="status-indicator-dot" />
                  <span>Telegram connected</span>
                </div>
                <button
                  onClick={() => navigate('/interests')}
                  className="btn-primary"
                  id="btn-confirm-continue"
                >
                  Continue
                </button>
              </div>
            ) : codeData ? (
              <div id="telegram-polling-container">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <span className="pulse-dot" />
                  <span style={{ color: 'var(--color-ink)', fontWeight: 500 }}>
                    Waiting for message from Telegram...
                  </span>
                </div>
                <p className="text-slate" style={{ fontSize: '0.85rem', marginTop: '0.35rem' }}>
                  Actively listening for /start {codeData.code} (checking every 3s)
                </p>
              </div>
            ) : (
              <p className="text-slate">
                Complete steps 1 and 2 to confirm connection.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
