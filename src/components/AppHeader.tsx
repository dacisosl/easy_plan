'use client'

/**
 * 앱 헤더 — 좌 로고+제목 / 중앙 간판 / 우 액션.
 *
 * 가운데 간판이 '지금 무엇을 만지고 있는지'를 늘 알려 준다.
 * 화면 안에 큰 제목을 또 두지 않는 대신, 스크롤해도 따라오는 이 줄이 그 역할을 한다.
 */

import { useEffect, useRef, useState } from 'react'
import { useMe } from '@/components/AuthGate'
import { Portal } from '@/components/ui'
import { signInWithGoogle, signOutEverywhere } from '@/lib/firebase/client'
import { usePlanStore, type ScreenId } from '@/store/usePlanStore'

const DOING: Record<ScreenId, string> = {
  home: '편집 중',
  generating: '만드는 중',
  download: '내려받기',
  extras: '참고자료',
  admin: '관리자',
}

export function AppHeader() {
  const { screen, go, currentPlanId, startNew } = usePlanStore()
  const me = useMe()
  const [authBusy, setAuthBusy] = useState(false)

  /*
   * 인증은 여기서 바로 구글 창을 띄운다 — 로그인 페이지로 건너보내지 않는다.
   * 첫 화면은 도구의 얼굴이지 로그인 관문이 아니고, 인증은 AI 문안을 쓸 사람만
   * 필요할 때 누르는 버튼 하나면 된다.
   */
  const authenticate = async () => {
    setAuthBusy(true)
    try {
      await signInWithGoogle()
      // 이름을 정했는지는 AuthGate가 다시 판단한다 — 새로 읽는 게 가장 확실하다
      window.location.reload()
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      // 사용자가 창을 닫은 것은 오류가 아니다 — 조용히 되돌린다
      if (!/popup-closed|cancelled/i.test(msg)) window.alert(msg || '인증에 실패했습니다')
      setAuthBusy(false)
    }
  }
  /*
   * 학교 마크 — public/school-logo.png 를 넣으면 뜨고, 없으면 '평' 사각형으로.
   * onError만으로는 부족하다. 리액트가 붙기 전에 이미 실패해 있으면 그 이벤트를
   * 놓치므로, 붙은 뒤에도 한 번 직접 확인한다.
   */
  const [logoMissing, setLogoMissing] = useState(false)
  const logoRef = useRef<HTMLImageElement>(null)
  useEffect(() => {
    const el = logoRef.current
    if (el?.complete && el.naturalWidth === 0) setLogoMissing(true)
  }, [])
  const plan = usePlanStore((s) => s.plans.find((p) => p.id === s.currentPlanId))
  const subject = usePlanStore((s) => {
    const p = s.plans.find((x) => x.id === s.currentPlanId)
    return p ? s.subjects.find((x) => x.id === p.subject_id) : undefined
  })
  const year = usePlanStore(
    (s) => s.school.calendars.find((c) => c.semester === plan?.semester)?.year,
  )

  /* 첫 화면은 바탕에 파란 빛이 깔려 있다 — 흰 띠를 얹으면 그 위에 선이 하나 그어진다 */
  const onHero = screen === 'home' && !currentPlanId

  return (
    <header
      className={`sticky top-0 z-10 ${onHero ? 'bg-transparent' : 'border-b border-line-soft bg-white'}`}
    >
      {/*
       * 폭을 본문과 같게 — 로고가 입력 상자 왼쪽 모서리, 버튼이 오른쪽 모서리에 맞는다.
       * 좌우를 1fr로 잡아 가운데가 진짜 가운데에 오게 한다. justify-between으로 두면
       * 로고(130px)와 버튼(78px) 폭이 달라 가운데가 26px쯤 밀린다.
       */}
      <div className="mx-auto grid h-16 max-w-[880px] grid-cols-[auto_1fr_auto] items-center gap-2 px-4 sm:grid-cols-[1fr_auto_1fr] sm:px-6">
        {/*
         * 로고를 두 번 누르면 관리자로 들어간다.
         * 학사일정·배포표를 만지는 자리라 교사가 실수로 들어갈 일이 없어야 한다.
         * 버튼으로 내놓으면 눌러 보게 되므로 숨은 길을 둔다.
         */}
        <button
          className="flex cursor-pointer items-center gap-2.5 justify-self-start border-0 bg-transparent select-none"
          onClick={() => go('home')}
          onDoubleClick={() => go('admin')}
          title="처음으로 (두 번 누르면 관리자)"
        >
          {logoMissing ? (
            <span className="flex h-7 w-7 items-center justify-center rounded-[7px] bg-navy text-[13px] font-semibold text-white">
              평
            </span>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              ref={logoRef}
              src="/school-logo.png"
              alt="학교 마크"
              className="h-8 w-8 object-contain"
              onError={() => setLogoMissing(true)}
            />
          )}
          {/*
           * '편집'만 굵게 — 이 도구가 대신 해 주는 일이 그것이다.
           * 휴대폰에서 편집 중일 때는 이름을 접는다 — 좁은 띠에 제목이 세로로 꺾여
           * 쏟아지느니 마크 하나가 낫다. 앱 이름은 첫 화면이 이미 말해 준다.
           */}
          <span
            className={`text-[18px] font-medium tracking-[-0.02em] text-ink ${plan ? 'hidden sm:inline' : ''}`}
            style={{ fontFamily: 'var(--font-title)' }}
          >
            평가계획 <b className="font-extrabold">편집</b>기
          </span>
        </button>

        {/* 첫 화면에는 안내를 두지 않는다 — 화면 한가운데가 이미 그 말을 하고 있다 */}
        {plan && subject ? (
          /* 휴대폰에서는 '편집 중' 하나만 — 과목 이름은 바로 아래 폼이 이미 말하고 있다 */
          <div className="nameplate justify-self-center">
            <span className="hidden text-ink-2 sm:inline">
              {year}학년도 {plan.semester}학기
            </span>
            <span className="hidden text-ink-4 sm:inline">·</span>
            <span className="hidden font-semibold text-ink sm:inline">{subject.name}</span>
            <span className="flex items-center gap-1.5 text-navy sm:ml-0.5 sm:border-l sm:border-line-input sm:pl-2.5">
              <span className="pulse-dot" />
              {DOING[screen]}
            </span>
          </div>
        ) : (
          <span />
        )}

        {/*
         * 오른쪽은 '어디로 갈 수 있는가'만 둔다.
         *   작성 중      → 이전 (첫 화면으로 되돌아간다)
         *   만든 뒤·관리자 → 이전 · 홈
         * '새 계획서'는 없앴다 — 첫 화면으로 돌아가면 거기서 새로 시작하게 된다.
         */}
        {/*
         * 휴대폰에서는 이전·홈을 접는다 — 로고(처음으로)와 폼 안의 '과목 바꾸기'가
         * 같은 길을 이미 내주고 있다. 좁은 띠에는 다른 데 없는 것만 남긴다:
         * 편집중 · 로봇(참고자료) · 인증.
         */}
        <div className="flex items-center gap-2 justify-self-end">
          {/* max-sm:hidden — display를 갈아끼우면(sm:inline-flex) 버튼의 세로 중앙정렬이 깨진다 */}
          {currentPlanId && (
            <button
              className="btn btn-sm btn-ghost whitespace-nowrap max-sm:hidden"
              onClick={screen === 'home' ? startNew : () => go('home')}
            >
              이전
            </button>
          )}
          {screen !== 'home' && (
            <button
              className="btn btn-sm btn-ghost whitespace-nowrap max-sm:hidden"
              onClick={startNew}
              title="첫 화면으로"
            >
              홈
            </button>
          )}
          {/* 참고자료 — 무엇을 담을지는 아직 정하는 중이다 */}
          <button
            className="btn btn-sm btn-ghost flex items-center gap-1.5 whitespace-nowrap px-3"
            onClick={() => go('extras')}
            title="참고자료"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              {/* 머리 · 안테나 · 눈 · 귀 */}
              <path d="M12 3.2v2.4" />
              <circle cx="12" cy="2.4" r="1" />
              <rect x="4.2" y="5.6" width="15.6" height="12.6" rx="3.4" />
              <path d="M1.8 10.4v3.4M22.2 10.4v3.4" />
              <path d="M9 11v1.6M15 11v1.6" />
              <path d="M9.4 15.2h5.2" />
            </svg>
            <span className="hidden sm:inline">참고자료</span>
          </button>

          {/*
           * 인증은 선택이다 — 여는 것은 AI 문안 하나.
           * 로컬(설정 없음)에서는 아무것도 안 보인다. 없는 문을 그려 두면 눌러 보게 된다.
           */}
          {me?.authDisabled ? null : me?.email ? (
            <UserMenu name={me.displayName ?? me.email} email={me.email} />
          ) : (
            <button
              className="btn btn-sm whitespace-nowrap"
              onClick={authenticate}
              disabled={authBusy}
              title="구글 계정으로 인증하면 AI 문안을 쓸 수 있습니다"
            >
              {authBusy ? '인증 중…' : '해밀고 인증'}
            </button>
          )}
        </div>
      </div>
    </header>
  )
}

