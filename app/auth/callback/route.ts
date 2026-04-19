import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { type NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next');

  if (!code) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  let response = NextResponse.redirect(new URL('/', request.url));

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value: '', ...options });
        },
      },
    },
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error('[auth/callback] Exchange error:', error.message);
    return NextResponse.redirect(new URL('/?error=auth_failed', request.url));
  }

  // Use service role to bypass RLS for user lookup
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: userData } = await adminClient
      .from('users')
      .select('full_name, role')
      .eq('supabase_uid', user.id)
      .maybeSingle();

    if (!userData?.full_name) {
      response = NextResponse.redirect(new URL('/auth/complete-profile', request.url));
    } else if (next) {
      response = NextResponse.redirect(new URL(next, request.url));
    } else if (userData.role === 'admin') {
      response = NextResponse.redirect(new URL('/admin', request.url));
    } else {
      response = NextResponse.redirect(new URL('/', request.url));
    }
  }

  return response;
}
