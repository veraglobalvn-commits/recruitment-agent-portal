'use client';

import { useState, useEffect } from 'react';
import { createSupabaseClient } from '@/lib/supabase';

type Step = 'idle' | 'waiting' | 'otp' | 'done' | 'error';

interface Props {
  /** Pass true when the user already has telegram_user_id set */
  isLinked?: boolean;
  /** Called after successful link so parent can refresh state */
  onLinked?: () => void;
  /** Render as compact banner (dashboard) or full card (profile) */
  variant?: 'banner' | 'card';
}

export default function TelegramConnectSection({
  isLinked = false,
  onLinked,
  variant = 'card',
}: Props) {
  const [step, setStep]         = useState<Step>('idle');
  const [deepLink, setDeepLink] = useState<string>('');
  const [otp, setOtp]           = useState<string>('');
  const [otpExpiry, setOtpExpiry] = useState<number>(0); // unix seconds
  const [countdown, setCountdown] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState<string>('');

  // Countdown timer for OTP
  useEffect(() => {
    if (step !== 'otp' || !otpExpiry) return;
    const interval = setInterval(() => {
      const remaining = Math.max(0, otpExpiry - Math.floor(Date.now() / 1000));
      setCountdown(remaining);
      if (remaining === 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [step, otpExpiry]);

  if (isLinked) {
    if (variant === 'banner') return null;
    return (
      <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
        <span className="text-base">✅</span>
        <span>Telegram connected. You can use the bot to submit candidates.</span>
      </div>
    );
  }

  async function getAccessToken(): Promise<string | null> {
    const supabase = createSupabaseClient();
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }

  async function handleOpenTelegram() {
    setStep('waiting');
    setErrorMsg('');
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Not authenticated');

      const res = await fetch('/api/telegram/link', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'generate-token' }),
      });
      const data = await res.json();
      if (!res.ok || !data.deep_link) throw new Error(data.error ?? 'Failed to generate link');

      setDeepLink(data.deep_link);
      window.open(data.deep_link, '_blank');
    } catch (err) {
      setStep('error');
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    }
  }

  async function handleShowOtp() {
    setErrorMsg('');
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Not authenticated');

      const res = await fetch('/api/telegram/link', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'generate-otp' }),
      });
      const data = await res.json();
      if (!res.ok || !data.otp) throw new Error(data.error ?? 'Failed to generate code');

      setOtp(data.otp);
      setOtpExpiry(Math.floor(Date.now() / 1000) + data.expires_in_minutes * 60);
      setCountdown(data.expires_in_minutes * 60);
      setStep('otp');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    }
  }

  function handleDone() {
    setStep('done');
    onLinked?.();
  }

  function handleRetry() {
    setStep('idle');
    setDeepLink('');
    setOtp('');
    setErrorMsg('');
  }

  const fmtCountdown = (s: number) =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  // ---- Render: banner variant (compact, shown on dashboard) ----
  if (variant === 'banner') {
    return (
      <div className="flex items-center justify-between gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base flex-shrink-0">📱</span>
          <p className="text-sm text-blue-800 font-medium truncate">
            Connect Telegram to submit candidates via bot
          </p>
        </div>
        <button
          onClick={handleOpenTelegram}
          className="flex-shrink-0 text-sm font-semibold text-blue-700 bg-white border border-blue-300 rounded-lg px-3 py-1.5 hover:bg-blue-50 transition-colors whitespace-nowrap"
        >
          Connect →
        </button>
      </div>
    );
  }

  // ---- Render: card variant (full, shown on profile) ----
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
      <div>
        <h3 className="font-semibold text-gray-800">Telegram</h3>
        <p className="text-sm text-gray-500 mt-0.5">
          Connect your Telegram account to add candidates via bot.
        </p>
      </div>

      {/* Step: idle */}
      {step === 'idle' && (
        <div className="space-y-3">
          <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm text-gray-700">
            <p className="font-medium text-gray-800">How it works:</p>
            <ol className="space-y-1 list-decimal list-inside">
              <li>Tap <strong>Open Telegram</strong> below</li>
              <li>Press <strong>START</strong> when the bot opens</li>
              <li>Come back here — you&apos;re done!</li>
            </ol>
          </div>
          <button
            onClick={handleOpenTelegram}
            className="w-full bg-blue-600 text-white font-semibold rounded-xl py-3 hover:bg-blue-700 active:bg-blue-800 transition-colors text-sm"
          >
            📲 Open Telegram
          </button>
          <button
            onClick={handleShowOtp}
            className="w-full text-sm text-gray-500 hover:text-gray-700 py-1 transition-colors"
          >
            Having trouble? Use a code instead
          </button>
        </div>
      )}

      {/* Step: waiting (link opened, waiting for bot confirmation) */}
      {step === 'waiting' && (
        <div className="space-y-3 text-sm">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-1">
            <p className="font-medium text-blue-800">Waiting for Telegram…</p>
            <p className="text-blue-700">
              Press <strong>START</strong> in the bot, then come back and tap confirm below.
            </p>
          </div>
          {deepLink && (
            <a
              href={deepLink}
              target="_blank"
              rel="noreferrer"
              className="block text-center text-blue-600 underline text-xs"
            >
              Link not opening? Tap here again
            </a>
          )}
          <div className="flex gap-2">
            <button
              onClick={handleDone}
              className="flex-1 bg-green-600 text-white font-semibold rounded-xl py-3 hover:bg-green-700 transition-colors text-sm"
            >
              ✓ I pressed START — done!
            </button>
            <button
              onClick={handleRetry}
              className="px-4 text-gray-500 hover:text-gray-700 text-sm border border-gray-200 rounded-xl transition-colors"
            >
              Back
            </button>
          </div>
          <button
            onClick={handleShowOtp}
            className="w-full text-sm text-gray-400 hover:text-gray-600 py-1 transition-colors"
          >
            Having trouble? Use a code instead
          </button>
        </div>
      )}

      {/* Step: OTP fallback */}
      {step === 'otp' && (
        <div className="space-y-4 text-sm">
          <div className="bg-gray-50 rounded-xl p-4 space-y-3">
            <p className="font-medium text-gray-800">Your one-time code:</p>
            <div className="flex justify-center">
              <span className="tracking-[0.35em] text-3xl font-bold text-gray-900 font-mono">
                {otp}
              </span>
            </div>
            <p className="text-gray-600 text-center">
              In the bot, send:{' '}
              <code className="bg-white border border-gray-200 rounded px-1.5 py-0.5 text-xs font-mono">
                /link {otp}
              </code>
            </p>
            {countdown > 0 ? (
              <p className="text-center text-gray-400 text-xs">
                Code expires in {fmtCountdown(countdown)}
              </p>
            ) : (
              <p className="text-center text-red-500 text-xs font-medium">
                Code expired.{' '}
                <button onClick={handleShowOtp} className="underline">
                  Get a new one
                </button>
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleDone}
              className="flex-1 bg-green-600 text-white font-semibold rounded-xl py-3 hover:bg-green-700 transition-colors text-sm"
            >
              ✓ Done — bot confirmed!
            </button>
            <button
              onClick={handleRetry}
              className="px-4 text-gray-500 hover:text-gray-700 text-sm border border-gray-200 rounded-xl transition-colors"
            >
              Back
            </button>
          </div>
        </div>
      )}

      {/* Step: done */}
      {step === 'done' && (
        <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
          <span className="text-base">✅</span>
          <span>Telegram connected! Type <strong>/add</strong> in the bot to get started.</span>
        </div>
      )}

      {/* Step: error */}
      {step === 'error' && (
        <div className="space-y-3">
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            {errorMsg || 'Something went wrong. Please try again.'}
          </div>
          <button
            onClick={handleRetry}
            className="w-full text-sm text-gray-600 border border-gray-200 rounded-xl py-2.5 hover:bg-gray-50 transition-colors"
          >
            Try again
          </button>
        </div>
      )}

      {/* Inline error (non-fatal) */}
      {errorMsg && step !== 'error' && (
        <p className="text-xs text-red-600">{errorMsg}</p>
      )}
    </div>
  );
}
