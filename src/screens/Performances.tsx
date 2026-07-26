'use client'

import { PlanHeaderTitle, Screen, StepBar } from '@/components/ui'
import { usePlanStore } from '@/store/usePlanStore'
import { ratioTotal, rubricMax } from '@/lib/derive'

/** 화면 04 · 수행평가 목록 */
export function Performances() {
  const { school, go, patchPlan, editPerf, addPerf } = usePlanStore()
  const plan = usePlanStore((s) => s.plans.find((p) => p.id === s.currentPlanId))
  if (!plan) return null

  const total = ratioTotal(plan, school.rules.exam_ratio)
  const perfSum = plan.performances.reduce((s, p) => s + p.ratio, 0)
  const left = 100 - total

  return (
    <Screen
      eyebrow="화면 04 · 수행평가 목록"
      title={<PlanHeaderTitle />}
      right={<StepBar current="performances" />}
      bodyClass="gap-5 max-w-[1080px]"
    >
      {plan.performances.map((p) => {
        const rmax = rubricMax(p)
        const baseBad = p.max_score > 0 && p.base_score > p.max_score
        const rubricBad = p.rubric.length === 0 || rmax !== p.max_score
        return (
          <div
            key={p.id}
            className="flex cursor-pointer flex-col gap-4 rounded-box border border-line px-6 py-[22px] hover:border-navy-line-hover"
            onClick={() => editPerf(p.id)}
          >
            <div className="flex flex-col gap-1.5">
              <span className="text-[19px] font-semibold">{p.name || '(이름 없음)'}</span>
              <span className="text-sm text-ink-2">
                {p.method} · {p.ratio}% · {p.max_score}점 · {p.week}주 실시
              </span>
            </div>
            <div className="flex gap-5 text-[13px] text-ink-2">
              <span>성취기준 {p.standard_codes.length}개</span>
              <span className={rubricBad ? 'font-semibold text-amber' : ''}>
                {p.rubric.length === 0
                  ? '루브릭 없음'
                  : rubricBad
                    ? `루브릭 배점 합 ${rmax}점 · 만점 ${p.max_score}점과 불일치`
                    : `루브릭 ${p.rubric.length}행`}
              </span>
              <span className={baseBad ? 'font-semibold text-amber' : ''}>
                기본점수 {p.base_score}점{baseBad ? ' · 만점 초과' : ''}
              </span>
            </div>
          </div>
        )
      })}

      <div
        className="cursor-pointer rounded-box border border-dashed border-line-input px-6 py-5 text-[15px] text-ink-2 hover:border-navy-line-hover hover:text-navy"
        onClick={addPerf}
      >
        + 수행평가 추가
      </div>

      <div className="flex items-center justify-between border-t border-line-soft pt-6">
        <div className="flex items-baseline gap-3">
          <span className="text-[15px] text-ink-2">
            정기시험 {plan.exam_count > 0 ? school.rules.exam_ratio : 0}% + 수행평가 {perfSum}%
          </span>
          <span className={`text-base font-semibold ${left === 0 ? 'text-navy' : 'text-amber'}`}>
            = {total}%
            {left === 0 ? ' · 합계 100%' : ` · ${left > 0 ? `${left}% 남음` : `${-left}% 초과`}`}
          </span>
        </div>
        <button
          className="btn"
          onClick={() => {
            patchPlan({ step: Math.max(plan.step, 5) })
            go('review')
          }}
        >
          다음
        </button>
      </div>
    </Screen>
  )
}
