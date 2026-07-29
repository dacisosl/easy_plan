'use client'

/**
 * 앱 헤더 — 좌 로고+제목 / 중앙 간판 / 우 액션.
 *
 * 가운데 간판이 '지금 무엇을 만지고 있는지'를 늘 알려 준다.
 * 화면 안에 큰 제목을 또 두지 않는 대신, 스크롤해도 따라오는 이 줄이 그 역할을 한다.
 */

import { useEffect, useRef, useState } from 'react'
import { usePlanStore, type ScreenId } from '@/store/usePlanStore'

const DOING: Record<ScreenId, string> = {
  home: '편집 중',
  generating: '만드는 중',
  download: '내려받기',
  admin: '관리자',
}

export function AppHeader() {
  const { screen, go, currentPlanId, startNew } = usePlanStore()
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
      <div className="mx-auto grid h-16 max-w-[880px] grid-cols-[1fr_auto_1fr] items-center px-6">
        <button
          className="flex cursor-pointer items-center gap-2.5 justify-self-start border-0 bg-transparent"
          onClick={() => go('home')}
          title="처음으로"
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
          <span className="text-sm font-semibold text-ink">평가계획 도우미</span>
        </button>

        {/* 첫 화면에는 안내를 두지 않는다 — 화면 한가운데가 이미 그 말을 하고 있다 */}
        {plan && subject ? (
          <div className="nameplate justify-self-center">
            <span className="text-ink-2">
              {year}학년도 {plan.semester}학기
            </span>
            <span className="text-ink-4">·</span>
            <span className="font-semibold text-ink">{subject.name}</span>
            <span className="ml-0.5 flex items-center gap-1.5 border-l border-line-input pl-2.5 text-navy">
              <span className="pulse-dot" />
              {DOING[screen]}
            </span>
          </div>
        ) : (
          <span />
        )}

        <div className="flex items-center gap-2 justify-self-end">
          {screen !== 'home' && (
            <button className="btn btn-sm btn-ghost" onClick={() => go('home')}>
              작성으로
            </button>
          )}
          {currentPlanId && (
            <button className="btn btn-sm btn-accent" onClick={startNew}>
              새 계획서
            </button>
          )}
          <button
            className="btn btn-sm btn-ghost"
            onClick={() => go('admin')}
            title="학사일정 · 예정시간 배포표 · 학교 규칙"
          >
            관리자
          </button>
        </div>
      </div>
    </header>
  )
}
