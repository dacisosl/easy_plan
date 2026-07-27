/**
 * 접근 제어 — 공개 배포 시 아무나 들어와 AI 크레딧을 태우는 걸 막는다.
 *
 * `APP_PASSWORD`가 설정돼 있을 때만 동작한다. 로컬 개발에서는 비워 두면 그냥 통과한다.
 * HTTP Basic 인증이라 별도 로그인 화면이 필요 없고 브라우저가 물어본다.
 * API 라우트까지 함께 막힌다 — 페이지만 막으면 /api/generate가 그대로 열려 있어 의미가 없다.
 *
 * 이 방식을 고른 이유: Vercel의 Password Protection은 유료 애드온이고,
 * 무료인 Vercel Authentication은 방문자에게 Vercel 계정을 요구한다.
 * 앱에 넣어 두면 어느 호스팅을 쓰든 똑같이 동작한다.
 *
 * ※ 비밀번호 하나를 나눠 쓰는 방식이다. 사용자별 계정이 필요해지면 제대로 된
 *    인증(예: Auth.js)으로 갈아타야 한다.
 */

import { NextResponse, type NextRequest } from 'next/server'

const REALM = 'easy_plan'

/** 길이가 달라도 같은 시간이 걸리게 비교한다 (타이밍 차이로 흘리지 않기 위해) */
function safeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length)
  let diff = a.length ^ b.length
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  }
  return diff === 0
}

export function middleware(req: NextRequest) {
  const expected = process.env.APP_PASSWORD
  if (!expected) return NextResponse.next() // 설정 안 했으면 잠그지 않는다

  const header = req.headers.get('authorization') ?? ''
  if (header.startsWith('Basic ')) {
    try {
      const decoded = atob(header.slice(6))
      const password = decoded.slice(decoded.indexOf(':') + 1)
      if (safeEqual(password, expected)) return NextResponse.next()
    } catch {
      // 잘못된 base64 — 아래에서 다시 물어본다
    }
  }

  return new NextResponse('인증이 필요합니다', {
    status: 401,
    headers: { 'WWW-Authenticate': `Basic realm="${REALM}", charset="UTF-8"` },
  })
}

export const config = {
  // 정적 자산과 파비콘은 제외하고 전부 (페이지 + API) 검사한다
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
