'use client'

/**
 * 로그인한 사람의 상태에 따라 화면을 가른다.
 *
 *   설정 없음(로컬)   → 그냥 통과
 *   이름 안 정함      → 이름 정하는 화면
 *   그 밖             → 통과 (승인은 막지 않는다)
 *
 * 왜 미승인도 통과시키는가: 승인은 **AI 문안**을 쓰는 권한이다. 계획서를 짜고
 * 한글 파일로 내려받는 일은 승인 없이도 할 수 있어야 한다. 그게 이 도구의 본체다.
 * 승인을 안 받은 사람은 빨간 글씨가 고정 문구로 나올 뿐이다.
 */

import { useEffect, useState, type ReactNode } from 'react'
import { signOutEverywhere } from '@/lib/firebase/client'

export interface Me {
  uid?: string
  email?: string
  displayName?: string | null
  approved?: boolean
  authDisabled?: boolean
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    fetch('/api/me')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: Me) => alive && setMe(j))
      .catch(() => {
        if (!alive) return
        // 쿠키가 만료됐거나 위조된 경우 — 로그인 화면으로 되돌린다
        setFailed(true)
        window.location.href = '/login'
      })
    return () => {
      alive = false
    }
  }, [])

  if (failed) return null
  // 첫 판단이 끝나기 전에는 아무것도 그리지 않는다 — 화면이 두 번 바뀌면 어지럽다
  if (!me) return null

  if (!me.authDisabled && !me.displayName) {
    return (
      <NameStep email={me.email ?? ''} onDone={(name) => setMe({ ...me, displayName: name })} />
    )
  }
  return <>{children}</>
}

/** 처음 들어온 사람에게 표시 이름을 받는다 */
function NameStep({ email, onDone }: { email: string; onDone: (name: string) => void }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    setError(null)
    setBusy(true)
    try {
      const res = await fetch('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: name.trim() }),
      })
      const body = (await res.json()) as { error?: string; displayName?: string }
      if (!res.ok) throw new Error(body.error ?? '저장하지 못했습니다')
      onDone(body.displayName ?? name.trim())
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장하지 못했습니다')
      setBusy(false)
    }
  }

  const len = [...name.trim()].length
  const ready = len >= 2 && len <= 20

  return (
    <div className="hero-wash flex min-h-screen flex-col items-center justify-center px-4">
      <div className="fade-in flex w-full max-w-[420px] flex-col items-center text-center">
        <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-ink">
          어떻게 불러 드릴까요?
        </h1>
        <p className="mt-3 text-[14.5px] leading-relaxed text-ink-2">
          계획서에 들어가는 지도교사 이름으로 쓰입니다.
          <br />
          나중에 바꿀 수 있습니다.
        </p>

        <input
          className="control mt-7 h-13 text-center text-[16px]"
          value={name}
          placeholder="예) 황대연"
          maxLength={20}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && ready && !busy) save()
          }}
        />
        <span className="mt-2 h-5 text-[13px] text-ink-3">
          {error ? <span className="text-red">{error}</span> : `${len}/20`}
        </span>

        <button className="btn btn-lg mt-4 w-full" disabled={!ready || busy} onClick={save}>
          {busy ? '저장 중…' : '시작하기'}
        </button>

        <button
          className="mt-6 cursor-pointer border-0 bg-transparent p-0 text-[13px] text-ink-3 underline-offset-4 hover:underline"
          onClick={() => signOutEverywhere().then(() => (window.location.href = '/login'))}
        >
          {email} — 다른 계정으로 들어가기
        </button>
      </div>
    </div>
  )
}
