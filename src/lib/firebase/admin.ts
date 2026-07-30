/**
 * 서버 쪽 Firebase — 사람을 확인하고 승인 여부를 읽는다.
 *
 * ★ 서버에서만 쓴다. 서비스 계정 키가 여기 들어오므로 클라이언트로 새면 프로젝트가 통째로 열린다.
 *   Node 런타임에서만 돈다 — 미들웨어(Edge)에서는 쓸 수 없다.
 *
 * 승인 명단은 Firestore `users/{uid}` 문서에 둔다.
 *   { email, displayName, approved, approvedAt, approvedBy }
 * 관리자는 Firebase 콘솔에서 `approved`를 true로 바꿔 주면 된다 — 앱에 승인 화면을
 * 따로 만들지 않아도 당장 굴러가게 하려는 것이다.
 */

import { cert, getApp, getApps, initializeApp, type App } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

/** 로그인한 사람 한 명 */
export interface AppUser {
  uid: string
  email: string
  /** 선생님이 스스로 정한 이름. 아직 안 정했으면 null */
  displayName: string | null
  /** 관리자가 열어 줬는지. false면 AI 문안을 만들 수 없다 */
  approved: boolean
}

/**
 * 서비스 계정 — Firebase 콘솔의 '새 비공개 키 생성'으로 받은 JSON을 한 줄로 넣는다.
 * 줄바꿈이 `\n` 문자열로 들어오는 일이 흔해서 되돌려 준다.
 */
function serviceAccount(): { projectId: string; clientEmail: string; privateKey: string } | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!raw) return null
  try {
    const j = JSON.parse(raw) as {
      project_id?: string
      client_email?: string
      private_key?: string
    }
    if (!j.project_id || !j.client_email || !j.private_key) return null
    return {
      projectId: j.project_id,
      clientEmail: j.client_email,
      privateKey: j.private_key.replace(/\\n/g, '\n'),
    }
  } catch {
    return null
  }
}

/** 서버 쪽 설정이 갖춰졌는지 — 없으면 로그인을 걸지 않는다(로컬 개발) */
export const adminReady = serviceAccount() !== null

function adminApp(): App {
  if (getApps().length) return getApp()
  const sa = serviceAccount()
  if (!sa) throw new Error('FIREBASE_SERVICE_ACCOUNT 가 없습니다')
  return initializeApp({ credential: cert(sa) })
}

/** 쿠키 이름 — 미들웨어도 이 이름만 보고 문을 지킨다 */
export const SESSION_COOKIE = 'ep_session'
/** 쿠키 수명 — 학기 중에 매일 다시 로그인하게 만들 이유가 없다 */
export const SESSION_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000

/** 구글에서 받은 ID 토큰을 오래 쓰는 세션 쿠키로 바꾼다 */
export async function createSessionCookie(idToken: string): Promise<string> {
  return getAuth(adminApp()).createSessionCookie(idToken, { expiresIn: SESSION_MAX_AGE_MS })
}

/**
 * 세션 쿠키에서 사람을 알아낸다. 못 알아내면 null.
 *
 * `checkRevoked`를 켠다 — 관리자가 콘솔에서 계정을 정지시키면 쿠키가 남아 있어도 막혀야 한다.
 */
export async function userFromSession(cookie: string | undefined): Promise<AppUser | null> {
  if (!cookie) return null
  try {
    const claims = await getAuth(adminApp()).verifySessionCookie(cookie, true)
    const email = claims.email ?? ''
    if (!email) return null

    const db = getFirestore(adminApp())
    const ref = db.collection('users').doc(claims.uid)
    const snap = await ref.get()
    const data = snap.data() as { displayName?: string; approved?: boolean } | undefined

    // 처음 온 사람은 자리를 만들어 둔다 — 관리자가 콘솔에서 볼 수 있어야 승인할 수 있다
    if (!snap.exists) {
      await ref.set({
        email,
        googleName: claims.name ?? null,
        displayName: null,
        approved: false,
        createdAt: new Date(),
        lastSeenAt: new Date(),
      })
      return { uid: claims.uid, email, displayName: null, approved: false }
    }
    await ref.update({ lastSeenAt: new Date() })

    return {
      uid: claims.uid,
      email,
      displayName: data?.displayName ?? null,
      approved: data?.approved === true,
    }
  } catch {
    // 만료·위조·정지 — 어느 쪽이든 들여보내지 않는다
    return null
  }
}

/** 표시 이름을 정한다 */
export async function setDisplayName(uid: string, name: string): Promise<void> {
  await getFirestore(adminApp()).collection('users').doc(uid).update({ displayName: name })
}
