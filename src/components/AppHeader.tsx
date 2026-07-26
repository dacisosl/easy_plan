'use client'

/**
 * 앱 헤더 — 좌 로고+제목 / 중앙 단계(심화 진행 중일 때만) / 우 액션.
 *
 * 진행 표시는 막대 대신 단계 이름: 완료 = 체크, 현재 = 밑줄, 이후 = 흐림.
 * 완료·현재 단계는 클릭으로 이동할 수 있다.
 */

import { STEPS, usePlanStore } from '@/store/usePlanStore'

export function AppHeader() {
  const { screen, go, currentPlanId, plans, newPlan } = usePlanStore()
  const plan = plans.find((p) => p.id === currentPlanId)
  const showSteps = !!plan && plan.mode === '심화' && screen !== 'home'

  const stepIdx = STEPS.findIndex((s) => s.id === screen)
  const maxStep = plan ? plan.step : 1

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

        {showSteps ? (
          <nav className="flex items-center gap-4">
            {STEPS.map((s, i) => {
              const isCurrent = i === stepIdx || (screen === 'review' && s.id === 'download')
              const isDone = i + 1 < maxStep && !isCurrent
              const reachable = i + 1 <= maxStep
              return (
                <button
                  key={s.id}
                  disabled={!reachable}
                  onClick={() => reachable && go(s.id)}
                  className={`flex cursor-pointer items-center gap-1 border-0 bg-transparent pb-[3px] text-xs ${
                    isCurrent
                      ? 'border-b-2 border-navy font-semibold text-navy'
                      : isDone
                        ? 'text-ink-3 hover:text-navy'
                        : reachable
                          ? 'text-ink-3 hover:text-navy'
                          : 'cursor-default text-ink-5'
                  }`}
                >
                  {isDone && <span aria-hidden>✓</span>}
                  {s.label}
                </button>
              )
            })}
          </nav>
        ) : (
          <span className="text-xs text-ink-3">
            {screen === 'home' ? '간단 작성 — 한 화면이면 됩니다' : ''}
          </span>
        )}

        <div className="flex items-center gap-2">
          {screen !== 'home' && (
            <button className="btn btn-sm btn-ghost" onClick={() => go('home')}>
              홈
            </button>
          )}
          <button className="btn btn-sm" onClick={() => newPlan('심화')}>
            심화로 작성
          </button>
        </div>
      </div>
    </header>
  )
}
