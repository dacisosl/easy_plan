'use client'

/**
 * 앱 헤더 — 좌 로고+제목 / 중앙 간판 / 우 액션.
 *
 * 가운데 간판이 '지금 무엇을 만지고 있는지'를 늘 알려 준다.
 * 화면 안에 큰 제목을 또 두지 않는 대신, 스크롤해도 따라오는 이 줄이 그 역할을 한다.
 */

import { usePlanStore, type ScreenId } from '@/store/usePlanStore'

const DOING: Record<ScreenId, string> = {
  home: '편집 중',
  generating: '만드는 중',
  download: '내려받기',
  admin: '관리자',
}

export function AppHeader() {
  const { screen, go, currentPlanId, startNew } = usePlanStore()
  const plan = usePlanStore((s) => s.plans.find((p) => p.id === s.currentPlanId))
  const subject = usePlanStore((s) => {
    const p = s.plans.find((x) => x.id === s.currentPlanId)
    return p ? s.subjects.find((x) => x.id === p.subject_id) : undefined
  })
  const year = usePlanStore(
    (s) => s.school.calendars.find((c) => c.semester === plan?.semester)?.year,
  )

  return (
    <header className="sticky top-0 z-10 border-b border-line-soft bg-white">
      <div className="mx-auto flex h-14 max-w-[1200px] items-center justify-between px-6">
        <button
          className="flex cursor-pointer items-center gap-2.5 border-0 bg-transparent"
          onClick={() => go('home')}
          title="처음으로"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-[7px] bg-navy text-[13px] font-semibold text-white">
            평
          </span>
          <span className="text-sm font-semibold text-ink">평가계획 도우미</span>
        </button>

        {plan && subject ? (
          <div className="nameplate">
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
          <span className="text-xs text-ink-3">과목을 고르면 시작합니다</span>
        )}

        <div className="flex items-center gap-2">
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
