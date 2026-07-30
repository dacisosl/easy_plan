/**
 * 관리자만 쓰는 문 — 들어온 사람 명단을 보고, 승인을 켜고 끈다.
 *
 * ★ 자물쇠는 여기 있다. 화면에서 탭을 숨기는 것은 눈에 안 보이게 하는 것뿐이고,
 *   주소를 아는 사람은 그냥 부를 수 있다. 그래서 매 요청마다 다시 확인한다.
 */

import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import {
  SESSION_COOKIE,
  adminReady,
  listUsers,
  setApproved,
  userFromSession,
  type AppUser,
} from '@/lib/firebase/admin'

export const runtime = 'nodejs'

/** 관리자인지 확인하고, 아니면 돌려보낼 응답을 함께 준다 */
async function requireAdmin(): Promise<{ user: AppUser } | { deny: NextResponse }> {
  if (!adminReady) {
    return { deny: NextResponse.json({ error: '로그인 설정이 없습니다' }, { status: 503 }) }
  }
  const user = await userFromSession((await cookies()).get(SESSION_COOKIE)?.value)
  if (!user) return { deny: NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 }) }
  if (!user.admin) {
    return { deny: NextResponse.json({ error: '관리자만 볼 수 있습니다' }, { status: 403 }) }
  }
  return { user }
}

export async function GET() {
  const gate = await requireAdmin()
  if ('deny' in gate) return gate.deny
  return NextResponse.json({ users: await listUsers() })
}

export async function PATCH(req: Request) {
  const gate = await requireAdmin()
  if ('deny' in gate) return gate.deny

  let uid = ''
  let approved = false
  try {
    const body = (await req.json()) as { uid?: string; approved?: boolean }
    uid = (body.uid ?? '').trim()
    approved = body.approved === true
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다' }, { status: 400 })
  }
  if (!uid) return NextResponse.json({ error: '누구인지 없습니다' }, { status: 400 })

  // 자기 승인을 자기가 내리면 스스로 문을 잠그는 셈이다 — 막는다
  if (uid === gate.user.uid && !approved) {
    return NextResponse.json({ error: '자기 승인은 내릴 수 없습니다' }, { status: 400 })
  }

  await setApproved(uid, approved, gate.user.email)
  return NextResponse.json({ users: await listUsers() })
}
