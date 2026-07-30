/** 지금 들어온 사람이 누구고, 이름을 정했고, 승인됐는지 — 화면이 이걸 보고 갈 곳을 정한다 */

import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { SESSION_COOKIE, adminReady, setDisplayName, userFromSession } from '@/lib/firebase/admin'

export const runtime = 'nodejs'

export async function GET() {
  // 로그인을 걸지 않은 환경(로컬)에서는 '설정 없음'을 알려 준다
  if (!adminReady) return NextResponse.json({ authDisabled: true })

  const user = await userFromSession((await cookies()).get(SESSION_COOKIE)?.value)
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  return NextResponse.json(user)
}

/** 표시 이름 정하기 */
export async function PATCH(req: Request) {
  if (!adminReady) return NextResponse.json({ error: '로그인 설정이 없습니다' }, { status: 503 })

  const user = await userFromSession((await cookies()).get(SESSION_COOKIE)?.value)
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  let name = ''
  try {
    const body = (await req.json()) as { displayName?: string }
    name = (body.displayName ?? '').trim()
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다' }, { status: 400 })
  }
  if (name.length < 2 || name.length > 20) {
    return NextResponse.json({ error: '이름은 2~20자로 적어 주세요' }, { status: 400 })
  }

  await setDisplayName(user.uid, name)
  return NextResponse.json({ ...user, displayName: name })
}
