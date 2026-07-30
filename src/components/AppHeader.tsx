'use client'

/**
 * 앱 헤더 — 좌 로고+제목 / 중앙 간판 / 우 액션.
 *
 * 가운데 간판이 '지금 무엇을 만지고 있는지'를 늘 알려 준다.
 * 화면 안에 큰 제목을 또 두지 않는 대신, 스크롤해도 따라오는 이 줄이 그 역할을 한다.
 */

import { useEffect, useRef, useState } from 'react'
import { useMe } from '@/components/AuthGate'
import { signOutEverywhere } from '@/lib/firebase/client'
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
          {/* '편집'만 굵게 — 이 도구가 대신 해 주는 일이 그것이다 */}
          <span
            className="text-[18px] font-medium tracking-[-0.02em] text-ink"
            style={{ fontFamily: 'var(--font-title)' }}
          >
            평가계획 <b className="font-extrabold">편집</b>기
          </span>
        </button>

        {/* 첫 화면에는 안내를 두지 않는다 — 화면 한가운데가 이미 그 말을 하고 있다 */}
        {plan && subject ? (
          <div className="nameplate justify-self-center">
            <span className="hidden text-ink-2 sm:inline">
              {year}학년도 {plan.semester}학기
            </span>
            <span className="hidden text-ink-4 sm:inline">·</span>
            <span className="font-semibold text-ink">{subject.name}</span>
            <span className="ml-0.5 flex items-center gap-1.5 border-l border-line-input pl-2.5 text-navy">
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
        <div className="flex items-center gap-2 justify-self-end">
          {currentPlanId && (
            <button
              className="btn btn-sm btn-ghost whitespace-nowrap"
              onClick={screen === 'home' ? startNew : () => go('home')}
            >
              이전
            </button>
          )}
          {screen !== 'home' && (
            <button
              className="btn btn-sm btn-ghost whitespace-nowrap"
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
           * 로그인은 선택이다 — 여는 것은 AI 문안 하나.
           * 로컬(설정 없음)에서는 아무것도 안 보인다. 없는 문을 그려 두면 눌러 보게 된다.
           */}
          {me?.authDisabled ? null : me?.email ? (
            <button
              className="btn btn-sm btn-ghost max-w-[120px] truncate whitespace-nowrap"
              title={`${me.email} — 로그아웃`}
              onClick={() => {
                if (window.confirm('로그아웃할까요?'))
                  signOutEverywhere().then(() => window.location.reload())
              }}
            >
              {me.displayName ?? me.email}
            </button>
          ) : (
            <a className="btn btn-sm btn-ghost whitespace-nowrap" href="/login" title="AI 문안용">
              로그인
            </a>
          )}
        </div>
      </div>
    </header>
  )
}
