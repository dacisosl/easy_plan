'use client'

/**
 * 수행평가 — 인라인 카드. 명칭 · 시기 · 의도 (+심화 한정 비율).
 *
 * 루브릭 편집 UI는 없다. 입력이 바뀌면 방법·만점·기본점수·성취기준·루브릭 뼈대를
 * 결정적으로 재계산한다(buildPerformance). 문안은 export 때 AI가 쓴다.
 */

import { useState } from 'react'
import { Field, PlanSubtitle, Screen } from '@/components/ui'
import { usePlanStore } from '@/store/usePlanStore'
import { monthWeekLabel, ratioTotal } from '@/lib/derive'

export function Performances() {
  const { school, go, patchPlan, upsertPerf, removePerf } = usePlanStore()
  const plan = usePlanStore((s) => s.plans.find((p) => p.id === s.currentPlanId))
  const [adding, setAdding] = useState(false)
  if (!plan) return null

  const total = ratioTotal(plan, school.rules.exam_ratio)
  const left = 100 - total
  const teachWeeks = school.calendar.weeks.filter((w) => !w.is_exam)

  return (
    <Screen
      title="수행평가"
      subtitle={<PlanSubtitle />}
      right={
        <span className={`text-[13px] ${left === 0 ? 'text-ink-3' : 'text-amber'}`}>
          정기시험 {plan.exam_count > 0 ? school.rules.exam_ratio : 0}% + 수행평가{' '}
          {plan.performances.reduce((s, p) => s + p.ratio, 0)}% = {total}%
          {left !== 0 && ` · ${left > 0 ? `${left}% 남음` : `${-left}% 초과`}`}
        </span>
      }
    >
      <p className="-mt-2 text-sm text-ink-2">
        명칭·시기·의도만 정하면 됩니다. 비율·배점·성취기준·루브릭 뼈대는 계산되고, 활동 과정과
        기준 서술 문장은 내려받을 때 AI가 초안을 씁니다(빨간 글씨).
      </p>

      <div className="flex flex-col gap-4">
        {plan.performances.map((p) => (
          <PerfCard
            key={p.id}
            perf={p}
            teachWeeks={teachWeeks.map((w) => w.no)}
            onSave={(patch) => upsertPerf({ id: p.id, ...patch })}
            onRemove={() => removePerf(p.id)}
          />
        ))}

        {adding ? (
          <PerfCard
            perf={null}
            teachWeeks={teachWeeks.map((w) => w.no)}
            onSave={(patch) => {
              upsertPerf(patch)
              setAdding(false)
            }}
            onRemove={() => setAdding(false)}
          />
        ) : (
          <div
            className="cursor-pointer rounded-box border border-dashed border-line-input px-6 py-5 text-[15px] text-ink-2 hover:border-navy-line-hover hover:text-navy"
            onClick={() => setAdding(true)}
          >
            + 수행평가 추가
          </div>
        )}
      </div>

      <div className="flex items-center gap-4 border-t border-line-soft pt-6">
        <button
          className="btn"
          onClick={() => {
            patchPlan({ step: Math.max(plan.step, 5) })
            go('generating')
          }}
        >
          문안 만들고 내려받기
        </button>
        <span className="text-[13px] text-ink-3">AI 문안 생성 → 오류 확인 → 내려받기 순서로 갑니다</span>
      </div>
    </Screen>
  )
}

function PerfCard({
  perf,
  teachWeeks,
  onSave,
  onRemove,
}: {
  perf: {
    id: string
    name: string
    intent?: string
    activity: string
    week: number
    ratio: number
    method: string
    standard_codes: string[]
    rubric: { id: string }[]
  } | null
  teachWeeks: number[]
  onSave: (input: { name: string; intent: string; week: number; ratio?: number }) => void
  onRemove: () => void
}) {
  const { school } = usePlanStore()
  const [name, setName] = useState(perf?.name ?? '')
  const [week, setWeek] = useState<number>(perf?.week ?? teachWeeks[Math.floor(teachWeeks.length / 2)])
  const [intent, setIntent] = useState(perf?.intent ?? perf?.activity ?? '')
  const [ratio, setRatio] = useState<number | ''>(perf?.ratio ?? '')
  const dirty =
    !perf ||
    name !== perf.name ||
    week !== perf.week ||
    intent !== (perf.intent ?? perf.activity) ||
    (ratio !== '' && ratio !== perf.ratio)

  return (
    <div className="flex flex-col gap-4 rounded-box border border-line px-6 py-5">
      <div className="grid grid-cols-[1fr_170px_110px] gap-4">
        <Field label="명칭" hint={`${school.rules.perf_name_maxlen}자 이내`}>
          <input className="control" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="실시 시기">
          <select className="control" value={week} onChange={(e) => setWeek(Number(e.target.value))}>
            {teachWeeks.map((no) => (
              <option key={no} value={no}>
                {monthWeekLabel(school, no)} ({no}주)
              </option>
            ))}
          </select>
        </Field>
        <Field label="반영 비율 %" hint="비우면 자동">
          <input
            className="control"
            type="number"
            value={ratio}
            onChange={(e) => setRatio(e.target.value === '' ? '' : Number(e.target.value))}
          />
        </Field>
      </div>

      <label className="flex flex-col gap-2">
        <span className="label">실시 의도</span>
        <textarea
          className="control min-h-[96px]"
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
        />
      </label>

      {perf && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-3">
          <span>{perf.method}</span>
          <span>성취기준 {perf.standard_codes.length}개 자동 배정</span>
          <span>루브릭 요소 {perf.rubric.length}개 (문안은 AI 초안)</span>
        </div>
      )}

      <div className="flex items-center justify-between">
        <a className="text-[13px] text-ink-3 hover:text-red" onClick={onRemove}>
          {perf ? '삭제' : '취소'}
        </a>
        {dirty && (
          <button
            className="btn btn-sm btn-soft"
            disabled={!name.trim() || !intent.trim()}
            onClick={() =>
              onSave({ name: name.trim(), intent: intent.trim(), week, ratio: ratio === '' ? undefined : ratio })
            }
          >
            {perf ? '다시 계산' : '추가'}
          </button>
        )}
      </div>
    </div>
  )
}
