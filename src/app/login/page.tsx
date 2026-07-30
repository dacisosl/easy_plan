'use client'

/**
 * 로그인 화면 — 로그인은 선택이다.
 *
 * 여는 것은 AI 문안 하나: 구글로 들어와 이름을 정하면 관리자가 그 이름을 보고
 * 승인해 준다. 계획서 작성과 한글 파일 내려받기는 로그인 없이도 된다.
 * 그래서 '로그인 없이 계속' 길을 반드시 함께 둔다 — 이유 없이 로그인을
 * 요구받으면 사람들은 그냥 닫는다.
 */

import { useState } from 'react'
import { firebaseReady, signInWithGoogle } from '@/lib/firebase/client'

export default function LoginPage() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const enter = async () => {
    setError(null)
    setBusy(true)
    try {
      await signInWithGoogle()
      // 이름을 정했는지는 첫 화면이 판단해 필요하면 이름 화면으로 보낸다
      window.location.href = new URLSearchParams(window.location.search).get('next') || '/'
    } catch (e) {
      const msg = e instanceof Error ? e.message : '로그인에 실패했습니다'
      // 사용자가 창을 닫은 것은 오류가 아니다 — 조용히 되돌린다
      setError(/popup-closed|cancelled/i.test(msg) ? null : msg)
      setBusy(false)
    }
  }

  return (
    <div className="hero-wash flex min-h-screen flex-col items-center justify-center px-4">
      <div className="fade-in flex w-full max-w-[420px] flex-col items-center text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/school-logo.png" alt="" className="h-12 w-12 object-contain" aria-hidden />

        <h1
          className="mt-5 text-[26px] font-medium tracking-[-0.02em] text-ink"
          style={{ fontFamily: 'var(--font-title)' }}
        >
          평가계획 <b className="font-extrabold">편집</b>기
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
          로그인하고 승인을 받으면 <b className="font-semibold text-ink">AI 문안</b>을 쓸 수
          있습니다.
          <br />
          계획서 작성과 내려받기는 로그인 없이도 됩니다.
        </p>

        {error && (
          <p className="mt-5 w-full rounded-control border border-red-line bg-red-bg px-4 py-3 text-[13.5px] leading-relaxed text-red-ink">
            {error}
          </p>
        )}

        {firebaseReady ? (
          <button
            className="btn btn-lg btn-ghost mt-8 flex w-full items-center justify-center gap-3"
            onClick={enter}
            disabled={busy}
          >
            {/* 구글 브랜드 마크 — 네 색을 그대로 써야 알아본다 */}
            <svg width="19" height="19" viewBox="0 0 18 18" aria-hidden>
              <path
                fill="#4285F4"
                d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.62z"
              />
              <path
                fill="#34A853"
                d="M9 18c2.43 0 4.47-.81 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.34A9 9 0 0 0 9 18z"
              />
              <path
                fill="#FBBC05"
                d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.96H.96a9 9 0 0 0 0 8.08l3.01-2.32z"
              />
              <path
                fill="#EA4335"
                d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l3.01 2.32C4.68 5.16 6.66 3.58 9 3.58z"
              />
            </svg>
            {busy ? '들어가는 중…' : '구글로 로그인'}
          </button>
        ) : (
          <p className="mt-8 rounded-control border border-amber-line bg-amber-bg px-4 py-3 text-[13.5px] leading-relaxed text-amber-ink">
            로그인 설정이 아직 끝나지 않았습니다.
            <br />
            관리자에게 알려 주세요.
          </p>
        )}

        <a className="mt-6 text-[13px] text-ink-3 underline-offset-4 hover:underline" href="/">
          로그인 없이 계속하기
        </a>
      </div>
    </div>
  )
}
