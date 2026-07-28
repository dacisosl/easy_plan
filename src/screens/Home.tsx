'use client'

/**
 * 홈 = 작성 화면. 이 한 장에서 계획서가 완성된다.
 *
 * 입력은 구획(Fieldset) 다섯 개로 나뉜다 — 기본 / 정기시험 / 시험 범위 / 수행평가 / 서논술형.
 * 모든 입력은 계획서에 곧바로 반영된다. '적용' 같은 버튼은 두지 않는다.
 * 루브릭 세부는 여기서 다루지 않는다 — AI 초안을 한글에서 다듬는 것이 이 앱의 전제다.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChipPicker, ColorKey, Field, Fieldset, Screen } from '@/components/ui'
import { SubjectPicker } from '@/components/SubjectPicker'
import { usePlanStore } from '@/store/usePlanStore'
import {
  essayTotal,
  monthWeekLabel,
  orderedStandardCodes,
  perfEssayRatio,
  perfEssayTotal,
  weeksOf,
} from '@/lib/derive'
import { methodsFromIntent } from '@/lib/autofill'
import { validate } from '@/lib/validate'
import type { FocusTarget, Subject } from '@/types'

/** 입력 즉시 반영하되 타이핑 중에는 재계산을 미룬다 */
function useDebounced<T>(value: T, apply: (v: T) => void, ms = 300) {
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    const t = setTimeout(() => apply(value), ms)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
}

export function Home() {
  const {
    plans,
    subjects,
    currentPlanId,
    focusTarget,
    clearFocus,
    openPlan,
    newPlan,
    deletePlan,
    patchPlan,
    upsertSubject,
    upsertManualSubject,
    redistribute,
    go,
  } = usePlanStore()

  const plan = plans.find((p) => p.id === currentPlanId) ?? null
  const subject = subjects.find((s) => s.id === plan?.subject_id) ?? null

  const [loading, setLoading] = useState(false)
  const [pickError, setPickError] = useState<string | null>(null)

  /* 오류의 '고치기' — 해당 구획으로 스크롤하고 첫 입력에 포커스 */
  useEffect(() => {
    if (!focusTarget) return
    const el = document.getElementById(`fs-${focusTarget}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el?.querySelector<HTMLElement>('input, select, textarea')?.focus()
    clearFocus()
  }, [focusTarget, clearFocus])

  const pickSubject = async (name: string, listed: boolean) => {
    setPickError(null)
    if (!listed) {
      const id = upsertManualSubject(name)
      if (plan) patchPlan({ subject_id: id })
      else newPlan(id)
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/subjects/${encodeURIComponent(name)}`)
      if (!res.ok) throw new Error(`과목을 불러오지 못했습니다 (${res.status})`)
      const id = upsertSubject(await res.json())
      if (plan) patchPlan({ subject_id: id })
      else newPlan(id)
      setTimeout(redistribute, 0)
    } catch (e) {
      setPickError(e instanceof Error ? e.message : '과목을 불러오지 못했습니다')
    } finally {
      setLoading(false)
    }
  }

  /* 과목을 고르기 전에는 과목 선택만 보여준다 */
  if (!plan || !subject) {
    return (
      <Screen title="평가계획 만들기" subtitle="과목부터 고르면 시작합니다">
        <Fieldset id="fs-basic" title="과목" hint="이름을 입력하면 목록이 뜹니다">
          <SubjectPicker value="" onPick={pickSubject} autoFocus />
          {loading && <span className="hint">성취기준을 불러오는 중…</span>}
          {pickError && <span className="text-[13px] text-red">{pickError}</span>}
        </Fieldset>
        <RecentPlans plans={plans} subjects={subjects} onOpen={openPlan} onDelete={deletePlan} />
      </Screen>
    )
  }

  return (
    <PlanForm
      key={plan.id}
      loading={loading}
      pickError={pickError}
      onPickSubject={pickSubject}
      onDone={() => go('generating')}
    />
  )
}

