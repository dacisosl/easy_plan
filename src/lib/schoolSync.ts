/**
 * 학교 설정 공유 — Firestore 문서 한 장(school/current).
 *
 * 정적 호스팅에서 유일하게 서버가 필요한 값이 이것이다: 관리자가 세팅한
 * 학사일정·배포표·학교 규칙을 전 교사가 같이 봐야 한다.
 *
 *   읽기  누구나, 로그인 없이. SDK도 없이 — REST GET 한 번이면 되는 일에
 *         파이어베이스 번들을 첫 화면에 실을 이유가 없다.
 *   쓰기  관리자 화면의 '게시' 버튼만. 이때만 SDK를 동적으로 불러와
 *         구글/이메일 로그인을 거친다. 누가 쓸 수 있는지는 Firestore 규칙이
 *         이메일로 판별한다 (firestore.rules).
 *
 * 자동 동기화가 아니라 **명시적 게시**다 — 연 1회 세팅하는 값이라, 고치는 중간
 * 상태가 실시간으로 전 교사에게 퍼지는 것보다 '다 맞추고 게시'가 사고가 없다.
 */

import type { SchoolLayer } from '@/types'

const PROJECT = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
const API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY
const DOC_PATH = 'school/current'
const REST = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${DOC_PATH}?key=${API_KEY}`

/** 공유 설정이 켜져 있는가 (빌드에 프로젝트 값이 구워졌는가) */
export const syncReady = Boolean(PROJECT && API_KEY)

export interface SharedSchool {
  school: SchoolLayer
  published_at: string
  published_by: string
}

/**
 * 공유본을 읽는다. 없거나(아직 게시 전) 실패하면(오프라인) null —
 * 그때는 브라우저에 저장된 값이나 앱에 구운 기본값으로 그냥 간다.
 */
export async function fetchSharedSchool(): Promise<SharedSchool | null> {
  if (!syncReady) return null
  try {
    const res = await fetch(REST)
    if (!res.ok) return null
    const j = (await res.json()) as {
      fields?: { data?: { stringValue?: string }; by?: { stringValue?: string } }
      updateTime?: string
    }
    const raw = j.fields?.data?.stringValue
    if (!raw) return null
    return {
      school: JSON.parse(raw) as SchoolLayer,
      published_at: j.updateTime ?? '',
      published_by: j.fields?.by?.stringValue ?? '',
    }
  } catch {
    return null
  }
}

/* ── 게시 (관리자만 · SDK는 이때만 싣는다) ─────── */

async function firebaseApp() {
  const { getApps, getApp, initializeApp } = await import('firebase/app')
  const config = {
    apiKey: API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: PROJECT,
  }
  return getApps().length ? getApp() : initializeApp(config)
}

/** 지금 로그인돼 있는 계정 이메일 (없으면 null) */
export async function currentAdminEmail(): Promise<string | null> {
  const { getAuth } = await import('firebase/auth')
  return getAuth(await firebaseApp()).currentUser?.email ?? null
}

export async function signInAdminGoogle(): Promise<string> {
  const { getAuth, GoogleAuthProvider, signInWithPopup } = await import('firebase/auth')
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })
  const cred = await signInWithPopup(getAuth(await firebaseApp()), provider)
  return cred.user.email ?? ''
}

export async function signInAdminEmail(email: string, password: string): Promise<string> {
  const { getAuth, signInWithEmailAndPassword } = await import('firebase/auth')
  try {
    const cred = await signInWithEmailAndPassword(getAuth(await firebaseApp()), email, password)
    return cred.user.email ?? ''
  } catch (e) {
    const code = (e as { code?: string }).code ?? ''
    if (/invalid-credential|wrong-password|user-not-found|invalid-email/.test(code))
      throw new Error('이메일 또는 비밀번호가 맞지 않습니다')
    throw e
  }
}

export async function signOutAdmin(): Promise<void> {
  const { getAuth, signOut } = await import('firebase/auth')
  await signOut(getAuth(await firebaseApp()))
}

/**
 * 지금 학교 설정을 공유본으로 게시한다. 로그인돼 있어야 한다 —
 * 관리자 계정이 아니면 Firestore 규칙이 거부한다(permission-denied).
 */
export async function publishSchool(school: SchoolLayer): Promise<void> {
  const { getAuth } = await import('firebase/auth')
  const { getFirestore, doc, setDoc } = await import('firebase/firestore')
  const app = await firebaseApp()
  const user = getAuth(app).currentUser
  if (!user) throw new Error('로그인이 필요합니다')
  try {
    await setDoc(doc(getFirestore(app), 'school', 'current'), {
      data: JSON.stringify(school),
      by: user.email ?? '',
    })
  } catch (e) {
    if ((e as { code?: string }).code === 'permission-denied')
      throw new Error(`이 계정(${user.email})은 게시 권한이 없습니다`)
    throw e
  }
}
