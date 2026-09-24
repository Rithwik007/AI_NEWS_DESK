import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { apiFetch } from '../utils/api';
import { trackEvent } from '../utils/analytics';
import Spinner from '../components/Spinner';

const BOT_USERNAME = 'ai_news_reader0310_bot';

const COUNTRY_CODES = [
  { code: '+91', label: '🇮🇳 India (+91)' },
  { code: '+1', label: '🇺🇸/🇨🇦 USA/Canada (+1)' },
  { code: '+44', label: '🇬🇧 UK (+44)' },
  { code: '+971', label: '🇦🇪 UAE (+971)' },
  { code: '+65', label: '🇸🇬 Singapore (+65)' },
  { code: '+61', label: '🇦🇺 Australia (+61)' },
  { code: '+49', label: '🇩🇪 Germany (+49)' },
  { code: '+33', label: '🇫🇷 France (+33)' },
  { code: '+81', label: '🇯🇵 Japan (+81)' },
];

function maskPhoneNumber(phone) {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length <= 3) return phone;
  const last3 = digits.slice(-3);
  const bullets = '•'.repeat(Math.max(6, digits.length - 3));
  return `${bullets}${last3}`;
}

function parsePhoneNumber(fullPhone) {
  if (!fullPhone) return { countryCode: '+91', nationalNumber: '' };
  const str = String(fullPhone).trim();
  const sorted = [...COUNTRY_CODES].sort((a, b) => b.code.length - a.code.length);
  for (const item of sorted) {
    if (str.startsWith(item.code)) {
      return { countryCode: item.code, nationalNumber: str.slice(item.code.length).trim() };
    }
  }
  if (str.startsWith('+')) {
    return { countryCode: str.slice(0, 3), nationalNumber: str.slice(3).trim() };
  }
  return { countryCode: '+91', nationalNumber: str };
}

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
  const [countryCode, setCountryCode] = useState('+91');
  const [nationalNumber, setNationalNumber] = useState('');
  const [showPhone, setShowPhone] = useState(false);
  const [waSaving, setWaSaving] = useState(false);
  const [waError, setWaError] = useState(null);
  const [waSuccess, setWaSuccess] = useState(null);

  // Telegram states
  const [copiedCode, setCopiedCode] = useState(false);

  const pollTimerRef = useRef(null);
  const phoneTimeoutRef = useRef(null);

  function togglePhoneVisibility() {
    setShowPhone((prev) => {
      const next = !prev;
      if (phoneTimeoutRef.current) clearTimeout(phoneTimeoutRef.current);
      if (next) {
        phoneTimeoutRef.current = setTimeout(() => {
          setShowPhone(false);
        }, 5000);
      }
      return next;
    });
  }

  async function handleCopyCode() {
    if (!codeData?.code) return;
    try {
      await navigator.clipboard.writeText(codeData.code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch (err) {
      console.error('Failed to copy code:', err);
    }
  }

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
          const parsed = parsePhoneNumber(data.phoneNumber);
          setCountryCode(parsed.countryCode);
          setNationalNumber(parsed.nationalNumber);
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
      if (phoneTimeoutRef.current) clearTimeout(phoneTimeoutRef.current);
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
      const cleanDigits = nationalNumber.replace(/\D/g, '');
      if (cleanDigits.length < 5 || cleanDigits.length > 15) {
        throw new Error('Please enter valid phone number digits (no symbols or spaces needed)');
      }
      const fullPhoneNumber = `${countryCode}${cleanDigits}`;

      const data = await apiFetch(
        '/api/whatsapp/register-number',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phoneNumber: fullPhoneNumber }),
        },
        getToken
      );

      if (data && data.success) {
        setWaStatus({
          registered: true,
          phoneNumber: data.phoneNumber,
          isWhatsAppEligible: Boolean(data.isWhatsAppEligible),
          registeredAt: data.registeredAt,
        });
        const parsed = parsePhoneNumber(data.phoneNumber);
        setCountryCode(parsed.countryCode);
        setNationalNumber(parsed.nationalNumber);
        setWaSuccess(
          data.isWhatsAppEligible
            ? "You're on the list! WhatsApp delivery is now active."
            : "This number isn't on the current invite list. You're all set on Telegram — no changes needed."
        );
        trackEvent('whatsapp_number_registered', { eligible: data.isWhatsAppEligible });
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {waStatus.registered && waStatus.isWhatsAppEligible && (
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  padding: '0.2rem 0.5rem',
                  borderRadius: '4px',
                  backgroundColor: 'var(--color-signal)',
                  color: '#FFFFFF',
                }}
              >
                Premium
              </span>
            )}
            <div
              className={`status-pill ${waStatus.registered && waStatus.isWhatsAppEligible ? 'connected' : ''}`}
              id="whatsapp-status-pill"
            >
              <span
                className="status-indicator-dot"
                style={{
                  backgroundColor: waStatus.registered
                    ? waStatus.isWhatsAppEligible
                      ? 'var(--color-signal)'
                      : '#D97706'
                    : 'var(--color-slate)',
                }}
              />
              <span>
                {!waStatus.registered
                  ? 'Not linked'
                  : waStatus.isWhatsAppEligible
                  ? 'Connected'
                  : 'Waitlist'}
              </span>
            </div>
          </div>
        </div>

        {/* Explanatory copy (Part A.1) */}
        <div
          style={{
            padding: '0.85rem 1rem',
            backgroundColor: '#FAF9F5',
            border: '1px solid var(--color-hairline)',
            borderRadius: '6px',
            fontSize: '0.88rem',
            color: 'var(--color-slate)',
            marginBottom: '1.25rem',
            lineHeight: 1.5,
          }}
        >
          ℹ️ <strong>Invite list:</strong> WhatsApp delivery is currently available to a small invite list. Enter your number to check eligibility — if you&apos;re not on the list, you&apos;ll continue receiving your digest via Telegram, no action needed.
        </div>

        {/* Post-submission feedback (Part A.2) */}
        {waSuccess && (
          <div
            style={{
              padding: '0.75rem 1rem',
              backgroundColor: waStatus.isWhatsAppEligible
                ? 'rgba(47, 111, 98, 0.1)'
                : '#FAF9F5',
              border: waStatus.isWhatsAppEligible
                ? '1px solid var(--color-signal)'
                : '1px solid var(--color-hairline)',
              borderRadius: '6px',
              color: waStatus.isWhatsAppEligible
                ? 'var(--color-signal)'
                : 'var(--color-ink)',
              fontSize: '0.9rem',
              marginBottom: '1rem',
              lineHeight: 1.4,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <span>{waStatus.isWhatsAppEligible ? '✓' : 'ℹ️'}</span>
            <span>{waSuccess}</span>
          </div>
        )}

        {waError && (
          <div
            style={{
              padding: '0.75rem 1rem',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid #EF4444',
              borderRadius: '6px',
              color: '#B91C1C',
              fontSize: '0.9rem',
              marginBottom: '1rem',
            }}
          >
            {waError}
          </div>
        )}

        {/* Two-part phone input: Country Code + National Number (Part B) */}
        <form onSubmit={handleSaveWhatsApp} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <label htmlFor="whatsapp-phone-input" style={{ display: 'block', fontSize: '0.85rem', color: 'var(--color-slate)' }}>
            WhatsApp phone number (select country &amp; enter digits)
          </label>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <select
              id="whatsapp-country-code"
              value={countryCode}
              onChange={(e) => setCountryCode(e.target.value)}
              style={{
                padding: '0.6rem 0.75rem',
                border: '1px solid var(--color-hairline)',
                borderRadius: '4px',
                fontSize: '0.92rem',
                backgroundColor: '#FAF9F5',
                color: 'var(--color-ink)',
                minWidth: '150px',
                cursor: 'pointer',
              }}
            >
              {COUNTRY_CODES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
            <input
              id="whatsapp-phone-input"
              type="tel"
              inputMode="numeric"
              value={nationalNumber}
              onChange={(e) => setNationalNumber(e.target.value)}
              placeholder="98765 43210"
              style={{
                flex: '1',
                minWidth: '160px',
                padding: '0.6rem 0.85rem',
                border: '1px solid var(--color-hairline)',
                borderRadius: '4px',
                fontSize: '0.95rem',
                backgroundColor: '#FAF9F5',
                color: 'var(--color-ink)',
              }}
              required
            />
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

        {/* Masked registered number with Show/Hide toggle (Part C) */}
        {waStatus.registered && (
          <div style={{ marginTop: '1rem', borderTop: '1px solid var(--color-hairline)', paddingTop: '0.85rem' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.88rem' }}>
              <span className="text-slate">Registered number:</span>
              <strong style={{ fontFamily: 'monospace', letterSpacing: '0.05em' }}>
                {showPhone ? waStatus.phoneNumber : maskPhoneNumber(waStatus.phoneNumber)}
              </strong>
              <button
                type="button"
                onClick={togglePhoneVisibility}
                aria-label={showPhone ? 'Mask phone number' : 'Reveal phone number'}
                title={showPhone ? 'Mask phone number' : 'Reveal phone number'}
                className="btn-secondary"
                id="btn-toggle-phone-mask"
                style={{
                  padding: '0.15rem 0.45rem',
                  fontSize: '0.75rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                  lineHeight: 1.2,
                }}
              >
                {showPhone ? 'Hide' : 'Show'}
              </button>
            </div>

            {waStatus.isWhatsAppEligible ? (
              <p className="text-slate" style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>
                You will receive morning (8:00 AM) &amp; evening (6:00 PM) WhatsApp digest templates. Reply <strong>digest</strong> anytime for full articles.
              </p>
            ) : (
              <p className="text-slate" style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>
                Digests will continue arriving via Telegram. We will notify you when WhatsApp expands to more users.
              </p>
            )}
          </div>
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                      <div className="code-display" id="display-link-code">
                        {codeData.code}
                      </div>
                      <button
                        type="button"
                        onClick={handleCopyCode}
                        className="btn-secondary"
                        id="btn-copy-code"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                          padding: '0.55rem 0.85rem',
                          fontSize: '0.85rem',
                        }}
                      >
                        {copiedCode ? (
                          <>
                            <span style={{ color: 'var(--color-signal)' }}>✓</span>
                            <span>Copied!</span>
                          </>
                        ) : (
                          <>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                            </svg>
                            <span>Copy code</span>
                          </>
                        )}
                      </button>
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
