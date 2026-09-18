import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { apiFetch } from '../utils/api';
import { trackEvent } from '../utils/analytics';
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
  const [lastAction, setLastAction] = useState('check'); // 'check' | 'generate'

  // WhatsApp states
  const [waStatus, setWaStatus] = useState({ registered: false, phoneNumber: null, registeredAt: null });
  const [waPhone, setWaPhone] = useState('');
  const [waSaving, setWaSaving] = useState(false);
  const [waError, setWaError] = useState(null);
  const [waSuccess, setWaSuccess] = useState(null);

  const pollTimerRef = useRef(null);

  // Check initial Telegram link status
  const checkStatus = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    setLastAction('check');
    try {
      const data = await apiFetch('/api/telegram/status', {}, getToken);
      if (data) {
        setStatus(data);
        if (data.linked) {
          setTelegramLinked?.(true);
          setShowFlow(false);
        } else {
          setShowFlow(true);
        }
      }
    } catch (err) {
      setError(err.message || 'Failed to check Telegram connection status');
    } finally {
      setLoading(false);
    }
  }, [getToken, setTelegramLinked]);

  // Check WhatsApp status
  const checkWhatsAppStatus = React.useCallback(async () => {
    try {
      const data = await apiFetch('/api/whatsapp/status', {}, getToken);
      if (data) {
        setWaStatus(data);
        if (data.phoneNumber) {
          setWaPhone(data.phoneNumber);
        }
      }
    } catch (err) {
      console.error('[WhatsApp] Status check failed:', err);
    }
  }, [getToken]);

  useEffect(() => {
    checkStatus();
    checkWhatsAppStatus();

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [checkStatus, checkWhatsAppStatus]);

  // Polling loop while waiting for Telegram link confirmation
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
          trackEvent('telegram_linked', { chatId: data.telegramChatId });
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
    setLastAction('generate');

    const attemptGenerate = async () => {
      const data = await apiFetch('/api/telegram/link-code', { method: 'POST' }, getToken);
      if (!data || !data.success) {
        throw new Error(data?.message || 'Failed to generate code');
      }
      return data;
    };

    try {
      let data;
      try {
        data = await attemptGenerate();
      } catch (firstErr) {
        if (firstErr.status >= 500 || firstErr.isNetwork) {
          await new Promise((r) => setTimeout(r, 2000));
          data = await attemptGenerate();
        } else {
          throw firstErr;
        }
      }
      setCodeData({ code: data.code, expiry: data.expiry });
      trackEvent('telegram_code_generated');
    } catch (err) {
      setError(err.message || "Couldn't generate code — try again");
    } finally {
      setGenerating(false);
    }
  }

  async function handleSaveWhatsApp(e) {
    e.preventDefault();
    setWaSaving(true);
    setWaError(null);
    setWaSuccess(null);

    try {
      const data = await apiFetch(
        '/api/whatsapp/register-number',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phoneNumber: waPhone }),
        },
        getToken
      );

      if (data && data.success) {
        setWaStatus({
          registered: true,
          phoneNumber: data.phoneNumber,
          registeredAt: data.registeredAt,
        });
        setWaPhone(data.phoneNumber);
        setWaSuccess('WhatsApp number saved! You will receive scheduled digest notifications on WhatsApp.');
        trackEvent('whatsapp_number_registered');
      } else {
        throw new Error(data?.message || 'Failed to register WhatsApp number');
      }
    } catch (err) {
      setWaError(err.message || 'Failed to save WhatsApp number');
    } finally {
      setWaSaving(false);
    }
  }

  if (loading) {
    return (
      <div style={{ maxWidth: '640px' }}>
        <h1>Delivery Channels</h1>
        <div className="loading-container" id="telegram-loading-container">
          <Spinner size="md" />
          <span>Checking connection status...</span>
        </div>
      </div>
    );
  }

  const deepLink = codeData ? `https://t.me/${BOT_USERNAME}?start=${codeData.code}` : null;

  return (
    <div style={{ maxWidth: '680px' }}>
      <h1>Delivery Channels</h1>
      <p className="text-slate" style={{ marginBottom: '2rem' }}>
        Connect your preferred messaging channels to receive curated AI news digests and interact with the AI assistant.
      </p>

      {/* WhatsApp Channel Card */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid var(--color-hairline)',
          borderRadius: '8px',
          padding: '1.75rem',
          marginBottom: '2rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>WhatsApp Delivery</h2>
            <p className="text-slate" style={{ fontSize: '0.9rem' }}>
              Receive short scheduled template alerts. Reply <strong>digest</strong> for full articles.
            </p>
          </div>
          <div
            className={`status-pill ${waStatus.registered ? 'connected' : ''}`}
            id="whatsapp-status-pill"
          >
            <span className="status-indicator-dot" />
            <span>{waStatus.registered ? 'Connected' : 'Not linked'}</span>
          </div>
        </div>

        {waSuccess && (
          <div
            style={{
              padding: '0.75rem 1rem',
              backgroundColor: 'rgba(47, 111, 98, 0.1)',
              border: '1px solid var(--color-signal)',
              borderRadius: '4px',
              color: 'var(--color-signal)',
              fontSize: '0.9rem',
              marginBottom: '1rem',
            }}
          >
            ✓ {waSuccess}
          </div>
        )}

        {waError && (
          <div
            style={{
              padding: '0.75rem 1rem',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid #EF4444',
              borderRadius: '4px',
              color: '#B91C1C',
              fontSize: '0.9rem',
              marginBottom: '1rem',
            }}
          >
            {waError}
          </div>
        )}

        <form onSubmit={handleSaveWhatsApp} style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: '1', minWidth: '220px' }}>
            <label htmlFor="whatsapp-phone-input" style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.35rem', color: 'var(--color-slate)' }}>
              Phone number (E.164 format with country code)
            </label>
            <input
              id="whatsapp-phone-input"
              type="tel"
              value={waPhone}
              onChange={(e) => setWaPhone(e.target.value)}
              placeholder="+919876543210"
              style={{
                width: '100%',
                padding: '0.6rem 0.85rem',
                border: '1px solid var(--color-hairline)',
                borderRadius: '4px',
                fontSize: '0.95rem',
                backgroundColor: '#FAF9F5',
                color: 'var(--color-ink)',
              }}
              required
            />
          </div>
          <div style={{ alignSelf: 'flex-end' }}>
            <button
              type="submit"
              disabled={waSaving}
              className="btn-primary"
              id="btn-save-whatsapp"
              style={{ padding: '0.6rem 1.25rem' }}
            >
              {waSaving ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Spinner size="sm" style={{ borderTopColor: '#FFFFFF' }} />
                  Saving...
                </span>
              ) : waStatus.registered ? (
                'Update Number'
              ) : (
                'Register Number'
              )}
            </button>
          </div>
        </form>

        {waStatus.registered && (
          <p className="text-slate" style={{ fontSize: '0.85rem', marginTop: '0.75rem' }}>
            Registered number: <strong>{waStatus.phoneNumber}</strong>. When a digest arrives, reply with &ldquo;digest&rdquo; or any question.
          </p>
        )}
      </div>

      {/* Telegram Channel Card */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid var(--color-hairline)',
          borderRadius: '8px',
          padding: '1.75rem',
          marginBottom: '2rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>Telegram Bot</h2>
            <p className="text-slate" style={{ fontSize: '0.9rem' }}>
              Full articles delivered directly in Telegram chat.
            </p>
          </div>
          <div
            className={`status-pill ${status.linked ? 'connected' : ''}`}
            id="telegram-status-pill"
          >
            <span className="status-indicator-dot" />
            <span>{status.linked ? 'Connected' : 'Not linked'}</span>
          </div>
        </div>

        {error && (
          <div
            style={{
              padding: '0.75rem 1rem',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid #EF4444',
              borderRadius: '4px',
              color: '#B91C1C',
              fontSize: '0.9rem',
              marginBottom: '1rem',
            }}
          >
            {error}
          </div>
        )}

        {status.linked && !showFlow ? (
          <div>
            <p style={{ marginBottom: '1.25rem', fontSize: '0.95rem' }}>
              Connected chat ID: <strong>{status.telegramChatId}</strong>. Digests deliver automatically at 8:00 AM &amp; 6:00 PM IST.
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
        ) : (
          <div className="step-list">
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
        )}
      </div>
    </div>
  );
}
