/**
 * 서버 쪽 Firebase — 사람을 확인하고 승인 여부를 읽는다.
 *
 * ★ 서버에서만 쓴다. 서비스 계정 키가 여기 들어오므로 클라이언트로 새면 프로젝트가 통째로 열린다.
 *   Node 런타임에서만 돈다 — Edge에서는 쓸 수 없다.
 *
 * 승인 명단은 Firestore `users/{uid}` 문서에 둔다.
 *   { email, googleName, displayName, approved, approvedAt, approvedBy, admin }
 * 관리자는 앱 안 '관리자 → 사용자 승인'에서 켜고 끈다 — 콘솔을 열게 만들면
 * 담당자가 바뀔 때마다 사람을 가르쳐야 한다.
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
  /** 남을 승인해 줄 수 있는 사람인지 */
  admin: boolean
}

/**
 * 관리자 명단 — `ADMIN_EMAILS`에 쉼표로 나열한다.
 *
 * 왜 데이터베이스가 아니라 설정값인가: 데이터베이스에만 두면 첫 관리자를 만들 방법이
 * 없다. 승인해 줄 사람이 없으니 아무도 관리자가 못 된다. 설정값 하나는 그 매듭을 푼다.
 * 여기 적힌 사람은 승인 절차 없이 바로 관리자다.
 *
 * 담당자가 바뀌어 관리자를 늘려야 하면 Firestore의 `users/{uid}`에 `admin: true`를
 * 넣어 주면 된다 — 아래에서 그 값도 같이 본다. 그 일만은 콘솔에서 하도록 남겨 뒀다.
 * 남에게 관리 권한을 주는 일이 화면의 버튼 하나로 끝나면 실수로 눌리기 때문이다.
 */
function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
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

/**
 * 구글 서버(App Hosting = Cloud Run) 안에서 돌고 있는가.
 *
 * 그렇다면 열쇠를 우리가 들고 다닐 필요가 없다. 컨테이너에 이미 신분증이 붙어 있고
 * (Application Default Credentials) `initializeApp()`이 그걸 알아서 집는다.
 * 비밀을 옮기지 않는 것이 가장 안전하게 옮기는 방법이다.
 *
 * `K_SERVICE`는 Cloud Run이 넣어 주는 표시다.
 */
const onGoogleCloud = Boolean(process.env.K_SERVICE ?? process.env.GOOGLE_CLOUD_PROJECT)

/** 서버 쪽 설정이 갖춰졌는지 — 없으면 로그인을 걸지 않는다(로컬 개발) */
export const adminReady = serviceAccount() !== null || onGoogleCloud

function adminApp(): App {
  if (getApps().length) return getApp()
  // 넣어 준 열쇠가 있으면 그것을 먼저 쓴다 — 로컬에서, 또는 다른 서버에 올릴 때
  const sa = serviceAccount()
  if (sa) return initializeApp({ credential: cert(sa) })
  if (onGoogleCloud) return initializeApp()
  throw new Error('FIREBASE_SERVICE_ACCOUNT 가 없습니다')
}

/** 쿠키 이름 */
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
    const data = snap.data() as
      { displayName?: string; approved?: boolean; admin?: boolean } | undefined

    // 설정값에 적힌 관리자는 승인 절차를 거치지 않는다 — 첫 관리자를 만들 길이 없어진다
    const listed = adminEmails().includes(email.toLowerCase())

    // 처음 온 사람은 자리를 만들어 둔다 — 관리자가 명단에서 볼 수 있어야 승인할 수 있다
    if (!snap.exists) {
      await ref.set({
        email,
        googleName: claims.name ?? null,
        displayName: null,
        approved: listed,
        createdAt: new Date(),
        lastSeenAt: new Date(),
      })
      return { uid: claims.uid, email, displayName: null, approved: listed, admin: listed }
    }
    await ref.update({ lastSeenAt: new Date() })

    const admin = listed || data?.admin === true
    return {
      uid: claims.uid,
      email,
      displayName: data?.displayName ?? null,
      // 관리자가 스스로를 못 쓰게 잠그는 일은 없어야 한다
      approved: admin || data?.approved === true,
      admin,
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

/* ── 관리자가 보는 명단 ──────────────────────────────── */

/** 명단에 한 줄 */
export interface UserRow extends AppUser {
  /** 구글 계정에 적힌 이름 — 아직 이름을 안 정한 사람을 알아보는 단서 */
  googleName: string | null
  /** 처음 들어온 시각 (ISO) */
  createdAt: string | null
  /** 마지막으로 들어온 시각 (ISO) */
  lastSeenAt: string | null
  approvedBy: string | null
}

/** Firestore의 Timestamp를 화면이 다룰 수 있는 문자열로 */
function toIso(v: unknown): string | null {
  if (v && typeof v === 'object' && 'toDate' in v)
    return (v as { toDate(): Date }).toDate().toISOString()
  return null
}

/**
 * 들어온 적 있는 사람 전부. 기다리는 사람이 위로 온다 —
 * 관리자가 이 화면을 여는 이유가 대개 그것이기 때문이다.
 */
export async function listUsers(): Promise<UserRow[]> {
  const snap = await getFirestore(adminApp()).collection('users').get()
  const listed = adminEmails()

  const rows = snap.docs.map((d) => {
    const x = d.data() as Record<string, unknown>
    const email = typeof x.email === 'string' ? x.email : ''
    const admin = listed.includes(email.toLowerCase()) || x.admin === true
    return {
      uid: d.id,
      email,
      displayName: typeof x.displayName === 'string' ? x.displayName : null,
      googleName: typeof x.googleName === 'string' ? x.googleName : null,
      approved: admin || x.approved === true,
      admin,
      createdAt: toIso(x.createdAt),
      lastSeenAt: toIso(x.lastSeenAt),
      approvedBy: typeof x.approvedBy === 'string' ? x.approvedBy : null,
    }
  })

  return rows.sort((a, b) => {
    // ① 기다리는 사람 ② 최근에 들어온 사람
    if (a.approved !== b.approved) return a.approved ? 1 : -1
    return (b.lastSeenAt ?? '').localeCompare(a.lastSeenAt ?? '')
  })
}

/** 승인하거나 되돌린다. 누가 언제 했는지 남긴다 — 나중에 물어볼 사람이 있어야 한다 */
export async function setApproved(uid: string, approved: boolean, byEmail: string): Promise<void> {
  await getFirestore(adminApp())
    .collection('users')
    .doc(uid)
    .update({
      approved,
      approvedAt: approved ? new Date() : null,
      approvedBy: approved ? byEmail : null,
    })
}
