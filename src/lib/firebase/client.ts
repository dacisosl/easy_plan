/**
 * 브라우저 쪽 Firebase — 구글 로그인 창을 띄우는 데만 쓴다.
 *
 * 여기 들어가는 값(NEXT_PUBLIC_*)은 클라이언트 번들에 그대로 심긴다. 그래도 된다 —
 * Firebase의 웹 설정값은 비밀이 아니고 '어느 프로젝트냐'를 가리키는 주소일 뿐이다.
 * 실제 권한은 서버에서 ID 토큰을 검증하고 Firestore 규칙이 막는다.
 *
 * ★ 비밀인 것은 서비스 계정 키다 — 그건 `admin.ts`에서만 읽고 절대 클라이언트로 내보내지 않는다.
 */

import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app'
import { GoogleAuthProvider, getAuth, signInWithPopup, type Auth } from 'firebase/auth'

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
}

/** 설정이 없으면 로그인 자체를 걸지 않는다 — 로컬에서 키 없이도 화면을 만질 수 있어야 한다 */
export const firebaseReady = Boolean(config.apiKey && config.authDomain && config.projectId)

function app(): FirebaseApp {
  return getApps().length ? getApp() : initializeApp(config)
}

export function clientAuth(): Auth {
  return getAuth(app())
}

/**
 * 구글 로그인 창을 띄우고, 받은 ID 토큰을 서버에 넘겨 쿠키로 바꾼다.
 *
 * 왜 쿠키까지 만드는가: 토큰을 브라우저에만 두면 서버가 매 요청마다 사람을 알 수 없다.
 * httpOnly 쿠키로 바꿔 두면 서버의 어느 API든 같은 문으로 판단할 수 있다.
 */
export async function signInWithGoogle(): Promise<void> {
  const provider = new GoogleAuthProvider()
  // 계정을 여러 개 쓰는 교사가 많다 — 늘 어느 계정으로 들어갈지 고르게 한다
  provider.setCustomParameters({ prompt: 'select_account' })

  const cred = await signInWithPopup(clientAuth(), provider)
  const idToken = await cred.user.getIdToken()

  const res = await fetch('/api/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    // 쿠키를 못 만들었으면 브라우저 쪽 로그인도 되돌린다 — 반쯤 들어온 상태를 남기지 않는다
    await clientAuth().signOut()
    throw new Error(body.error ?? '로그인에 실패했습니다')
  }
}

export async function signOutEverywhere(): Promise<void> {
  await fetch('/api/session', { method: 'DELETE' })
  if (firebaseReady) await clientAuth().signOut()
}
