'use client'

import { useState } from 'react'
import { Notice, PlanHeaderTitle, Screen, Section, Stat, StepBar } from '@/components/ui'
import { usePlanStore } from '@/store/usePlanStore'
import { HUMAN_CHECKS, validate, type Issue } from '@/lib/validate'

/** 화면 06 · 검토 */
export function Review() {
  const { school, go, editPerf, patchPlan, setFocusIndex } = usePlanStore()
  const plan = usePlanStore((s) => s.plans.find((p) => p.id === s.currentPlanId))
  const subject = usePlanStore((s) => {
    const p = s.plans.find((x) => x.id === s.currentPlanId)
    return p ? s.subjects.find((x) => x.id === p.subject_id) : undefined
  })
  const [showPassed, setShowPassed] = useState(false)
  if (!plan || !subject) return null

  const result = validate(plan, subject, school)
  const doneChecks = HUMAN_CHECKS.filter((c) => plan.human_checks[c.id]).length
  const firstUnchecked = HUMAN_CHECKS.findIndex((c) => !plan.human_checks[c.id])

  const fix = (i: Issue) => {
    if (i.target === 'performance' && i.perfId) return editPerf(i.perfId)
    if (i.target === 'performances') return go('performances')
    if (i.target === 'units') return go('units')
    if (i.target === 'schedule') return go('schedule')
    go('setup')
  }

  return (
    <Screen
      eyebrow="화면 06 · 검토"
      title={<PlanHeaderTitle />}
      right={<StepBar current="review" />}
      bodyClass="gap-9 max-w-[1080px]"
    >
      <div className="flex gap-12">
        <Stat
          label="로직 오류"
          value={result.errors.length}
          tone={result.errors.length ? 'err' : undefined}
        />
        <Stat label="AI 지적" value={result.ai.length} tone={result.ai.length ? 'warn' : undefined} />
        <Stat
          label="직접 확인"
          value={
            <>
              {doneChecks} <span className="font-medium text-ink-3">/ {HUMAN_CHECKS.length}</span>
            </>
          }
        />
      </div>

      <Section title="로직 검증">
        {result.errors.map((e, i) => (
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

        {/* 통과한 검증은 나열하지 않고 접어 둔다 */}
        <div className="py-1 text-sm text-ink-3">
          <a onClick={() => setShowPassed((v) => !v)}>
            {result.errors.length === 0
              ? `규칙 15개 전부 통과`
              : `나머지 ${result.passed.length}개 규칙 통과`}
          </a>
          {showPassed && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {result.passed.map((n) => (
                <span key={n} className="chip chip-tag">
                  규칙 {n}
                </span>
              ))}
            </div>
          )}
        </div>
      </Section>

      <Section title="AI 검토">
        {result.ai.length === 0 ? (
          <div className="text-sm text-ink-3">지적된 항목이 없습니다</div>
        ) : (
          result.ai.map((a, i) => (
            <div
              key={i}
              className="notice-warn flex cursor-pointer items-center justify-between gap-5 px-6 py-[18px] hover:bg-amber-hover"
              onClick={() => fix(a)}
            >
              <span className="text-[15px]">
                {a.title}
                {a.detail && <span className="text-ink-2"> · {a.detail}</span>}
              </span>
              <span className="shrink-0 text-sm font-medium text-amber">보기</span>
            </div>
          ))
        )}
      </Section>

      <Section title="직접 확인">
        <div className="list">
          {HUMAN_CHECKS.map((c, i) => {
            const done = !!plan.human_checks[c.id]
            const next = i === firstUnchecked
            return (
              <div
                key={c.id}
                className={`flex items-center justify-between gap-5 border-b border-line-soft px-6 last:border-b-0 ${
                  next ? 'bg-navy-bg py-5' : 'py-4'
                }`}
              >
                <span
                  className={
                    next
                      ? 'text-base font-semibold text-navy'
                      : done
                        ? 'text-[15px] text-ink-4 line-through'
                        : 'text-[15px] text-ink-2'
                  }
                >
                  {c.label}
                </span>
                {next && (
                  <button
                    className="btn btn-sm shrink-0"
                    onClick={() => {
                      setFocusIndex(i)
                      go('focus')
                    }}
                  >
                    확인하기
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </Section>

      <div className="flex items-center gap-5 border-t border-line-soft pt-6">
        <button
          className="btn"
          disabled={result.errors.length > 0}
          onClick={() => {
            patchPlan({ step: Math.max(plan.step, 6) })
            go('download')
          }}
        >
          내려받기
        </button>
        <span className={`text-sm ${result.errors.length > 0 ? 'text-red' : 'text-ink-2'}`}>
          {result.errors.length > 0
            ? `로직 오류 ${result.errors.length}개를 고쳐야 내려받을 수 있습니다. AI 지적과 직접 확인은 남아 있어도 됩니다`
            : 'AI 지적과 직접 확인은 남아 있어도 내려받을 수 있습니다'}
        </span>
      </div>
    </Screen>
  )
}
