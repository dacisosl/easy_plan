'use client'

/**
 * 심화 2단계 · 단원 매핑.
 *
 * 기본은 영역(대단원)당 단원 1개다. 필요하면 행을 눌러 성취기준을 옮기고,
 * '+ 단원 추가'로 소단원으로 세분한다.
 */

import { useState } from 'react'
import { PlanSubtitle, Screen, Section } from '@/components/ui'
import { usePlanStore } from '@/store/usePlanStore'

export function Units() {
  const { go, patchPlan, setUnitStandards, addUnit, patchUnit, removeUnit, redistribute } =
    usePlanStore()
  const plan = usePlanStore((s) => s.plans.find((p) => p.id === s.currentPlanId))
  const subject = usePlanStore((s) => {
    const p = s.plans.find((x) => x.id === s.currentPlanId)
    return p ? s.subjects.find((x) => x.id === p.subject_id) : undefined
  })
  const [open, setOpen] = useState<string | null>(null)
  if (!plan || !subject) return null

  const assigned = new Set(subject.units.flatMap((u) => u.standard_codes))
  const unassigned = subject.standards.filter((s) => !assigned.has(s.code))
  const areaName = (no: string | null) => subject.areas.find((a) => a.no === no)?.name ?? '—'
  const ordered = [...subject.units].sort((a, b) => a.order - b.order)

  return (
    <Screen
      title="단원 매핑"
      subtitle={<PlanSubtitle />}
      right={
        <span className="text-[13px] text-ink-3">
          성취기준 {subject.standards.length}개 중 {subject.standards.length - unassigned.length}개
          배정
        </span>
      }
    >
      {unassigned.length > 0 && (
        <div className="notice-err flex flex-col gap-3">
          <div className="text-base font-semibold text-red">
            배정되지 않은 성취기준 {unassigned.length}개
          </div>
          <div className="flex flex-wrap gap-2">
            {unassigned.map((s) => (
              <span key={s.code} className="chip chip-err">
                {s.code}
              </span>
            ))}
          </div>
          <div className="text-sm text-red-ink">
            배정되지 않은 성취기준은 진도표·시험 범위·Ⅺ 표에서 빠집니다. 단원을 눌러 배정하세요.
          </div>
        </div>
      )}

      <Section title="단원" aside="행을 누르면 성취기준을 고칩니다 · 교과서 소단원으로 세분해도 됩니다">
        <div className="flex flex-col">
          {ordered.map((u) => {
            const expanded = open === u.id
            return (
              <div key={u.id} className="border-b border-line-soft last:border-b-0">
                <div
                  className="grid cursor-pointer grid-cols-[200px_1fr_auto] items-center gap-5 py-3.5 hover:bg-surface-sub"
                  onClick={() => setOpen(expanded ? null : u.id)}
                >
                  <span className="text-sm text-ink-2">{areaName(u.area_no)}</span>
                  <span className="text-[15px]">{u.name || '(이름 없음)'}</span>
                  <span className="flex flex-wrap justify-end gap-1.5">
                    {u.standard_codes.length > 0 ? (
                      u.standard_codes.map((c) => (
                        <span key={c} className="chip chip-tag">
                          {c}
                        </span>
                      ))
                    ) : (
                      <span className="text-sm text-red">성취기준 없음</span>
                    )}
                  </span>
                </div>

                {expanded && (
                  <div className="flex flex-col gap-3 bg-surface-sub px-4 py-4">
                    <div className="flex items-center gap-3">
                      <input
                        className="control max-w-[420px]"
                        value={u.name}
                        placeholder="단원명 (예: 01. 현대인의 삶과 실천윤리)"
                        onChange={(e) => patchUnit(u.id, { name: e.target.value })}
                      />
                      <a className="text-[13px] text-ink-3" onClick={() => addUnit(u.id)}>
                        + 아래에 단원 추가
                      </a>
                      <a className="text-[13px] text-ink-3 hover:text-red" onClick={() => removeUnit(u.id)}>
                        삭제
                      </a>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {subject.standards.map((s) => {
                        const on = u.standard_codes.includes(s.code)
                        const elsewhere =
                          !on && subject.units.some((x) => x.standard_codes.includes(s.code))
                        return (
                          <span
                            key={s.code}
                            className={`chip ${on ? 'chip-on' : ''} ${elsewhere ? 'opacity-45' : ''}`}
                            title={s.text}
                            onClick={() =>
                              setUnitStandards(
                                u.id,
                                on
                                  ? u.standard_codes.filter((c) => c !== s.code)
                                  : [...u.standard_codes, s.code],
                              )
                            }
                          >
                            {s.code}
                          </span>
                        )
                      })}
                    </div>
                    <span className="hint">흐린 칩은 다른 단원에 이미 배정된 성취기준입니다</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
        {ordered.length === 0 && (
          <a className="text-sm" onClick={() => addUnit()}>
            + 첫 단원 추가
          </a>
        )}
      </Section>

      <div className="flex items-center gap-5">
        <button
          className="btn"
          onClick={() => {
            patchPlan({ step: Math.max(plan.step, 3) })
            redistribute()
            go('schedule')
          }}
        >
          다음
        </button>
        <span className="text-[13px] text-ink-3">
          배정되지 않은 성취기준이 있어도 넘어갈 수 있습니다
        </span>
      </div>
    </Screen>
  )
}
