'use client'

import type { ReactNode } from 'react'
import { PlanHeaderTitle, Screen } from '@/components/ui'
import { usePlanStore } from '@/store/usePlanStore'
import { HUMAN_CHECKS, validate } from '@/lib/validate'

/** 자동으로 채워진 값 표시 */
function Auto({ children }: { children: ReactNode }) {
  const show = usePlanStore((s) => s.showAutoMarks)
  if (!show) return <>{children}</>
  return <span className="rounded-tag bg-navy-bg px-2.5 py-1 text-navy">{children}</span>
}

/** 화면 12 · 생성 결과 */
export function Result() {
  const { school, go, showAutoMarks, editPerf } = usePlanStore()
  const plan = usePlanStore((s) => s.plans.find((p) => p.id === s.currentPlanId))
  const subject = usePlanStore((s) => {
    const p = s.plans.find((x) => x.id === s.currentPlanId)
    return p ? s.subjects.find((x) => x.id === p.subject_id) : undefined
  })
  if (!plan || !subject) return null

  const result = validate(plan, subject, school)
  const doneChecks = HUMAN_CHECKS.filter((c) => (plan.human_checks ?? {})[c.id]).length
  const assigned = new Set(subject.units.flatMap((u) => u.standard_codes))
  const elements = plan.performances.reduce((s, p) => s + p.rubric.length, 0)
  const levels = plan.performances.reduce(
    (s, p) => s + p.rubric.reduce((t, r) => t + r.levels.length, 0),
    0,
  )

  const rows: [string, ReactNode][] = [
    [
      '진도',
      <Auto key="d">
        {school.calendar.weeks.length}주 배분 · 정기시험{' '}
        {plan.exams.map((e) => `${e.week}주`).join(' / ') || '없음'}
      </Auto>,
    ],
    [
      '수행평가',
      <span key="p" className="flex flex-wrap items-center gap-2">
        {plan.performances.length}개 ·
        {plan.performances.map((p) => (
          <Auto key={p.id}>
            {p.method} {p.ratio}%
          </Auto>
        ))}
      </span>,
    ],
    [
      '성취기준',
      <Auto key="s">
        {subject.standards.length}개 중 {assigned.size}개 배정
      </Auto>,
    ],
    [
      '루브릭',
      <Auto key="r">
        평가 요소 {elements}개 · 기준 서술 {levels}줄
      </Auto>,
    ],
    [
      '검증',
      <span key="v">
        로직 {result.passed.length}개 통과
        {result.errors.length > 0 && <span className="text-red"> · 오류 {result.errors.length}개</span>}{' '}
        ·{' '}
        <span className="text-amber">
          직접 확인 {HUMAN_CHECKS.length - doneChecks}개 남음
        </span>
      </span>,
    ],
  ]

  return (
    <Screen
      eyebrow="화면 12 · 생성 결과"
      title={<PlanHeaderTitle />}
      right={<span className="text-[13px] text-ink-2">간단 작성 완료</span>}
      bodyClass="gap-8 max-w-[900px]"
    >
      {showAutoMarks && (
        <div className="flex items-center gap-2 text-sm text-navy-mid">
          <span className="h-3 w-3 rounded-[3px] border border-navy-line bg-navy-bg" />
          표시된 값은 자동으로 채워졌습니다. 그대로 문서에 들어가니 한 번 훑어보세요
        </div>
      )}

      <div className="flex flex-col gap-3.5">
        {rows.map(([k, v], i) => (
          <div
            key={k}
            className={`flex items-center justify-between pb-3.5 text-[15px] ${
              i < rows.length - 1 ? 'border-b border-line-soft' : ''
            }`}
          >
            <span className="text-ink-2">{k}</span>
            <span>{v}</span>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-6">
        <button
          className="btn btn-lg"
          onClick={() => go(result.errors.length > 0 ? 'review' : 'download')}
        >
          {result.errors.length > 0 ? '검토로 이동' : '이대로 내려받기'}
        </button>
        <a
          className="text-[15px] text-navy-mid"
          onClick={() =>
            plan.performances[0] ? editPerf(plan.performances[0].id) : go('performances')
          }
        >
          수정하기 · 수행평가 편집으로
        </a>
      </div>

      <span className="hint">
        자동 채움은 결정적 규칙으로 돕니다 — 실시 의도의 낱말에서 평가 방법을, 진도 배분에서
        성취기준을, 영역 만점에서 루브릭 배점을 가져옵니다. 숫자는 AI가 정하지 않습니다.
      </span>
    </Screen>
  )
}