/* ── 로그인한 사람 메뉴 — 이름을 누르면 이름 변경 · 로그아웃 ── */

function UserMenu({ name, email }: { name: string; email: string }) {
  const [open, setOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)

  return (
    <div className="relative">
      <button
        className="btn btn-sm btn-ghost max-w-[120px] truncate whitespace-nowrap"
        title={email}
        onClick={() => setOpen((v) => !v)}
      >
        {name}
      </button>

      {open && (
        <>
          {/* 바깥을 누르면 닫힌다 */}
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute top-full right-0 z-30 mt-1.5 flex w-36 flex-col overflow-hidden rounded-control border border-line-input bg-surface py-1 shadow-lg">
            <span className="truncate border-b border-line-soft px-3.5 pt-1 pb-2 text-[12px] text-ink-3">
              {email}
            </span>
            <button
              className="cursor-pointer border-0 bg-transparent px-3.5 py-2 text-left text-[13.5px] text-ink hover:bg-surface-sub"
              onClick={() => {
                setOpen(false)
                setRenaming(true)
              }}
            >
              이름 변경
            </button>
            <button
              className="cursor-pointer border-0 bg-transparent px-3.5 py-2 text-left text-[13.5px] text-ink hover:bg-surface-sub"
              onClick={() => signOutEverywhere().then(() => window.location.reload())}
            >
              로그아웃
            </button>
          </div>
        </>
      )}

      {renaming && <RenameDialog current={name} onClose={() => setRenaming(false)} />}
    </div>
  )
}

