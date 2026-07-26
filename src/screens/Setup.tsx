'use client'

/** 심화 1단계 · 과목 설정 */

import { Field, Screen } from '@/components/ui'
import { SubjectPicker } from '@/components/SubjectPicker'
import { usePlanStore } from '@/store/usePlanStore'

export function Setup() {
  const {
    school,
    patchPlan,
    patchSchool,
    patchSubject,
    go,
    redistribute,
    upsertSubject,
    upsertManualSubject,
  } = usePlanStore()
  const plan = usePlanStore((s) => s.plans.find((p) => p.id === s.currentPlanId))
  const subject = usePlanStore((s) => {
    const p = s.plans.find((x) => x.id === s.currentPlanId)
    return p ? s.subjects.find((x) => x.id === p.subject_id) : undefined
  })
  if (!plan || !subject) return null

  const rules = school.rules
  const setRatio = (exam: number) =>
    patchSchool({ rules: { ...rules, exam_ratio: exam, perf_ratio: 100 - exam } })

  const pickSubject = async (name: string, listed: boolean) => {
    if (!listed) {
      const id = upsertManualSubject(name)
      patchPlan({ subject_id: id })
      return
    }
    const res = await fetch(`/api/subjects/${encodeURIComponent(name)}`)
    if (res.ok) {
      const id = upsertSubject(await res.json())
      patchPlan({ subject_id: id })
    }
  }

  return (
    <Screen title="과목 설정" subtitle={`${school.calendar.year}학년도 ${school.calendar.semester}학기`}>
      <div className="grid grid-cols-2 gap-x-6 gap-y-6">
        <Field label="과목" hint="성취기준 파일의 239개 과목에서 고릅니다">
          <SubjectPicker value={subject.name} onPick={(n, l) => void pickSubject(n, l)} />
        </Field>

        <Field label="지도교사" hint="쉼표로 구분 · 인원수가 Ⅰ 표 분할 수를 정합니다">
          <input
            className="control"
            value={plan.teachers.join(', ')}
            onChange={(e) =>
              patchPlan({
                teachers: e.target.value.split(',').map((t) => t.trim()).filter(Boolean),
              })
            }
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

        <Field label="학점 · 주당 시수">
          <select
            className="control"
            value={plan.credit}
            onChange={(e) => patchPlan({ credit: Number(e.target.value) })}
          >
            {[1, 2, 3, 4, 5].map((c) => (
              <option key={c} value={c}>
                {c}학점 · 주 {c}시간
              </option>
            ))}
          </select>
        </Field>

        <Field label="정기시험 횟수">
          <select
            className="control"
            value={plan.exam_count}
            onChange={(e) => {
              const n = Number(e.target.value) as 0 | 1 | 2
              const weeks = [8, 18]
              patchPlan({
                exam_count: n,
                exams: Array.from({ length: n }, (_, i) => ({
                  no: i + 1,
                  week: weeks[n === 1 ? 1 : i],
                  anchor_unit: plan.exams[i]?.anchor_unit ?? null,
                  parts: plan.exams[i]?.parts ?? [
                    { kind: '선택형' as const, count: 20, points: 70 },
                    { kind: '서술형' as const, count: 5, points: 30 },
                  ],
                })),
              })
            }}
          >
            {[0, 1, 2].map((n) => (
              <option key={n} value={n}>
                {n}회
              </option>
            ))}
          </select>
        </Field>

        <div className="flex flex-col gap-2">
          <span className="label">정기시험 : 수행평가 비율</span>
          <div className="flex items-center gap-2.5">
            <input
              className="control w-20 text-center"
              value={rules.exam_ratio}
              onChange={(e) => setRatio(Number(e.target.value) || 0)}
            />
            <span className="text-[15px] text-ink-3">:</span>
            <input
              className="control w-20 text-center"
              value={rules.perf_ratio}
              onChange={(e) => setRatio(100 - (Number(e.target.value) || 0))}
            />
            <span className="shrink-0 text-sm text-ink-2">
              합계 {rules.exam_ratio + rules.perf_ratio}%
            </span>
          </div>
        </div>

        <Field label="과목 유형" hint="Ⅴ 성취도 기준표와 부기 문구를 이 값으로 고릅니다">
          <select
            className="control"
            value={subject.type}
            onChange={(e) =>
              patchSubject({
                type: e.target.value as typeof subject.type,
                is_common: e.target.value === 'common',
              })
            }
          >
            {school.achievement_tables.map((t) => (
              <option key={t.id} value={t.id}>
                {t.target} · {t.grades.join('~')}
              </option>
            ))}
          </select>
        </Field>

        <div className="flex flex-col gap-2">
          <span className="label">분할점수 방식</span>
          <div className="flex w-fit overflow-hidden rounded-control border border-line-input">
            {(['추정', '고정'] as const).map((t, i) => (
              <button
                key={t}
                onClick={() => patchPlan({ split_score_type: t })}
                className={`cursor-pointer px-[22px] py-[11px] text-[15px] ${i > 0 ? 'border-l border-line-input' : ''} ${
                  plan.split_score_type === t
                    ? 'bg-navy font-semibold text-white'
                    : 'bg-transparent text-ink-2 hover:bg-surface-sub'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className="text-[13px] text-ink-3">
        Ⅰ 교수학습 운영계획과 Ⅱ 평가의 목적은 내려받을 때 AI가 초안을 씁니다(빨간 글씨) — 여기서
        적을 필요 없습니다.
      </p>

      <div>
        <button
          className="btn"
          onClick={() => {
            patchPlan({ step: Math.max(plan.step, 2) })
            redistribute()
            go('units')
          }}
        >
          다음
        </button>
      </div>
    </Screen>
  )
}
