/**
 * 문지기 — 로그인 쿠키가 없으면 로그인 화면으로 보낸다.
 *
 * ★ 여기서는 쿠키가 **있는지만** 본다. 진짜 검증은 Node 라우트에서 한다.
 *   미들웨어는 Edge에서 돌아 firebase-admin(서비스 계정 키·암호 검증)을 쓸 수 없다.
 *   그래서 이 문은 '길 안내'이고, 자물쇠는 각 API가 직접 채운다 —
 *   `/api/me`·`/api/generate`·`/api/admin/*`은 쿠키를 실제로 검증하고
 *   승인·관리자 여부까지 확인한다. 쿠키를 위조해 여기를 통과해도 API에서 막힌다.
 *
 * 로컬 개발: 로그인 설정(NEXT_PUBLIC_FIREBASE_PROJECT_ID)이 없으면 잠그지 않는다.
 */

import { NextResponse, type NextRequest } from 'next/server'

const SESSION_COOKIE = 'ep_session'

/** 로그인 없이도 열려 있어야 하는 곳 */
function isPublic(pathname: string): boolean {
  return (
    pathname === '/login' ||
    pathname === '/api/session' || // 쿠키를 만드는 길
    pathname === '/favicon.ico' ||
    pathname === '/school-logo.png'
  )
}

export function middleware(req: NextRequest) {
  // 설정이 없으면 로그인을 걸지 않는다 — 키 없이도 화면을 만질 수 있어야 한다
  if (!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) return NextResponse.next()

  const { pathname } = req.nextUrl
  if (isPublic(pathname)) return NextResponse.next()
  if (req.cookies.get(SESSION_COOKIE)?.value) return NextResponse.next()

  // API는 화면으로 보낼 수 없다 — 상태 코드로 답한다
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }

  const to = new URL('/login', req.nextUrl)
  if (pathname !== '/') to.searchParams.set('next', pathname)
  return NextResponse.redirect(to)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
}
