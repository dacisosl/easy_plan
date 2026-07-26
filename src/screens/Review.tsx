'use client'

/**
 * 검토 — 로직 오류만. 오류가 없으면 바로 내려받기로 보낸다.
 * AI 검토는 생성 파이프라인에 내재화됐고, 인간 검토는 hwpx 빨간 글씨로 대체됐다.
 */

import { useEffect } from 'react'
import { Notice, PlanSubtitle, Screen } from '@/components/ui'
import { usePlanStore } from '@/store/usePlanStore'
import { validate, type Issue } from '@/lib/validate'

export function Review() {
  const { school, go } = usePlanStore()
  const plan = usePlanStore((s) => s.plans.find((p) => p.id === s.currentPlanId))
  const subject = usePlanStore((s) => {
    const p = s.plans.find((x) => x.id === s.currentPlanId)
    return p ? s.subjects.find((x) => x.id === p.subject_id) : undefined
  })

  const errors = plan && subject ? validate(plan, subject, school).errors : []

  // 오류가 없으면 이 화면에 머물 이유가 없다
  useEffect(() => {
    if (plan && subject && errors.length === 0) go('download')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errors.length])

  if (!plan || !subject) return null

  const fix = (i: Issue) => {
    if (i.target === 'performance' || i.target === 'performances') return go('performances')
    if (i.target === 'units') return go('units')
    if (i.target === 'schedule') return go('schedule')
    go('setup')
  }

  return (
    <Screen
      title="로직 오류"
      subtitle={<PlanSubtitle />}
      right={
        <span className="text-[13px] text-ink-3">
          {15 - errors.length}개 규칙 통과 · 오류를 고치면 자동으로 내려받기로 넘어갑니다
        </span>
      }
    >
      <div className="flex flex-col gap-3">
        {errors.map((e, i) => (
          <Notice
            key={i}
            tone="err"
            title={e.title}
            detail={e.detail}
            action={
              <button className="btn btn-sm btn-danger shrink-0" onClick={() => fix(e)}>
                고치기
              </button>
            }
          />
        ))}
      </div>
    </Screen>
  )
}