/** 표시 이름 바꾸기 — 처음 정할 때(NameStep)와 같은 규칙: 2~20자 */
function RenameDialog({ current, onClose }: { current: string; onClose: () => void }) {
  const [value, setValue] = useState(current)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const len = [...value.trim()].length
  const ready = len >= 2 && len <= 20 && value.trim() !== current

  const save = async () => {
    setError(null)
    setBusy(true)
    try {
      const res = await fetch('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: value.trim() }),
      })
      const body = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(body.error ?? '저장하지 못했습니다')
      // 이름은 여러 곳(헤더·승인 명단)이 본다 — 새로 읽는 것이 가장 확실하다
      window.location.reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장하지 못했습니다')
      setBusy(false)
    }
  }

  return (
    <Portal>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(20,28,36,0.35)] p-0 sm:p-6"
        onClick={onClose}
      >
        <div
          className="mx-4 flex w-full max-w-[340px] flex-col gap-4 rounded-card bg-surface p-6"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="text-base font-semibold">이름 변경</span>
          <input
            className="control"
            value={value}
            maxLength={20}
            autoFocus
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && ready && !busy) save()
              if (e.key === 'Escape') onClose()
            }}
          />
          <span className="h-4 text-[12.5px] text-ink-3">
            {error ? (
              <span className="text-red">{error}</span>
            ) : (
              `${len}/20 · 계획서와 승인 명단에 쓰입니다`
            )}
          </span>
          <div className="flex items-center justify-end gap-2">
            <button className="btn btn-sm btn-ghost" onClick={onClose}>
              취소
            </button>
            <button className="btn btn-sm" disabled={!ready || busy} onClick={save}>
              {busy ? '저장 중…' : '저장'}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}
