'use client'

/**
 * 앱 헤더 — 좌 로고+제목 / 중앙 현재 위치 / 우 액션.
 *
 * 작성 흐름이 한 화면(홈)으로 합쳐져서 단계 표시가 없다.
 * 홈 → 생성 → 내려받기가 전부이고, 오류는 내려받기 화면에서 홈으로 되돌린다.
 */

import { usePlanStore, type ScreenId } from '@/store/usePlanStore'

const WHERE: Partial<Record<ScreenId, string>> = {
  home: '한 화면에 다 적으면 됩니다',
  generating: '계획서를 만드는 중',
  download: '내려받기',
  admin: '관리자 — 학사일정 · 배포표 · 학교 규칙',
}

export function AppHeader() {
  const { screen, go } = usePlanStore()

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

        <span className="text-xs text-ink-3">{WHERE[screen] ?? ''}</span>

        <div className="flex items-center gap-2">
          {screen !== 'home' && (
            <button className="btn btn-sm btn-ghost" onClick={() => go('home')}>
              홈
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
