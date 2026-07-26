'use client'

import { useState } from 'react'
import { Field, LegendDot, PlanHeaderTitle, Screen, Section, StepBar } from '@/components/ui'
import { usePlanStore } from '@/store/usePlanStore'
import { feasibility, monthWeekLabel, noticeWeek, periodLabel, weekHours } from '@/lib/derive'

/** 화면 03 · 진도 설계 */
export function Schedule() {
  const { school, go, patchPlan, redistribute, setWeekUnits } = usePlanStore()
  const plan = usePlanStore((s) => s.plans.find((p) => p.id === s.currentPlanId))
  const subject = usePlanStore((s) => {
    const p = s.plans.find((x) => x.id === s.currentPlanId)
    return p ? s.subjects.find((x) => x.id === p.subject_id) : undefined
  })
  const [openWeek, setOpenWeek] = useState<number | null>(null)

  if (!plan || !subject) return null

  const weeks = school.calendar.weeks
  const hours = weekHours(weeks, plan.credit)
  const fit = feasibility(subject.units, weeks)
  const orderedUnits = [...subject.units].sort((a, b) => a.order - b.order)
  const unitLabel = (id: string) => {
    const i = orderedUnits.findIndex((u) => u.id === id)
    return i < 0 ? '?' : String(i + 1).padStart(2, '0')
  }

  const noticeWeeks = new Set<number>()
  const perfWeeks = new Set<number>()
  for (const p of plan.performances) {
    noticeWeeks.add(noticeWeek(p, school.rules.notice_lead_weeks))
    perfWeeks.add(p.week)
  }

  const setAnchor = (no: number, unitId: string) => {
    patchPlan({
      exams: plan.exams.map((e) => (e.no === no ? { ...e, anchor_unit: unitId || null } : e)),
    })
    setTimeout(redistribute, 0)
  }

  return (
    <Screen
      eyebrow="화면 03 · 진도 설계"
      title={<PlanHeaderTitle />}
      right={<StepBar current="schedule" />}
      bodyClass="gap-7"
    >
      {plan.exams.length > 0 && (
        <div className="flex flex-wrap gap-6">
          {plan.exams.map((e) => (
            <Field
              key={e.no}
              label={`${e.no}회 정기시험 마지막 단원`}
              className="w-[340px]"
              hint={`${e.week}주 실시 · ${monthWeekLabel(school, e.week)}`}
            >
              <select
                className="control"
                value={e.anchor_unit ?? ''}
                onChange={(ev) => setAnchor(e.no, ev.target.value)}
              >
                <option value="">— 고르세요 —</option>
                {orderedUnits.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </Field>
          ))}
        </div>
      )}

      <div className="notice-info flex items-center gap-3.5 px-6 py-[18px]">
        <span className="text-base font-semibold text-navy">
          {fit.ok ? '배치 가능' : '배치 불가'}
        </span>
        <span className="text-sm text-navy-mid">{fit.message}</span>
        <button className="btn btn-sm btn-ghost ml-auto" onClick={redistribute}>
          다시 배분
        </button>
      </div>

      <Section
        title={`${weeks.length}주 배분`}
        aside={
          <div className="flex items-center gap-5 text-[13px] text-ink-2">
            <LegendDot className="border border-navy-line bg-navy-bg">정기시험</LegendDot>
            <LegendDot className="border border-amber-line bg-amber-bg">수행평가 실시</LegendDot>
            <LegendDot className="border border-dashed border-amber-dash bg-surface">
              수행평가 안내
            </LegendDot>
          </div>
        }
      >
        <div className="grid grid-cols-7 gap-2">
          {weeks.map((w) => {
            const units = plan.distribution[w.no] ?? []
            const isPerf = perfWeeks.has(w.no)
            const isNotice = noticeWeeks.has(w.no) && !isPerf
            const h = hours.find((x) => x.no === w.no)!

            const skin = w.is_exam
              ? 'border border-navy-line bg-navy-bg'
              : isPerf
                ? 'border border-amber-line bg-amber-bg'
                : isNotice
                  ? 'border border-dashed border-amber-dash bg-surface'
                  : 'border border-line bg-surface hover:border-navy-line-hover'

            return (
              <div
                key={w.no}
                onClick={() => !w.is_exam && setOpenWeek(openWeek === w.no ? null : w.no)}
                title={`${monthWeekLabel(school, w.no)} · 예정 ${h.planned}시간 · 누계 ${h.cumulative}시간${
                  w.events.length ? ` · ${w.events.join(', ')}` : ''
                }`}
                className={`flex min-h-[78px] flex-col gap-2 rounded-control px-3 pt-2.5 pb-3 ${skin} ${
                  w.is_exam ? '' : 'cursor-pointer'
                } ${openWeek === w.no ? 'outline-2 outline-navy' : ''}`}
              >
                <div
                  className={`flex justify-between text-xs ${
                    w.is_exam ? 'text-navy-mid' : isPerf ? 'text-amber-ink' : 'text-ink-3'
                  }`}
                >
                  <span>{w.no}주</span>
                  <span>{periodLabel(w)}</span>
                </div>

                {w.is_exam ? (
                  <div className="text-sm font-semibold text-navy">
                    {plan.exams.find((e) => e.week === w.no)?.no ?? ''}회 정기시험
                  </div>
                ) : (
                  <div className="text-sm">{units.map(unitLabel).join(' · ') || '—'}</div>
                )}

                {isPerf && <div className="text-xs font-semibold text-amber">수행평가 실시</div>}
                {isNotice && <div className="text-xs text-amber">수행평가 안내</div>}
              </div>
            )
          })}
        </div>

        <div className="text-[13px] text-ink-2">
          칸을 누르면 그 주에 들어갈 단원을 옮길 수 있습니다
        </div>
      </Section>

      {openWeek !== null && (
        <div className="flex flex-col gap-3.5 rounded-box border border-navy-line px-6 py-[22px]">
          <div className="flex items-baseline gap-3">
            <span className="text-base font-semibold">
              {openWeek}주 · {monthWeekLabel(school, openWeek)}
            </span>
            <span className="text-[13px] text-ink-2">
              예정 {hours.find((x) => x.no === openWeek)!.planned}시간 · 실시누계{' '}
              {hours.find((x) => x.no === openWeek)!.cumulative}시간
            </span>
            <a className="ml-auto text-sm" onClick={() => setOpenWeek(null)}>
              닫기
            </a>
          </div>
          <div className="flex flex-wrap gap-2">
            {orderedUnits.map((u, i) => {
              const on = (plan.distribution[openWeek] ?? []).includes(u.id)
              return (
                <span
                  key={u.id}
                  className={`chip ${on ? 'chip-on' : ''}`}
                  onClick={() => {
                    const cur = plan.distribution[openWeek] ?? []
                    setWeekUnits(openWeek, on ? cur.filter((x) => x !== u.id) : [...cur, u.id])
                  }}
                >
                  {String(i + 1).padStart(2, '0')} {u.name.replace(/^\d+\.\s*/, '')}
                </span>
              )
            })}
          </div>
        </div>
      )}

      <div className="pt-1">
        <button
          className="btn"
          onClick={() => {
            patchPlan({ step: Math.max(plan.step, 4) })
            go('performances')
          }}
        >
          다음
        </button>
      </div>
    </Screen>
  )
}
