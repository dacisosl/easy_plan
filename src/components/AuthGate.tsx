'use client'

/**
 * 로그인한 사람의 상태에 따라 화면을 가른다.
 *
 *   로그인 안 함      → 그냥 통과 (로그인은 선택이다)
 *   이름 안 정함      → 이름 정하는 화면
 *   그 밖             → 통과
 *
 * 로그인이 여는 것은 **AI 문안** 하나다 — 구글로 들어와 이름을 정하면, 관리자가
 * 그 이름을 보고 승인해 준다. 계획서를 짜고 한글 파일로 내려받는 일은 로그인
 * 없이도 할 수 있어야 한다. 그게 이 도구의 본체다.
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { signOutEverywhere } from '@/lib/firebase/client'

export interface Me {
  uid?: string
  email?: string
  displayName?: string | null
  approved?: boolean
  admin?: boolean
  authDisabled?: boolean
}

/**
 * 지금 들어온 사람 — 한 번만 물어보고 화면 전체가 같은 답을 본다.
 * `null`은 '로그인 안 함'이다. 오류가 아니다.
 *
 * 화면마다 `/api/me`를 다시 부르면 답이 엇갈릴 수 있고(승인 직후 같은 순간),
 * 무엇보다 같은 값을 두 곳에서 들고 있게 된다.
 */
const MeContext = createContext<Me | null>(null)

export function useMe(): Me | null {
  return useContext(MeContext)
}

export function AuthGate({ children }: { children: ReactNode }) {
  // undefined = 아직 물어보는 중, null = 로그인 안 함
  const [me, setMe] = useState<Me | null | undefined>(undefined)

  useEffect(() => {
    let alive = true
    fetch('/api/me')
      .then(async (r) => {
        if (r.ok) return (await r.json()) as Me
        // 로그인 안 함(쿠키 없음·만료) — 들여보낸다. 로그인은 선택이다
        return null
      })
      .catch(() => null) // 네트워크가 안 되면 익명으로라도 열어 준다
      .then((j) => alive && setMe(j))
    return () => {
      alive = false
    }
  }, [])

  // 첫 판단이 끝나기 전에는 아무것도 그리지 않는다 — 화면이 두 번 바뀌면 어지럽다
  if (me === undefined) return null

  if (me && !me.authDisabled && !me.displayName) {
    return (
      <NameStep email={me.email ?? ''} onDone={(name) => setMe({ ...me, displayName: name })} />
    )
  }
  return <MeContext.Provider value={me}>{children}</MeContext.Provider>
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
          관리자가 이 이름을 보고 AI 문안 사용을 승인해 드립니다.
          <br />
          알아볼 수 있는 실명으로 적어 주세요.
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
          onClick={() => signOutEverywhere().then(() => (window.location.href = '/'))}
        >
          {email} — 이 계정이 아니라면 나가기
        </button>
      </div>
    </div>
  )
}
