'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createSupabaseClient } from '@/lib/supabase';

type Status = 'loading' | 'confirm' | 'not_logged_in' | 'invalid' | 'success' | 'error';

function LinkTelegramContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus]     = useState<Status>('loading');
  const [confirming, setConfirming] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const tgId = searchParams.get('tg_id');
  const ts   = searchParams.get('ts');
  const sig  = searchParams.get('sig');

  useEffect(() => {
    if (!tgId || !ts || !sig) {
      setStatus('invalid');
      return;
    }

    (async () => {
      const supabase = createSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        // Store the target URL in sessionStorage so we can resume after login
        sessionStorage.setItem('tg_link_pending', window.location.href);
        setStatus('not_logged_in');
        return;
      }

      setStatus('confirm');
    })();
  }, [tgId, ts, sig]);

  // After login, check if there's a pending link URL
  useEffect(() => {
    const pending = sessionStorage.getItem('tg_link_pending');
    if (pending && status === 'confirm') {
      sessionStorage.removeItem('tg_link_pending');
    }
  }, [status]);

  async function handleConfirm() {
    setConfirming(true);
    setErrorMsg('');
    try {
      const supabase = createSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setStatus('not_logged_in'); return; }

      const res = await fetch('/api/telegram/link', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'confirm-l2',
          tg_id: Number(tgId),
          ts: Number(ts),
          sig,
        }),
      });

      const data = await res.json();

      if (res.status === 403) {
        setStatus('invalid');
        return;
      }
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong');

      setStatus('success');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setStatus('error');
    } finally {
      setConfirming(false);
    }
  }

  // ---- Render ----
  return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center px-4 pt-16">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-5">

        {/* Loading */}
        {status === 'loading' && (
          <div className="text-center text-gray-400 py-4 animate-pulse">Checking…</div>
        )}

        {/* Not logged in */}
        {status === 'not_logged_in' && (
          <>
            <div className="text-center">
              <div className="text-4xl mb-3">🔐</div>
              <h1 className="text-lg font-bold text-gray-800">Log in first</h1>
              <p className="text-sm text-gray-500 mt-2">
                Sign in to your portal account, then tap this link again to connect your Telegram.
              </p>
            </div>
            <button
              onClick={() => router.push('/')}
              className="w-full bg-blue-600 text-white font-semibold rounded-xl py-3 text-sm hover:bg-blue-700 transition-colors"
            >
              Go to sign in
            </button>
          </>
        )}

        {/* Confirm */}
        {status === 'confirm' && (
          <>
            <div className="text-center">
              <div className="text-4xl mb-3">📱</div>
              <h1 className="text-lg font-bold text-gray-800">Link your Telegram account</h1>
              <p className="text-sm text-gray-500 mt-2">
                Your Telegram will be connected to your portal account. You&apos;ll be able to add candidates directly from the bot.
              </p>
            </div>
            {errorMsg && (
              <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{errorMsg}</p>
            )}
            <button
              onClick={handleConfirm}
              disabled={confirming}
              className="w-full bg-blue-600 text-white font-semibold rounded-xl py-3 text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {confirming ? 'Connecting…' : '✓ Yes, link my accounts'}
            </button>
            <p className="text-xs text-gray-400 text-center">
              Not you? Do not tap confirm. Contact your admin if something looks wrong.
            </p>
          </>
        )}

        {/* Success */}
        {status === 'success' && (
          <>
            <div className="text-center">
              <div className="text-4xl mb-3">✅</div>
              <h1 className="text-lg font-bold text-gray-800">Telegram connected!</h1>
              <p className="text-sm text-gray-500 mt-2">
                Go back to the bot and type <strong>/add</strong> to start adding candidates.
              </p>
            </div>
            <button
              onClick={() => router.push('/')}
              className="w-full border border-gray-200 text-gray-600 font-medium rounded-xl py-3 text-sm hover:bg-gray-50 transition-colors"
            >
              Back to portal
            </button>
          </>
        )}

        {/* Invalid signature / bad params */}
        {status === 'invalid' && (
          <>
            <div className="text-center">
              <div className="text-4xl mb-3">❌</div>
              <h1 className="text-lg font-bold text-gray-800">Link not valid</h1>
              <p className="text-sm text-gray-500 mt-2">
                This link has expired or is not valid. Go back to the bot and try again — it will send you a new link.
              </p>
            </div>
            <button
              onClick={() => router.push('/')}
              className="w-full border border-gray-200 text-gray-600 font-medium rounded-xl py-3 text-sm hover:bg-gray-50 transition-colors"
            >
              Back to portal
            </button>
          </>
        )}

        {/* Generic error */}
        {status === 'error' && (
          <>
            <div className="text-center">
              <div className="text-4xl mb-3">⚠️</div>
              <h1 className="text-lg font-bold text-gray-800">Something went wrong</h1>
              <p className="text-sm text-gray-500 mt-2">{errorMsg}</p>
            </div>
            <button
              onClick={() => setStatus('confirm')}
              className="w-full bg-blue-600 text-white font-semibold rounded-xl py-3 text-sm hover:bg-blue-700 transition-colors"
            >
              Try again
            </button>
          </>
        )}

      </div>
    </div>
  );
}

export default function LinkTelegramPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-pulse text-gray-400">Loading…</div>
      </div>
    }>
      <LinkTelegramContent />
    </Suspense>
  );
}
