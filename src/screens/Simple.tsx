'use client'

import { useState } from 'react'
import { Field, Screen, Section } from '@/components/ui'
import { usePlanStore } from '@/store/usePlanStore'
import type { SimpleInput } from '@/lib/autofill'

/** 화면 10 · 간단 입력 — 6가지만 받는다 */
export function Simple() {
  const { school, go, patchPlan, patchSubject } = usePlanStore()
  const plan = usePlanStore((s) => s.plans.find((p) => p.id === s.currentPlanId))
  const subject = usePlanStore((s) => {
    const p = s.plans.find((x) => x.id === s.currentPlanId)
    return p ? s.subjects.find((x) => x.id === p.subject_id) : undefined
  })
  const [inputs, setInputs] = useState<SimpleInput[]>([
    { date: '', name: '', intent: '' },
    { date: '', name: '', intent: '' },
  ])
  if (!plan || !subject) return null

  // 간단 버전은 과목 레이어가 채워져 있을 때만 쓸 수 있다
  if (subject.standards.length === 0 || subject.units.length === 0) {
    return (
      <Screen eyebrow="화면 10 · 간단 입력" title="간단 작성" bodyClass="gap-6 max-w-[720px]">
        <div className="notice-warn flex flex-col gap-2">
          <span className="text-[17px] font-semibold text-amber">
            이 과목은 아직 준비되지 않았습니다 — 심화로 시작하세요
          </span>
          <span className="text-sm text-ink-2">
            간단 작성은 과목 레이어(영역 · 성취기준 · 단원 매핑)가 채워져 있어야 돌아갑니다.
          </span>
        </div>
        <div>
          <button className="btn" onClick={() => go('setup')}>
            심화로 시작
          </button>
        </div>
      </Screen>
    )
  }

  const orderedUnits = [...subject.units].sort((a, b) => a.order - b.order)
  const setAnchor = (no: number, unitId: string) =>
    patchPlan({
      exams: plan.exams.map((e) => (e.no === no ? { ...e, anchor_unit: unitId || null } : e)),
    })

  const patchInput = (i: number, patch: Partial<SimpleInput>) =>
    setInputs((prev) => prev.map((x, j) => (j === i ? { ...x, ...patch } : x)))

  const ready = inputs.some((i) => i.name.trim() && i.intent.trim())

  return (
    <Screen
      eyebrow="화면 10 · 간단 입력"
      title="간단 작성"
      right={<span className="text-[13px] text-ink-2">6가지만 입력하면 됩니다</span>}
      bodyClass="gap-9 max-w-[900px]"
    >
      <div className="grid grid-cols-[1fr_160px_200px] gap-5">
        <Field label="과목명">
          <input
            className="control"
            value={subject.name}
            onChange={(e) => patchSubject({ name: e.target.value })}
          />
        </Field>
        <Field label="학년">
          <select
            className="control"
            value={plan.grade}
            onChange={(e) => patchPlan({ grade: Number(e.target.value) })}
          >
            {[1, 2, 3].map((g) => (
              <option key={g} value={g}>
                {g}학년
              </option>
            ))}
          </select>
        </Field>
        <Field label="지도교사">
          <input
            className="control"
            value={plan.teachers.join(', ')}
            onChange={(e) =>
              patchPlan({
                teachers: e.target.value
                  .split(',')
                  .map((t) => t.trim())
                  .filter(Boolean),
              })
            }
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-5">
        {plan.exams.map((e) => (
          <Field key={e.no} label={`${e.no}회 정기시험 마지막 단원`}>
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

      <Section title="수행평가" className="gap-4">
        {inputs.map((input, i) => (
          <div
            key={i}
            className="flex flex-col gap-[18px] rounded-box border border-line px-6 py-[22px]"
          >
            <div className="grid grid-cols-[200px_1fr] gap-5">
              <Field label="실시 날짜" hint="예: 5월 20일">
                <input
                  className="control"
                  value={input.date}
                  placeholder="5월 20일"
                  onChange={(e) => patchInput(i, { date: e.target.value })}
                />
              </Field>
              <Field label="명칭" hint={`${school.rules.perf_name_maxlen}자 이내`}>
                <input
                  className="control"
                  value={input.name}
                  onChange={(e) => patchInput(i, { name: e.target.value })}
                />
              </Field>
            </div>
            <label className="flex flex-col gap-2">
              <span className="text-[15px] font-semibold">
                실시 의도{' '}
                <span className="text-[13px] font-normal text-ink-2">
                  — 평가 방법·성취기준·루브릭이 여기서 나옵니다. 길게 쓸수록 정확합니다
                </span>
              </span>
              <textarea
                className="control min-h-[132px] border-navy-line-hover p-3.5 text-base"
                placeholder="학생들이 자료를 찾아 불평등 실태를 조사하고 정책 대안을 발표하게 하고 싶다"
                value={input.intent}
                onChange={(e) => patchInput(i, { intent: e.target.value })}
              />
            </label>
          </div>
        ))}

        <a
          className="text-sm font-medium"
          onClick={() => setInputs((p) => [...p, { date: '', name: '', intent: '' }])}
        >
          + 수행평가 추가
        </a>
      </Section>

      <div>
        <button
          className="btn btn-lg"
          disabled={!ready}
          onClick={() => {
            sessionStorage.setItem(
              'easy-plan:simple-inputs',
              JSON.stringify(inputs.filter((i) => i.name.trim() && i.intent.trim())),
            )
            go('generating')
          }}
        >
          계획서 만들기
        </button>
      </div>
    </Screen>
  )
}
