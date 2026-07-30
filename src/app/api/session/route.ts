/**
 * 로그인 쿠키를 만들고 지운다.
 *
 * 브라우저가 구글에서 받은 ID 토큰을 여기로 보내면, 서버가 확인한 뒤
 * httpOnly 쿠키로 바꿔 준다. 토큰을 브라우저에 두지 않는 이유는 스크립트가
 * 훔쳐 갈 수 있기 때문이다 — httpOnly 쿠키는 자바스크립트가 읽지 못한다.
 */

import { NextResponse } from 'next/server'
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_MS,
  adminReady,
  createSessionCookie,
} from '@/lib/firebase/admin'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  if (!adminReady) {
    return NextResponse.json({ error: '서버에 로그인 설정이 없습니다' }, { status: 503 })
  }
  let idToken = ''
  try {
    const body = (await req.json()) as { idToken?: string }
    idToken = body.idToken ?? ''
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다' }, { status: 400 })
  }
  if (!idToken) return NextResponse.json({ error: '토큰이 없습니다' }, { status: 400 })

  try {
    const cookie = await createSessionCookie(idToken)
    const res = NextResponse.json({ ok: true })
    res.cookies.set(SESSION_COOKIE, cookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_MAX_AGE_MS / 1000,
    })
    return res
  } catch {
    return NextResponse.json({ error: '로그인을 확인하지 못했습니다' }, { status: 401 })
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 })
  return res
}
