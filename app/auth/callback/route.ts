import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') || '/';

  if (code) {
    const response = NextResponse.redirect(new URL(next, request.url));

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return request.cookies.get(name)?.value;
          },
          set(name: string, value: string, options: CookieOptions) {
            response.cookies.set({ name, value, ...options });
          },
          remove(name: string, options: CookieOptions) {
            response.cookies.set({ name, value: '', ...options });
          },
        },
      },
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error('[auth/callback] Exchange error:', error.message);
      return NextResponse.redirect(new URL('/?error=auth_callback_failed', request.url));
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: userData } = await supabase
        .from('users')
        .select('full_name')
        .eq('supabase_uid', user.id)
        .maybeSingle();

      if (!userData?.full_name) {
        return NextResponse.redirect(new URL('/auth/complete-profile', request.url));
      }
    }
  }

  return NextResponse.redirect(new URL('/', request.url));
}