/* ══════════════════════════════════════════════ */

function PlanForm({
  loading,
  pickError,
  onPickSubject,
  onDone,
}: {
  loading: boolean
  pickError: string | null
  onPickSubject: (name: string, listed: boolean) => void
  onDone: () => void
}) {
  const { school, patchPlan, upsertPerf, removePerf, redistribute } = usePlanStore()
  const plan = usePlanStore((s) => s.plans.find((p) => p.id === s.currentPlanId))!
  const subject = usePlanStore((s) => {
    const p = s.plans.find((x) => x.id === s.currentPlanId)!
    return s.subjects.find((x) => x.id === p.subject_id)!
  })

  const weeks = weeksOf(school, plan.semester)
  const teachWeeks = weeks.filter((w) => !w.is_exam)
  const codes = useMemo(() => orderedStandardCodes(subject), [subject])
  const stdText = (c: string) => subject.standards.find((s) => s.code === c)?.text ?? ''

  const result = validate(plan, subject, school)
  const errorsFor = (t: FocusTarget) => result.errors.filter((e) => e.target === t)
  const firstError = (t: FocusTarget) => errorsFor(t)[0]?.title

  /* 지도교사는 타이핑 중 쪼개지 않게 debounce */
  const [teachers, setTeachers] = useState(plan.teachers.join(', '))
  useDebounced(teachers, (v) =>
    patchPlan({ teachers: v.split(',').map((t) => t.trim()).filter(Boolean) }),
  )

  const setExamCount = (n: 0 | 1 | 2) => {
    const examWeeks = weeks.filter((w) => w.is_exam).map((w) => w.no)
    const exams = Array.from({ length: n }, (_, i) => ({
      no: i + 1,
      week: plan.exams[i]?.week ?? examWeeks[i] ?? examWeeks[examWeeks.length - 1] ?? 1,
      anchor_code: plan.exams[i]?.anchor_code ?? null,
      parts: plan.exams[i]?.parts ?? [
        { kind: '선택형' as const, count: 20, points: 70 },
        { kind: '서술형' as const, count: 5, points: 30 },
      ],
    }))
    patchPlan({
      exam_count: n,
      exams,
      ...(n === 0 ? { exam_ratio: 0, perf_ratio: 100 } : {}),
    })
    setTimeout(redistribute, 0)
  }

  const setRatio = (exam: number) => {
    const e = Math.max(0, Math.min(100, exam))
    patchPlan({ exam_ratio: e, perf_ratio: 100 - e })
  }

  const setAnchor = (no: number, code: string) => {
    patchPlan({
      exams: plan.exams.map((e) => (e.no === no ? { ...e, anchor_code: code || null } : e)),
    })
    setTimeout(redistribute, 0)
  }

  /** 앵커 자동 — 시험 주까지의 진도에서 마지막 성취기준 */
  const autoAnchors = () => {
    const sorted = [...plan.exams].sort((a, b) => a.week - b.week)
    let start = 0
    const next = sorted.map((e) => {
      const share = Math.floor(((codes.length - start) * 1) / Math.max(1, sorted.length))
      const end = Math.min(codes.length - 1, start + Math.max(0, share - 1))
      const code = codes[end] ?? null
      start = end + 1
      return { ...e, anchor_code: code }
    })
    patchPlan({ exams: next })
    setTimeout(redistribute, 0)
  }

  /* ── 수행평가 ─────────────────────────────── */

  const addPerf = () => {
    const taken = new Set(plan.performances.map((p) => p.week))
    const week = teachWeeks.find((w) => !taken.has(w.no) && w.no > 2)?.no ?? teachWeeks[0]?.no ?? 3
    upsertPerf({ name: '', intent: '', week })
  }

  /** 건너뛰기 — 영역명과 그 주 성취기준으로 자동 채움 */
  const autoPerfs = () => {
    const areas = subject.areas.length > 0 ? subject.areas : [{ no: '01', name: subject.name }]
    const n = Math.max(2, plan.performances.length)
    const lastExam = [...plan.exams].sort((a, b) => b.week - a.week)[0]
    const limit = lastExam ? lastExam.week : weeks.length
    const slots = teachWeeks.filter((w) => w.no > 2 && w.no <= limit)

    for (const p of [...plan.performances]) removePerf(p.id)
    for (let i = 0; i < n; i++) {
      const area = areas[Math.min(i, areas.length - 1)]
      const week = slots[Math.floor(((i + 1) * slots.length) / (n + 1))]?.no ?? slots[0]?.no ?? 3
      const sample = codes[Math.min(codes.length - 1, Math.floor(((i + 1) * codes.length) / (n + 1)))]
      const intent = sample
        ? `${stdText(sample) || area.name}과 관련해 자료를 찾아 분석하고 자기 생각을 근거와 함께 표현하게 하고 싶다`
        : `${area.name} 관련 활동을 수행하게 하고 싶다`
      upsertPerf({
        name: `${area.name} 탐구와 표현`.slice(0, school.rules.perf_name_maxlen),
        intent,
        week,
      })
    }
  }

  /* ── 서술·논술형 ──────────────────────────── */

  const essayPct = (examNo: number) => {
    const e = plan.exams.find((x) => x.no === examNo)
    if (!e) return 0
    const total = e.parts.reduce((s, p) => s + p.points, 0)
    const es = e.parts.filter((p) => p.kind === '서술형').reduce((s, p) => s + p.points, 0)
    return total > 0 ? Math.round((es / total) * 100) : 0
  }

  const setEssayPct = (examNo: number, pct: number) => {
    const v = Math.max(0, Math.min(100, pct))
    patchPlan({
      exams: plan.exams.map((e) =>
        e.no === examNo
          ? {
              ...e,
              parts: [
                { kind: '선택형' as const, count: 20, points: 100 - v },
                { kind: '서술형' as const, count: 5, points: v },
              ],
            }
          : e,
      ),
    })
  }

  /** 수행평가 하나의 서술·논술 비율을 직접 정한다 */
  const setPerfEssay = (perfId: string, pct: number) => {
    const p = plan.performances.find((x) => x.id === perfId)
    if (!p) return
    upsertPerf({
      id: p.id,
      name: p.name,
      intent: p.intent ?? p.activity ?? '',
      week: p.week,
      ratio: p.ratio,
      essayRatio: Math.max(0, Math.min(p.ratio, pct)),
    })
  }

  /** 건너뛰기 — 서술·논술 하한을 넘기는 가장 단순한 배분 */
  const autoEssay = () => {
    // 수행평가는 '서술·논술'이 잡힌 영역을 전부 인정하는 기본값으로 되돌린다
    for (const p of plan.performances) {
      upsertPerf({
        id: p.id,
        name: p.name,
        intent: p.intent ?? p.activity ?? '',
        week: p.week,
        ratio: p.ratio,
        essayRatio: null,
      })
    }
    const perfEssay = plan.performances
      .filter((p) => p.method_checks.includes('서술·논술'))
      .reduce((s, p) => s + p.ratio, 0)
    const need = Math.max(0, school.rules.essay_min - perfEssay)
    // 지필에서 채워야 하는 몫 → 서술형 비중으로 환산
    const pct = plan.exam_ratio > 0 ? Math.min(50, Math.ceil((need / plan.exam_ratio) * 100)) : 0
    for (const e of plan.exams) setEssayPct(e.no, Math.max(30, pct))
  }

  const essay = essayTotal(plan, plan.exam_ratio)
  const perfSum = plan.performances.reduce((s, p) => s + p.ratio, 0)
  const ready = plan.teachers.length > 0 && plan.performances.some((p) => p.name.trim())

  /*
   * 구획은 앞 구획이 채워지면 하나씩 떠오른다 — 한 화면에 다 쏟지 않는다.
   *   기본 → (과목 확정) 정기시험·비율 → (시험 설정) 시험 범위·수행평가 → (수행평가 입력) 서논술형
   */
  const showExam = subject.name.trim().length > 0
  const showAnchor = showExam && plan.exam_count > 0
  // 지도교사까지 넣으면 기본이 끝난 것으로 본다
  const showPerf = showExam && plan.teachers.length > 0
  const showEssay = showPerf && plan.performances.some((p) => p.name.trim())

  return (
    <Screen
      title={subject.name}
      subtitle={`${school.calendars.find((c) => c.semester === plan.semester)?.year ?? ''}학년도 ${plan.semester}학기 · 성취기준 ${subject.standards.length}개`}
    >
      {/* ① 기본 */}
      <Fieldset id="fs-basic" title="기본" hint="과목 · 학년 · 시수 · 교사 · 학기" error={firstError('basic')}>
        <div className="grid grid-cols-[1.6fr_0.8fr_1fr_1.4fr_0.8fr] gap-3">
          <Field label="과목">
            <SubjectPicker value={subject.name} onPick={onPickSubject} />
            {loading && <span className="hint">불러오는 중…</span>}
            {pickError && <span className="text-[13px] text-red">{pickError}</span>}
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
          <Field label="주당 시수" hint="예정시간 계산 기준">
            <select
              className="control"
              value={plan.credit}
              onChange={(e) => patchPlan({ credit: Number(e.target.value) })}
            >
              {[1, 2, 3, 4, 5].map((c) => (
                <option key={c} value={c}>
                  {c}시간 ({c}학점)
                </option>
              ))}
            </select>
          </Field>
          <Field label="지도교사" hint="쉼표로 구분">
            <input
              className="control"
              value={teachers}
              placeholder="김서연, 박준호"
              onChange={(e) => setTeachers(e.target.value)}
            />
          </Field>
          <Field label="학기">
            <select
              className="control"
              value={plan.semester}
              onChange={(e) => {
                patchPlan({ semester: Number(e.target.value) as 1 | 2 })
                setTimeout(redistribute, 0)
              }}
            >
              {school.calendars.map((c) => (
                <option key={c.semester} value={c.semester}>
                  {c.semester}학기
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Fieldset>

      {/* ② 정기시험 · 비율 */}
      {showExam && (
        <Fieldset
          key="exam"
          step={1}
          id="fs-exam"
          title="정기시험과 반영 비율"
          hint={`${weeks.filter((w) => w.is_exam).map((w) => `${w.no}주`).join(' · ') || '시험 주 없음'}`}
          action={
            <button className="btn btn-sm btn-ghost" onClick={() => setExamCount(0)}>
              수행 100%
            </button>
          }
          error={firstError('exam')}
        >
        <div className="grid grid-cols-[1fr_1fr_1fr_1.2fr] items-end gap-3">
          <Field label="정기시험 횟수">
            <select
              className="control"
              value={plan.exam_count}
              onChange={(e) => setExamCount(Number(e.target.value) as 0 | 1 | 2)}
            >
              {[2, 1, 0].map((n) => (
                <option key={n} value={n}>
                  {n}회
                </option>
              ))}
            </select>
          </Field>
          <Field label="정기시험 (%)">
            <input
              className="control text-center"
              type="number"
              value={plan.exam_ratio}
              disabled={plan.exam_count === 0}
              onChange={(e) => setRatio(Number(e.target.value) || 0)}
            />
          </Field>
          <Field label="수행평가 (%)">
            <input
              className="control text-center"
              type="number"
              value={plan.perf_ratio}
              onChange={(e) => setRatio(100 - (Number(e.target.value) || 0))}
            />
          </Field>
          <div className="pb-2 text-[13px] text-ink-2">
            수행평가 배정 {perfSum}% / {plan.perf_ratio}%
            {perfSum !== plan.perf_ratio && (
              <span className="text-amber"> · {plan.perf_ratio - perfSum}% 남음</span>
            )}
          </div>
          </div>
        </Fieldset>
      )}

      {/* ③ 시험 범위 (앵커) */}
      {showAnchor && (
        <Fieldset
          key="anchor"
          step={2}
          id="fs-anchor"
          title="시험 범위"
          hint="회차별로 어디까지 나가는지 — 진도 배분의 기준입니다"
          action={
            <button className="btn btn-sm btn-ghost" onClick={autoAnchors}>
              건너뛰기 (자동)
            </button>
          }
          error={firstError('anchor')}
        >
          <div className="grid grid-cols-2 gap-3">
            {plan.exams.map((e) => (
              <Field key={e.no} label={`${e.no}회 (${e.week}주) 마지막 성취기준`}>
                <select
                  className="control"
                  value={e.anchor_code ?? ''}
                  onChange={(ev) => setAnchor(e.no, ev.target.value)}
                >
                  <option value="">— 고르세요 —</option>
                  {codes.map((c) => (
                    <option key={c} value={c}>
                      {c} {stdText(c).slice(0, 30)}
                    </option>
                  ))}
                </select>
              </Field>
            ))}
          </div>
          <span className="hint">
            성취기준 {codes.length}개를 수업 {teachWeeks.length}주에 나눕니다 — 한 주에 1~3개,
            길면 2주에 걸칩니다
          </span>
        </Fieldset>
      )}

      {/* ④ 수행평가 */}
      {showPerf && (
        <Fieldset
          key="perf"
          step={3}
          id="fs-perf"
          title="수행평가"
          hint="명칭 · 실시 시기 · 내용만 — 루브릭은 한글에서 다듬습니다"
          action={
            <button className="btn btn-sm btn-ghost" onClick={autoPerfs}>
              건너뛰기 (자동)
            </button>
          }
          error={firstError('perf')}
        >
          {plan.performances.length === 0 && (
            <p className="text-sm text-ink-2">
              아직 없습니다. 아래에서 추가하거나 자동으로 채우세요.
            </p>
          )}
          {plan.performances.map((p) => (
            <PerfCard key={p.id} perfId={p.id} weeks={teachWeeks} subject={subject} />
          ))}
          <div className="flex items-center gap-4">
            <button className="btn btn-sm btn-ghost" onClick={addPerf}>
              + 수행평가 추가
            </button>
            <span className="hint">비율·배점·루브릭 뼈대는 코드가 계산합니다</span>
          </div>
        </Fieldset>
      )}

      {/* ⑤ 서술·논술형 */}
      {showEssay && (
        <Fieldset
          key="essay"
          step={4}
          id="fs-essay"
          title="서술·논술형 비율"
          hint={`합계 ${school.rules.essay_min}% 이상이어야 합니다`}
          action={
            <button className="btn btn-sm btn-ghost" onClick={autoEssay}>
              건너뛰기 (자동)
            </button>
          }
          error={firstError('essay')}
        >
          <div className="flex flex-wrap items-start gap-4">
            {plan.exams.map((e) => (
              <Field
                key={e.no}
                label={`${e.no}회 정기시험 서술형`}
                hint="시험 만점 대비 %"
                className="w-44"
              >
                <input
                  className="control text-center"
                  type="number"
                  value={essayPct(e.no)}
                  onChange={(ev) => setEssayPct(e.no, Number(ev.target.value) || 0)}
                />
              </Field>
            ))}
            {plan.performances.map((p) => (
              <Field
                key={p.id}
                label={`${p.name || '(이름 없음)'} 서논술`}
                hint={`이 영역 ${p.ratio}% 중`}
                className="w-44"
              >
                <input
                  className="control text-center"
                  type="number"
                  value={perfEssayRatio(p)}
                  onChange={(ev) => setPerfEssay(p.id, Number(ev.target.value) || 0)}
                />
              </Field>
            ))}
          </div>

          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 border-t border-line-soft pt-4 text-[13px]">
            <span className="text-ink-2">
              지필 {(essay - perfEssayTotal(plan)).toFixed(0)}% + 수행 {perfEssayTotal(plan)}%
            </span>
            <span
              className={
                essay < school.rules.essay_min
                  ? 'font-semibold text-red'
                  : 'font-semibold text-navy'
              }
            >
              합계 {essay.toFixed(0)}% / {school.rules.essay_min}%
            </span>
          </div>
        </Fieldset>
      )}

      <div className="flex flex-col gap-3 border-t border-line-soft pt-6">
        <div className="flex items-center gap-4">
          <button className="btn btn-lg" disabled={!ready} onClick={onDone}>
            계획서 만들기
          </button>
          {!ready && (
            <span className="hint">
              {plan.teachers.length === 0
                ? '지도교사를 넣으면 수행평가 칸이 열립니다'
                : '수행평가 이름을 하나는 넣어 주세요'}
            </span>
          )}
          {result.errors.length > 0 && ready && (
            <span className="text-[13px] text-amber">
              고칠 곳 {result.errors.length}군데 — 만들고 나서 내려받기 화면에서 알려 드립니다
            </span>
          )}
        </div>
        <ColorKey />
      </div>
    </Screen>
  )
}

/* ── 수행평가 카드 — 입력 즉시 반영 ────────────── */

function PerfCard({
  perfId,
  weeks,
  subject,
}: {
  perfId: string
  weeks: { no: number }[]
  subject: Subject
}) {
  const { school, upsertPerf, removePerf } = usePlanStore()
  const plan = usePlanStore((s) => s.plans.find((p) => p.id === s.currentPlanId))!
  const perf = plan.performances.find((p) => p.id === perfId)!

  const [name, setName] = useState(perf.name)
  const [intent, setIntent] = useState(perf.intent ?? perf.activity ?? '')
  const [picking, setPicking] = useState(false)

  useDebounced(name, (v) =>
    upsertPerf({ id: perf.id, name: v, intent, week: perf.week, ratio: perf.ratio }),
  )
  useDebounced(intent, (v) =>
    upsertPerf({ id: perf.id, name, intent: v, week: perf.week, ratio: perf.ratio }),
  )

  const nameLen = [...name].length
  const over = nameLen > school.rules.perf_name_maxlen
  const stdText = (c: string) => subject.standards.find((s) => s.code === c)?.text ?? ''

  return (
    <div className="flex flex-col gap-3 rounded-control border border-line-input px-4 py-3.5">
      {/* 라벨·힌트 높이가 달라지지 않도록 위를 맞추고, 칸마다 힌트를 둔다 */}
      <div className="grid grid-cols-[1.8fr_1fr_0.7fr_auto] items-start gap-3">
        <Field
          label="명칭"
          hint={
            <span className={over ? 'text-red' : ''}>
              {nameLen} / {school.rules.perf_name_maxlen}자
            </span>
          }
        >
          <input
            className="control"
            value={name}
            placeholder="사회 불평등 실태 조사와 대안 제시"
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="실시 시기" hint={`안내는 ${school.rules.notice_lead_weeks}주 전`}>
          <select
            className="control"
            value={perf.week}
            onChange={(e) =>
              upsertPerf({
                id: perf.id,
                name,
                intent,
                week: Number(e.target.value),
                ratio: perf.ratio,
              })
            }
          >
            {weeks.map((w) => (
              <option key={w.no} value={w.no}>
                {monthWeekLabel(school, plan.semester, w.no)} ({w.no}주)
              </option>
            ))}
          </select>
        </Field>
        <Field label="비율" hint={`${perf.max_score}점`}>
          <input
            className="control text-center"
            type="number"
            value={perf.ratio}
            onChange={(e) =>
              upsertPerf({
                id: perf.id,
                name,
                intent,
                week: perf.week,
                ratio: Number(e.target.value) || 0,
              })
            }
          />
        </Field>
        <div className="flex flex-col gap-2">
          <span className="label opacity-0" aria-hidden>
            .
          </span>
          <button className="btn btn-sm btn-ghost" onClick={() => removePerf(perf.id)}>
            삭제
          </button>
        </div>
      </div>

      <Field
        label="내용"
        hint={`평가 방법·루브릭이 여기서 나옵니다 — 지금 방법: ${methodsFromIntent(intent).method}`}
      >
        <textarea
          className="control min-h-[76px]"
          value={intent}
          placeholder="학생들이 자료를 찾아 불평등 실태를 조사하고 정책 대안을 발표하게 하고 싶다"
          onChange={(e) => setIntent(e.target.value)}
        />
      </Field>

      {/* 성취기준 — 안 고르면 진도에 맞춰 자동으로 채운다 */}
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn btn-sm btn-ghost" onClick={() => setPicking(true)}>
          성취기준 고르기
        </button>
        <span className="text-[13px] text-ink-3">
          {perf.standards_manual ? '직접 고름' : '자동'} · {perf.standard_codes.length}개
        </span>
        {perf.standard_codes.map((c) => (
          <span key={c} className="chip chip-tag" title={stdText(c)}>
            {c}
          </span>
        ))}
      </div>

      {picking && (
        <ChipPicker
          title={`${name || '수행평가'} · 성취기준 고르기`}
          hint={`나이스 입력 한도에 맞춰 ${school.rules.standards_per_perf_max}개까지 고를 수 있습니다.`}
          max={school.rules.standards_per_perf_max}
          options={subject.standards.map((s) => ({
            value: s.code,
            label: s.code,
            sub: s.text.slice(0, 34),
          }))}
          selected={perf.standards_manual ? perf.standard_codes : []}
          onClose={() => setPicking(false)}
          onSave={(codes) => {
            upsertPerf({
              id: perf.id,
              name,
              intent,
              week: perf.week,
              ratio: perf.ratio,
              standardCodes: codes.length > 0 ? codes : null,
            })
            setPicking(false)
          }}
        />
      )}
    </div>
  )
}

/* ── 최근 계획서 ──────────────────────────────── */

function RecentPlans({
  plans,
  subjects,
  onOpen,
  onDelete,
}: {
  plans: { id: string; subject_id: string; grade: number; semester: 1 | 2; updated_at: string }[]
  subjects: { id: string; name: string }[]
  onOpen: (id: string) => void
  onDelete: (id: string) => void
}) {
  if (plans.length === 0) return null
  const ago = (iso: string) => {
    const d = new Date(iso)
    const diff = Math.floor((Date.now() - d.getTime()) / 86400000)
    return diff <= 0 ? '오늘' : diff === 1 ? '어제' : `${d.getMonth() + 1}월 ${d.getDate()}일`
  }
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-[15px] font-semibold">이어서 쓰기</h2>
      <div className="list">
        {plans.map((p) => (
          <div
            key={p.id}
            className="flex items-center justify-between border-b border-line-soft px-6 py-3.5 last:border-b-0"
          >
            <button
              className="flex-1 cursor-pointer border-0 bg-transparent text-left"
              onClick={() => onOpen(p.id)}
            >
              <span className="text-[15px] font-medium">
                {subjects.find((s) => s.id === p.subject_id)?.name ?? '과목 미정'}
              </span>
              <span className="ml-2 text-[13px] text-ink-3">
                {p.grade}학년 · {p.semester}학기 · {ago(p.updated_at)}
              </span>
            </button>
            <a className="text-[13px] text-ink-3" onClick={() => onDelete(p.id)}>
              삭제
            </a>
          </div>
        ))}
      </div>
    </div>
  )
}
