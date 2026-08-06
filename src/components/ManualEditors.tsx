'use client'

/**
 * 직접 입력(선택) 편집기 두 개 — 자동을 믿지 않고 손으로 하고 싶은 선생님을 위한 문.
 *
 *  ① DistributionEditor  교과진도계획: 주차별로 성취기준을 직접 나눈다.
 *     성취기준만 나누면 단원명·주안점은 그 배분을 따라 자동으로 만들어진다.
 *     한 주라도 손대면 수동 배분이 되어, 시험 범위를 바꿔도 자동이 덮지 않는다.
 *  ② SemesterLevelsEditor 학기단위 성취수준: A~E 문장을 직접 쓴다.
 *     저장하면 AI가 덮지 않고, 문서에도 (검토 표시인) 빨강이 아니라 검정으로 나간다.
 */

import { useMemo, useState } from 'react'
import { ConfirmDialog, Portal } from '@/components/ui'
import { usePlanStore } from '@/store/usePlanStore'
import { monthWeekLabel, orderedStandardCodes, weeksOf } from '@/lib/derive'
import type { Subject } from '@/types'

/* ── ① 교과진도계획 ───────────────────────────── */

export function DistributionEditor({ onClose }: { onClose: () => void }) {
  const { school, setWeekStandards, redistribute } = usePlanStore()
  const plan = usePlanStore((s) => s.plans.find((p) => p.id === s.currentPlanId))
  const subject = usePlanStore((s) => {
    const p = s.plans.find((x) => x.id === s.currentPlanId)
    return p ? s.subjects.find((x) => x.id === p.subject_id) : undefined
  })
  const [confirmReset, setConfirmReset] = useState(false)
  const codes = useMemo(() => (subject ? orderedStandardCodes(subject) : []), [subject])
  if (!plan || !subject) return null

  const weeks = weeksOf(school, plan.semester)
  const stdText = (c: string) => subject.standards.find((s) => s.code === c)?.text ?? ''
  const assignedWeeks = (c: string) =>
    Object.entries(plan.distribution)
      .filter(([, cs]) => cs.includes(c))
      .map(([wk]) => Number(wk))
      .sort((a, b) => a - b)
  const unassigned = codes.filter((c) => assignedWeeks(c).length === 0)

  const add = (week: number, code: string) => {
    if (!code) return
    const cur = plan.distribution[week] ?? []
    if (!cur.includes(code)) setWeekStandards(week, [...cur, code])
  }
  const remove = (week: number, code: string) =>
    setWeekStandards(
      week,
      (plan.distribution[week] ?? []).filter((c) => c !== code),
    )

  return (
    <Portal>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(20,28,36,0.35)] p-0 sm:p-6"
        onClick={onClose}
      >
        <div
          className="flex h-full max-h-full w-full flex-col gap-3 rounded-none bg-surface p-4 sm:h-auto sm:max-h-[82vh] sm:max-w-[880px] sm:rounded-card sm:p-6"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="flex flex-col gap-0.5">
              <h2 className="text-[16px] font-semibold">교과진도계획 직접 입력</h2>
              <span className="text-[12.5px] text-ink-3">
                성취기준만 나눠 주세요 — 단원명과 주안점 문안은 이 배분을 따라 자동으로
                만들어집니다. 고치는 즉시 반영됩니다.
              </span>
            </div>
            <div className="flex items-center gap-2">
              {plan.distribution_manual && (
                <button className="btn btn-sm btn-ghost" onClick={() => setConfirmReset(true)}>
                  자동 배분으로 되돌리기
                </button>
              )}
              <button className="btn btn-sm" onClick={onClose}>
                닫기
              </button>
            </div>
          </div>

          {unassigned.length > 0 && (
            <div className="notice-warn text-[12.5px] leading-relaxed text-amber-ink">
              아직 배정되지 않은 성취기준 {unassigned.length}개 — {unassigned.join(' · ')}
            </div>
          )}

          <div className="flex flex-col divide-y divide-line-soft overflow-y-auto rounded-box border border-line-card">
            {weeks.map((w) => {
              const cur = plan.distribution[w.no] ?? []
              return (
                <div key={w.no} className="flex items-start gap-3 px-3 py-2.5 sm:px-4">
                  <span className="w-[88px] shrink-0 pt-1 text-[12.5px] text-ink-3">
                    <b className="text-ink">{w.no}주</b> ·{' '}
                    {monthWeekLabel(school, plan.semester, w.no)}
                  </span>

                  {w.is_exam ? (
                    <span className="pt-1 text-[12.5px] text-ink-4">
                      정기시험 주 — 진도를 두지 않습니다
                    </span>
                  ) : (
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                      {cur.map((c) => (
                        <button
                          key={c}
                          className="chip group text-[12px]"
                          title={`${stdText(c)}\n(누르면 이 주에서 뺍니다)`}
                          onClick={() => remove(w.no, c)}
                        >
                          {c} <span className="text-ink-4 group-hover:text-red">×</span>
                        </button>
                      ))}
                      {/*
                       * 값은 늘 ''로 되돌린다 — select는 '고르는 순간 한 번'만 쓰는
                       * 추가 버튼이지 상태 표시가 아니다.
                       */}
                      <select
                        className="h-8 max-w-[220px] cursor-pointer rounded-control border border-line-input bg-surface px-2 text-[12px] text-ink-3"
                        value=""
                        onChange={(e) => add(w.no, e.target.value)}
                      >
                        <option value="">+ 성취기준 추가</option>
                        {codes.map((c) => {
                          const at = assignedWeeks(c)
                          return (
                            <option key={c} value={c} disabled={cur.includes(c)}>
                              {c} {stdText(c).slice(0, 22)}
                              {at.length > 0
                                ? ` — ${at.map((x) => `${x}주`).join('·')}`
                                : ' (미배정)'}
                            </option>
                          )
                        })}
                      </select>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <span className="hint">
            같은 성취기준을 이어지는 두 주에 넣으면 문서에는 뒷주에 ‘(계속)’이 붙습니다 · 비워 둔
            주는 복습·보충으로 채워집니다
          </span>
        </div>
      </div>

      {confirmReset && (
        <ConfirmDialog
          title="자동 배분으로 되돌릴까요?"
          detail="직접 나눈 배분이 지워지고, 시험 범위 기준으로 다시 배분됩니다."
          confirmLabel="되돌리기"
          onConfirm={() => {
            redistribute(true)
            setConfirmReset(false)
          }}
          onClose={() => setConfirmReset(false)}
        />
      )}
    </Portal>
  )
}

/* ── ② 학기단위 성취수준 ─────────────────────── */

const LEVEL_KEYS = ['A', 'B', 'C', 'D', 'E'] as const

export function SemesterLevelsEditor({ onClose }: { onClose: () => void }) {
  const { patchSubject } = usePlanStore()
  const subject = usePlanStore((s) => {
    const p = s.plans.find((x) => x.id === s.currentPlanId)
    return p ? s.subjects.find((x) => x.id === p.subject_id) : undefined
  })
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(LEVEL_KEYS.map((k) => [k, subject?.semester_levels?.[k] ?? ''])),
  )
  if (!subject) return null

  const keys = subject.scale_type === 'LVL_3' ? LEVEL_KEYS.slice(0, 3) : LEVEL_KEYS
  const dirty = keys.some((k) => (subject.semester_levels?.[k] ?? '') !== values[k])

  const save = () => {
    const semester_levels: Subject['semester_levels'] = {}
    for (const k of keys) if (values[k].trim()) semester_levels[k] = values[k].trim()
    patchSubject({ semester_levels, semester_levels_manual: true })
    onClose()
  }

  return (
    <Portal>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(20,28,36,0.35)] p-0 sm:p-6"
        onClick={onClose}
      >
        <div
          className="flex h-full max-h-full w-full flex-col gap-4 rounded-none bg-surface p-4 sm:h-auto sm:max-h-[82vh] sm:max-w-[640px] sm:rounded-card sm:p-6"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-col gap-0.5">
            <h2 className="text-[16px] font-semibold">학기단위 성취수준 직접 입력</h2>
            <span className="text-[12.5px] leading-relaxed text-ink-3">
              직접 쓴 문장은 AI가 덮지 않고, 문서에 검정 글씨로 나갑니다(검토 대상이 아니라는 뜻).{' '}
              {subject.scale_type === 'LVL_3' && 'ㆍ3단계 과목이라 A~C만 씁니다.'}
            </span>
          </div>

          <div className="flex flex-col gap-3 overflow-y-auto">
            {keys.map((k) => (
              <label key={k} className="flex flex-col gap-1.5">
                <span className="label">{k}</span>
                <textarea
                  className="control min-h-[64px] resize-y py-2 leading-relaxed"
                  value={values[k]}
                  placeholder={`${k} 수준 학생의 성취를 문장으로`}
                  onChange={(e) => setValues((v) => ({ ...v, [k]: e.target.value }))}
                />
              </label>
            ))}
          </div>

          <div className="flex items-center justify-between gap-2">
            {subject.semester_levels_manual ? (
              <button
                className="cursor-pointer border-0 bg-transparent p-0 text-[12.5px] text-ink-3 underline-offset-4 hover:underline"
                onClick={() => {
                  patchSubject({ semester_levels_manual: false })
                  onClose()
                }}
              >
                자동(AI) 문안으로 되돌리기
              </button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
              <button className="btn btn-sm btn-ghost" onClick={onClose}>
                취소
              </button>
              <button className="btn btn-sm" disabled={!dirty} onClick={save}>
                저장
              </button>
            </div>
          </div>
        </div>
      </div>
    </Portal>
  )
}
