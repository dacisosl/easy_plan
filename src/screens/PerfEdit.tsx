'use client'

import { Field, Screen, Section } from '@/components/ui'
import { usePlanStore } from '@/store/usePlanStore'
import { periodLabel, rubricMax, rubricMin, scoreSumLabels } from '@/lib/derive'
import type { PerfMethodCheck, RubricRow } from '@/types'

const METHOD_CHECKS: PerfMethodCheck[] = [
  '서술·논술',
  '구술·발표',
  '토의·토론',
  '프로젝트',
  '실험·실습',
  '포트폴리오',
  '기타',
]

const uid = () => Math.random().toString(36).slice(2, 8)

/** 화면 05 · 수행평가 편집 */
export function PerfEdit() {
  const { school, editPerf, patchPerf, removePerf } = usePlanStore()
  const plan = usePlanStore((s) => s.plans.find((p) => p.id === s.currentPlanId))
  const subject = usePlanStore((s) => {
    const p = s.plans.find((x) => x.id === s.currentPlanId)
    return p ? s.subjects.find((x) => x.id === p.subject_id) : undefined
  })
  const perf = usePlanStore((s) => {
    const p = s.plans.find((x) => x.id === s.currentPlanId)
    return p?.performances.find((x) => x.id === s.editingPerfId)
  })
  if (!plan || !subject || !perf) return null

  const rules = school.rules
  const rmax = rubricMax(perf)
  const rmin = perf.rubric.length ? rubricMin(perf) : 0
  const basePct = perf.max_score > 0 ? (perf.base_score / perf.max_score) * 100 : 0
  const baseOk =
    basePct >= rules.base_score_min && basePct < rules.base_score_max && perf.base_score > 1
  const nameLen = [...perf.name].length
  const sums = scoreSumLabels(perf)

  const patchRubric = (rows: RubricRow[]) => patchPerf(perf.id, { rubric: rows })

  return (
    <Screen
      eyebrow="화면 05 · 수행평가 편집"
      title={<a onClick={() => editPerf(null)}>← 수행평가 목록</a>}
      right={
        <a className="text-sm text-ink-2" onClick={() => removePerf(perf.id)}>
          이 수행평가 삭제
        </a>
      }
      bodyClass="gap-9 max-w-[1080px]"
    >
      <Field
        label={
          <>
            수행평가명 <span className="text-ink-3">· {rules.perf_name_maxlen}자 이내</span>
          </>
        }
        className="max-w-[560px]"
        hint={
          <span className={nameLen > rules.perf_name_maxlen ? 'text-red' : ''}>
            {nameLen} / {rules.perf_name_maxlen}자 · 이 이름이 문서 9곳에 그대로 들어갑니다
          </span>
        }
      >
        <input
          className="control h-12 text-lg font-semibold"
          value={perf.name}
          onChange={(e) => patchPerf(perf.id, { name: e.target.value })}
        />
      </Field>

      <div className="grid max-w-[840px] grid-cols-4 gap-5">
        <Field label="방법">
          <input
            className="control"
            value={perf.method}
            onChange={(e) => patchPerf(perf.id, { method: e.target.value })}
          />
        </Field>
        <Field label="반영 비율 (%)" hint={`한 영역 ${rules.perf_area_max}% 이하`}>
          <input
            className="control"
            type="number"
            value={perf.ratio}
            onChange={(e) => {
              const ratio = Number(e.target.value) || 0
              patchPerf(perf.id, { ratio, max_score: ratio })
            }}
          />
        </Field>
        <Field label="영역 만점" hint="반영 비율과 같아야 합니다">
          <input
            className="control"
            type="number"
            value={perf.max_score}
            onChange={(e) => patchPerf(perf.id, { max_score: Number(e.target.value) || 0 })}
          />
        </Field>
        <Field label="실시 주차">
          <select
            className="control"
            value={perf.week}
            onChange={(e) => patchPerf(perf.id, { week: Number(e.target.value) })}
          >
            {school.calendar.weeks.map((w) => (
              <option key={w.no} value={w.no}>
                {w.no}주 ({periodLabel(w)}){w.is_exam ? ' · 정기시험' : ''}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field
        label="기본점수"
        className="max-w-[260px]"
        hint={
          <span className={baseOk ? '' : 'text-red'}>
            만점의 {basePct.toFixed(0)}% · {rules.base_score_min}% 이상 ~ {rules.base_score_max}%
            미만, 1점 초과
          </span>
        }
      >
        <input
          className="control"
          type="number"
          step="0.5"
          value={perf.base_score}
          onChange={(e) => patchPerf(perf.id, { base_score: Number(e.target.value) || 0 })}
        />
      </Field>

      <Section
        title="성취기준"
        aside={`최대 ${rules.standards_per_perf_max}개 · ${perf.standard_codes.length} / ${rules.standards_per_perf_max} 선택`}
        className="gap-3"
      >
        <div className="flex flex-wrap gap-2">
          {subject.standards.map((s) => {
            const on = perf.standard_codes.includes(s.code)
            const full = !on && perf.standard_codes.length >= rules.standards_per_perf_max
            return (
              <span
                key={s.code}
                className={`chip ${on ? 'chip-on' : ''} ${full ? 'cursor-not-allowed opacity-40' : ''}`}
                title={s.text || '본문 없음 · xlsx를 불러오세요'}
                onClick={() => {
                  if (full) return
                  patchPerf(perf.id, {
                    standard_codes: on
                      ? perf.standard_codes.filter((c) => c !== s.code)
                      : [...perf.standard_codes, s.code],
                  })
                }}
              >
                {s.code}
              </span>
            )
          })}
        </div>
      </Section>

      <Section title="평가 방법" className="gap-3">
        <div className="flex flex-wrap gap-2">
          {METHOD_CHECKS.map((m) => {
            const on = perf.method_checks.includes(m)
            return (
              <span
                key={m}
                className={`chip px-3.5 ${on ? 'chip-on' : ''}`}
                onClick={() =>
                  patchPerf(perf.id, {
                    method_checks: on
                      ? perf.method_checks.filter((x) => x !== m)
                      : [...perf.method_checks, m],
                  })
                }
              >
                {m}
              </span>
            )
          })}
        </div>
      </Section>

      <Field label="수행 활동 과정">
        <textarea
          className="control min-h-[76px]"
          value={perf.activity}
          onChange={(e) => patchPerf(perf.id, { activity: e.target.value })}
        />
      </Field>

      <Section
        title="루브릭"
        aside={`평가 요소 ${perf.rubric.length}개 · 배점은 요소마다 다르게 줄 수 있습니다`}
        className="gap-4"
      >
        {perf.rubric.map((row, ri) => (
          <div
            key={row.id}
            className="flex flex-col gap-5 rounded-box border border-navy-line px-6 py-[22px]"
          >
            <div className="flex items-center gap-4">
              <input
                className="control flex-1 text-base font-semibold"
                value={row.element}
                placeholder="평가 요소"
                onChange={(e) =>
                  patchRubric(
                    perf.rubric.map((r, i) => (i === ri ? { ...r, element: e.target.value } : r)),
                  )
                }
              />
              <input
                className="control w-[140px]"
                value={row.area}
                placeholder="평가 영역"
                onChange={(e) =>
                  patchRubric(
                    perf.rubric.map((r, i) => (i === ri ? { ...r, area: e.target.value } : r)),
                  )
                }
              />
              <div className="flex gap-2">
                {row.levels.map((lv, li) => (
                  <input
                    key={li}
                    className="control w-16 text-center"
                    type="number"
                    step="0.5"
                    value={lv.score}
                    onChange={(e) =>
                      patchRubric(
                        perf.rubric.map((r, i) =>
                          i !== ri
                            ? r
                            : {
                                ...r,
                                levels: r.levels.map((l, j) =>
                                  j === li ? { ...l, score: Number(e.target.value) || 0 } : l,
                                ),
                              },
                        ),
                      )
                    }
                  />
                ))}
              </div>
              <a
                className="shrink-0 text-sm text-ink-2"
                onClick={() => patchRubric(perf.rubric.filter((_, i) => i !== ri))}
              >
                삭제
              </a>
            </div>

            <div className="flex flex-col gap-2.5">
              {row.levels.map((lv, li) => (
                <div key={li} className="flex items-start gap-3.5">
                  <span className="w-13 shrink-0 pt-3 text-sm font-semibold text-navy-mid">
                    {lv.score}점
                  </span>
                  <textarea
                    className="control flex-1 text-sm"
                    value={lv.text}
                    onChange={(e) =>
                      patchRubric(
                        perf.rubric.map((r, i) =>
                          i !== ri
                            ? r
                            : {
                                ...r,
                                levels: r.levels.map((l, j) =>
                                  j === li ? { ...l, text: e.target.value } : l,
                                ),
                              },
                        ),
                      )
                    }
                  />
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="flex items-center gap-6">
          <a
            className="text-sm font-medium"
            onClick={() =>
              patchRubric([
                ...perf.rubric,
                {
                  id: `r-${uid()}`,
                  area: '',
                  element: '',
                  levels: [
                    { score: 3, text: '' },
                    { score: 2, text: '' },
                    { score: 1, text: '' },
                  ],
                },
              ])
            }
          >
            + 평가 요소 추가
          </a>
          <span className="hint">기준 서술은 학생에게 그대로 나가는 문장입니다</span>
        </div>
      </Section>

      <div className="flex items-center justify-between border-t border-line-soft pt-6">
        <div className="flex flex-col gap-1.5">
          <span className="text-[15px]">
            배점 합{' '}
            <strong className={`font-semibold ${rmax === perf.max_score ? '' : 'text-red'}`}>
              {rmax}점 ~ {rmin}점
            </strong>{' '}
            · 영역 만점 {perf.max_score}점
            {sums.length > 1 && (
              <span className="ml-2 text-[13px] text-ink-3">
                (양식에 {sums.length}줄로 들어갑니다)
              </span>
            )}
          </span>
          <span className="text-sm text-ink-2">
            기본점수 {perf.base_score}점 · 만점의 {basePct.toFixed(0)}% ·{' '}
            {baseOk && rmax === perf.max_score ? '검증 통과' : '검토 화면에서 확인하세요'}
          </span>
        </div>
        <button className="btn" onClick={() => editPerf(null)}>
          완료
        </button>
      </div>
    </Screen>
  )
}
