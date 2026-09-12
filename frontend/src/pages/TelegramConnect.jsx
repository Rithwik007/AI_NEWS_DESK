import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { getAuthToken } from '../utils/auth';
import { apiUrl } from '../utils/api';

const BOT_USERNAME = 'ai_news_reader0310_bot';

export default function TelegramConnect() {
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const { telegramLinked, setTelegramLinked } = useOutletContext() || {};

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
        const token = await getAuthToken(getToken);
        if (!token) return;

        const res = await fetch(apiUrl('/api/telegram/status'), {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();

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
        if (isMounted) setError('Failed to check Telegram connection status');
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
        const token = await getAuthToken(getToken);
        if (!token) return;

        const res = await fetch(apiUrl('/api/telegram/status'), {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();

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
      const token = await getAuthToken(getToken);
      const res = await fetch(apiUrl('/api/telegram/link-code'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to generate code');
      }
      setCodeData({ code: data.code, expiry: data.expiry });
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  if (loading) {
    return <p className="text-slate">Checking connection status...</p>;
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
                {generating ? 'Generating...' : 'Generate code'}
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
            ) : (
              <p className="text-slate">
                {codeData
                  ? 'Waiting for message from Telegram...'
                  : 'Complete steps 1 and 2 to confirm connection.'}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
