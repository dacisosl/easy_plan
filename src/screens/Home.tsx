'use client'

/**
 * 홈 = 작성 화면. 이 한 장에서 계획서가 완성된다.
 *
 * 입력은 구획(Fieldset) 다섯 개로 나뉜다 — 기본 / 정기시험 / 시험 범위 / 수행평가 / 서논술형.
 * 모든 입력은 계획서에 곧바로 반영된다. '적용' 같은 버튼은 두지 않는다.
 * 루브릭 세부는 여기서 다루지 않는다 — AI 초안을 한글에서 다듬는 것이 이 앱의 전제다.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChipPicker, Field, Fieldset, Screen } from '@/components/ui'
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
import { methodsFromIntent, splitPerfRatios } from '@/lib/autofill'
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
      pickError={pickError}
      onPickSubject={pickSubject}
      onDone={() => go('generating')}
    />
  )
}

/* ══════════════════════════════════════════════ */

function PlanForm({
  pickError,
  onPickSubject,
  onDone,
}: {
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

  /**
   * 정기시험 : 수행평가 비율.
   *
   * 시험이 있는데 정기시험 0%면 서술형을 아무리 올려도 반영되지 않는다.
   * 그런 상태를 만들 수 없게 시험이 있으면 최소 1%를 남긴다.
   * 수행 100%를 원하면 '수행 100%' 버튼으로 시험 자체를 없애야 한다.
   */
  const setRatio = (exam: number) => {
    const floor = plan.exam_count > 0 ? 1 : 0
    const e = Math.max(floor, Math.min(100, Math.round(exam) || 0))
    patchPlan({ exam_ratio: e, perf_ratio: 100 - e })
    setTimeout(rebalancePerfRatios, 0)
  }

  /** 수행평가 비율 합이 배정액과 맞고, 한 영역이 상한을 넘지 않게 다시 나눈다 */
  const rebalancePerfRatios = () => {
    const current = usePlanStore.getState().plans.find((p) => p.id === plan.id)
    if (!current || current.performances.length === 0) return
    const { ratios } = splitPerfRatios(
      current.perf_ratio,
      current.performances.length,
      school.rules.perf_area_max,
    )
    current.performances.forEach((p, i) => {
      if (p.ratio === ratios[i]) return
      upsertPerf({
        id: p.id,
        name: p.name,
        intent: p.intent ?? p.activity ?? '',
        week: p.week,
        ratio: ratios[i],
      })
    })
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
    // 한 영역 상한(35%) 때문에 개수가 모자라면 늘린다
    const { ratios, needed } = splitPerfRatios(
      plan.perf_ratio,
      Math.max(2, plan.performances.length),
      school.rules.perf_area_max,
    )
    const lastExam = [...plan.exams].sort((a, b) => b.week - a.week)[0]
    const limit = lastExam ? lastExam.week : weeks.length
    const slots = teachWeeks.filter((w) => w.no > 2 && w.no <= limit)

    for (const p of [...plan.performances]) removePerf(p.id)
    for (let i = 0; i < needed; i++) {
      const area = areas[Math.min(i, areas.length - 1)]
      const week =
        slots[Math.floor(((i + 1) * slots.length) / (needed + 1))]?.no ?? slots[0]?.no ?? 3
      const sample =
        codes[Math.min(codes.length - 1, Math.floor(((i + 1) * codes.length) / (needed + 1)))]
      const intent = sample
        ? `${stdText(sample) || area.name}과 관련해 자료를 찾아 분석하고 자기 생각을 근거와 함께 표현하게 하고 싶다`
        : `${area.name} 관련 활동을 수행하게 하고 싶다`
      upsertPerf({
        name: `${area.name} 탐구와 표현`.slice(0, school.rules.perf_name_maxlen),
        intent,
        week,
        ratio: ratios[i],
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

  return (
    <Screen
      title={subject.name}
      subtitle={`${school.calendars.find((c) => c.semester === plan.semester)?.year ?? ''}학년도 ${plan.semester}학기 · 성취기준 ${subject.standards.length}개`}
    >
      {/* ① 기본 */}
      <Fieldset id="fs-basic" title="기본" error={firstError('basic')}>
        <div className="field-box grid grid-cols-[1.6fr_0.8fr_1fr_1.4fr_0.8fr] gap-3">
          <Field label="과목">
            <SubjectPicker value={subject.name} onPick={onPickSubject} />
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
          <Field label="주당 시수">
            <select
              className="control"
              value={plan.credit}
              onChange={(e) => patchPlan({ credit: Number(e.target.value) })}
            >
              {[1, 2, 3, 4, 5].map((c) => (
                <option key={c} value={c}>
                  {c}시간
                </option>
              ))}
            </select>
          </Field>
          <Field label="지도교사">
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
      <Fieldset
        id="fs-exam"
        title="정기시험과 반영 비율"
        action={
          <button className="btn btn-sm btn-ghost" onClick={() => setExamCount(0)}>
            수행 100%
          </button>
        }
        error={firstError('exam')}
      >
        <div className="field-box grid grid-cols-[1fr_1fr_1fr_1.2fr] gap-3">
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
          <Field label="배정">
            <div className="flex h-11 items-center text-[15px]">
              {perfSum}% / {plan.perf_ratio}%
              {perfSum !== plan.perf_ratio && (
                <span className="ml-2 text-[13px] text-amber">
                  {plan.perf_ratio - perfSum > 0 ? '남음' : '초과'}
                </span>
              )}
            </div>
          </Field>
        </div>
      </Fieldset>

      {/* ③ 시험 범위 (앵커) */}
      {plan.exam_count > 0 && (
        <Fieldset
          id="fs-anchor"
          title="시험 범위"
          action={
            <button className="btn btn-sm btn-ghost" onClick={autoAnchors}>
              건너뛰기 (자동)
            </button>
          }
          error={firstError('anchor')}
        >
          <div className="field-box grid grid-cols-2 gap-3">
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
        </Fieldset>
      )}

      {/* ④ 수행평가 */}
      <Fieldset
        id="fs-perf"
        title="수행평가"
        action={
          <button className="btn btn-sm btn-ghost" onClick={autoPerfs}>
            건너뛰기 (자동)
          </button>
        }
        error={firstError('perf')}
      >
        {plan.performances.map((p) => (
          <PerfCard key={p.id} perfId={p.id} weeks={teachWeeks} subject={subject} />
        ))}
        <div>
          <button className="btn btn-sm btn-ghost" onClick={addPerf}>
            + 수행평가 추가
          </button>
        </div>
      </Fieldset>

      {/* ⑤ 서술·논술형 */}
      <Fieldset
        id="fs-essay"
        title="서술·논술형 비율"
        action={
          <button className="btn btn-sm btn-ghost" onClick={autoEssay}>
            건너뛰기 (자동)
          </button>
        }
        error={firstError('essay')}
      >
        {/*
         * 라벨 길이가 제각각이라 그냥 두면 칸 높이가 어긋난다.
         * 라벨 자리를 두 줄로 고정하고 글자 크기를 줄여 언제나 같은 높이로 만든다.
         */}
        <div className="field-box grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
          {plan.exams.map((e) => (
            <label key={`x${e.no}`} className="flex flex-col gap-2">
              <span className="label line-clamp-2 h-8 text-[12px] leading-4">
                {e.no}회 정기시험 서술형
              </span>
              <input
                className="control text-center"
                type="number"
                value={essayPct(e.no)}
                onChange={(ev) => setEssayPct(e.no, Number(ev.target.value) || 0)}
              />
            </label>
          ))}
          {plan.performances.map((p) => (
            <label key={p.id} className="flex flex-col gap-2">
              <span
                className="label line-clamp-2 h-8 text-[12px] leading-4"
                title={p.name || '(이름 없음)'}
              >
                {p.name || '(이름 없음)'} ({p.ratio}%)
              </span>
              <input
                className="control text-center"
                type="number"
                value={perfEssayRatio(p)}
                onChange={(ev) => setPerfEssay(p.id, Number(ev.target.value) || 0)}
              />
            </label>
          ))}
        </div>

        <div className="flex flex-wrap items-baseline gap-x-6 text-[13px]">
          <span className="text-ink-2">
            지필 {(essay - perfEssayTotal(plan)).toFixed(0)}% + 수행 {perfEssayTotal(plan)}%
          </span>
          <span
            className={
              essay < school.rules.essay_min ? 'font-semibold text-red' : 'font-semibold text-navy'
            }
          >
            합계 {essay.toFixed(0)}% / {school.rules.essay_min}%
          </span>
        </div>
      </Fieldset>

      <div className="flex items-center gap-4 border-t border-line-soft pt-6">
        <button className="btn btn-lg" disabled={!ready} onClick={onDone}>
          계획서 만들기
        </button>
        {!ready && (
          <span className="text-[13px] text-ink-3">
            {plan.teachers.length === 0 ? '지도교사' : '수행평가 이름'}을 넣어 주세요
          </span>
        )}
        {result.errors.length > 0 && ready && (
          <span className="text-[13px] text-amber">고칠 곳 {result.errors.length}군데</span>
        )}
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
    <div className="field-box flex flex-col gap-3">
      {/* 라벨 높이를 고정해 칸끼리 어긋나지 않게 한다 */}
      <div className="grid grid-cols-[1.8fr_1fr_0.7fr_auto] items-start gap-3">
        <label className="flex flex-col gap-2">
          <span className="label flex h-5 items-center gap-2">
            명칭
            <span className={`text-[12px] ${over ? 'text-red' : 'text-ink-4'}`}>
              {nameLen}/{school.rules.perf_name_maxlen}
            </span>
          </span>
          <input
            className="control"
            value={name}
            placeholder="사회 불평등 실태 조사와 대안 제시"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="label flex h-5 items-center">실시 시기</span>
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
        </label>
        <label className="flex flex-col gap-2">
          <span className="label flex h-5 items-center">비율 (%)</span>
          <input
            className="control text-center"
            type="number"
            max={school.rules.perf_area_max}
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
        </label>
        <div className="flex flex-col gap-2">
          <span className="label h-5" aria-hidden />
          <button className="btn btn-sm btn-ghost" onClick={() => removePerf(perf.id)}>
            삭제
          </button>
        </div>
      </div>

      <label className="flex flex-col gap-2">
        <span className="label flex h-5 items-center gap-2">
          내용
          <span className="text-[12px] text-ink-4">{methodsFromIntent(intent).method}</span>
        </span>
        <textarea
          className="control min-h-[76px]"
          value={intent}
          placeholder="학생들이 자료를 찾아 불평등 실태를 조사하고 정책 대안을 발표하게 하고 싶다"
          onChange={(e) => setIntent(e.target.value)}
        />
      </label>

      {/* 성취기준 — 안 고르면 진도에 맞춰 자동으로 채운다 */}
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn btn-sm btn-ghost" onClick={() => setPicking(true)}>
          성취기준 {perf.standards_manual ? '고침' : '자동'} · {perf.standard_codes.length}
        </button>
        {perf.standard_codes.map((c) => (
          <span key={c} className="chip chip-tag" title={stdText(c)}>
            {c}
          </span>
        ))}
      </div>

      {picking && (
        <ChipPicker
          title={`${name || '수행평가'} · 성취기준`}
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
