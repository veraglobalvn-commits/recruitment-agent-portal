import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { type NextRequest, NextResponse } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: { headers: request.headers },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options })
          response = NextResponse.next({
            request: { headers: request.headers },
          })
          response.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options })
          response = NextResponse.next({
            request: { headers: request.headers },
          })
          response.cookies.set({ name, value: '', ...options })
        },
      },
    },
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  if (!user && (pathname.startsWith('/order') || pathname.startsWith('/admin'))) {
    const loginUrl = new URL('/', request.url)
    return NextResponse.redirect(loginUrl)
  }

  if (user && (pathname.startsWith('/admin') || pathname.startsWith('/order'))) {
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    const { data: agent } = await adminClient
      .from('users')
      .select('role, status')
      .eq('supabase_uid', user.id)
      .maybeSingle()

    if (!agent) {
      return NextResponse.redirect(new URL('/', request.url))
    }

    if (agent.status === 'pending') {
      return NextResponse.redirect(new URL('/auth/pending', request.url))
    }

    if (agent.status !== 'active') {
      return NextResponse.redirect(new URL('/', request.url))
    }

    const adminRoles = ['admin', 'operator', 'read_only']
    if (pathname.startsWith('/admin') && !adminRoles.includes(agent.role)) {
      return NextResponse.redirect(new URL('/', request.url))
    }
  }

  return response
}

export const config = {
  matcher: ['/order/:path*', '/admin/:path*'],
}
