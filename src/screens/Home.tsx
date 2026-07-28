'use client'

/**
 * 홈 = 작성 화면. 이 한 장에서 계획서가 완성된다.
 *
 * 입력은 구획(Fieldset) 다섯 개로 나뉜다 — 기본 / 정기시험 / 시험 범위 / 수행평가 / 서논술형.
 * 모든 입력은 계획서에 곧바로 반영된다. '적용' 같은 버튼은 두지 않는다.
 * 루브릭 세부는 여기서 다루지 않는다 — AI 초안을 한글에서 다듬는 것이 이 앱의 전제다.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChipPicker, ConfirmDialog, Field, Fieldset, Screen } from '@/components/ui'
import { SubjectPicker, type SubjectDraft } from '@/components/SubjectPicker'
import { usePlanStore } from '@/store/usePlanStore'
import {
  essayTotal,
  examEssayPct,
  examRatioOf,
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
    openPlan,
    newPlan,
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
  /* 과목을 고르는 순간 고르기 화면을 물리고, 작성 화면이 올라오게 한다 */
  const [leaving, setLeaving] = useState(false)
  /* 검색칸에 뭔가 쓰면 '작성 시작' 버튼이 나온다 */
  const [draft, setDraft] = useState<SubjectDraft | null>(null)

  /*
   * 새로고침하거나 창을 닫았다 와도 쓰던 계획서로 돌아온다.
   * 목록을 보여 주는 대신 가장 최근 것을 그냥 이어서 연다 —
   * 처음부터 다시 시작하려면 헤더의 '새 계획서'를 누르면 된다.
   */
  const resumed = useRef(false)
  useEffect(() => {
    if (resumed.current || currentPlanId || plans.length === 0) return
    resumed.current = true
    const latest = [...plans].sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0]
    if (latest) openPlan(latest.id)
  }, [currentPlanId, plans, openPlan])

  const pickSubject = async (name: string, listed: boolean) => {
    setPickError(null)
    if (!plan) setLeaving(true)
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
      setLeaving(false)
      setPickError(e instanceof Error ? e.message : '과목을 불러오지 못했습니다')
    } finally {
      setLoading(false)
    }
  }

  /*
   * 과목을 고르기 전에는 이것 하나만 보여준다.
   * 할 일이 하나뿐인 화면이라 위로 붙이지 않고 가운데에 놓는다.
   */
  if (!plan || !subject) {
    return (
      <div
        className={`flex min-h-[calc(100vh-14rem)] flex-col items-center justify-center gap-4 ${
          leaving ? 'fade-out' : 'fade-in'
        }`}
      >
        <section
          id="fs-basic"
          className="flex items-center gap-4 rounded-box border border-line-card bg-surface-sub px-5 py-4"
        >
          <h2 className="shrink-0 text-[15px] font-semibold">과목</h2>
          <div className="w-[420px]">
            <SubjectPicker value="" onPick={pickSubject} autoFocus onDraftChange={setDraft} />
          </div>
          {/* 쓰기 시작하면 나타난다 — Enter로도 같은 값이 확정된다 */}
          {draft && (
            <button
              className="btn btn-sm btn-accent shrink-0 fade-in"
              disabled={loading}
              onClick={() => pickSubject(draft.name, draft.listed)}
            >
              작성 시작 →
            </button>
          )}
        </section>
        <span className="h-5 text-[13px] text-ink-3">
          {pickError ? <span className="text-red">{pickError}</span> : loading ? '불러오는 중…' : ''}
        </span>
      </div>
    )
  }

  return (
    <div className="fade-in">
      <PlanForm
        key={plan.id}
        pickError={pickError}
        onPickSubject={pickSubject}
        onDone={() => go('generating')}
      />
    </div>
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
  const { school, patchPlan, upsertPerf, redistribute, focusTarget, clearFocus } = usePlanStore()
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
  /*
   * 수행평가 이름을 쓰기 전에는 오류를 조용히 둔다 — 작성 중인 계획서는
   * 원래 규칙을 못 지킨다. '계획서 만들기'는 어차피 ready 조건이 막고 있다.
   */
  const showErrors = plan.performances.some((p) => p.name.trim().length > 0)
  const firstError = (t: FocusTarget) =>
    showErrors ? result.errors.find((e) => e.target === t)?.title : undefined

  /*
   * 시험 범위는 자동으로 배정돼 있으므로 접어 두고 요약만 보여 준다.
   * '직접 입력'을 누르거나 오류가 걸리면 펼쳐진다.
   */
  const [openSec, setOpenSec] = useState({ anchor: false })
  const toggleSec = (k: 'anchor') => setOpenSec((s) => ({ ...s, [k]: !s[k] }))

  /* 오류의 '고치기' — 구획을 펼치고 스크롤한 뒤 첫 입력에 포커스 */
  useEffect(() => {
    if (!focusTarget) return
    if (focusTarget === 'anchor') setOpenSec((s) => ({ ...s, anchor: true }))
    const t = setTimeout(() => {
      const el = document.getElementById(`fs-${focusTarget}`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el?.querySelector<HTMLElement>('input, select, textarea')?.focus()
      clearFocus()
    }, 60)
    return () => clearTimeout(t)
  }, [focusTarget, clearFocus])

  /* 지도교사는 타이핑 중 쪼개지 않게 debounce */
  const [teachers, setTeachers] = useState(plan.teachers.join(', '))
  useDebounced(teachers, (v) =>
    patchPlan({ teachers: v.split(',').map((t) => t.trim()).filter(Boolean) }),
  )

  /**
   * 회차별 시험 범위(앵커)를 자동으로 잡는다.
   *
   *  - 두 번 보면 1회는 성취기준의 절반쯤에서 끊고, 2회(기말)는 끝까지 간다.
   *  - 한 번만 보면 그 시험이 학기의 어디쯤에 있는지에 비례해 끊는다.
   *    (1회 고사만 보는데 끝까지로 잡으면 전 과정이 중간고사 전으로 몰린다.)
   */
  const autoAnchors = <T extends { no: number; week: number; anchor_code: string | null }>(
    exams: T[],
  ): T[] => {
    const n = codes.length
    if (n === 0) return exams
    const hasFinal = exams.some((e) => e.no === 2)
    return exams.map((e) => {
      let idx: number
      if (e.no === 2) idx = n - 1
      else if (hasFinal) idx = Math.round(n / 2) - 1
      else {
        const upto = teachWeeks.filter((w) => w.no < e.week).length
        idx = Math.round((n * upto) / Math.max(1, teachWeeks.length)) - 1
      }
      return { ...e, anchor_code: codes[Math.max(0, Math.min(n - 1, idx))] ?? null }
    })
  }

  const setExamCount = (n: 0 | 1 | 2) => {
    const examWeeks = weeks.filter((w) => w.is_exam).map((w) => w.no)
    // 회차가 바뀌면 전체 비율을 회차 수로 다시 나눈다
    const total = n === 0 ? 0 : plan.exam_count > 0 ? plan.exam_ratio : school.rules.exam_ratio
    const each = n > 0 ? Math.round(total / n) : 0
    const exams = Array.from({ length: n }, (_, i) => {
      // 순번이 아니라 회차로 찾는다 — 1회만 보다가 2회로 늘리면 순번이 어긋난다
      const prev = plan.exams.find((x) => x.no === i + 1)
      return {
        no: i + 1,
        // 시험 주는 학사일정이 정한다 — 옛 값을 물려받으면 회차끼리 같은 주에 겹친다
        week: examWeeks[i] ?? examWeeks[examWeeks.length - 1] ?? 1,
        anchor_code: prev?.anchor_code ?? null,
        ratio: each,
        parts: prev?.parts ?? [
          { kind: '선택형' as const, count: 20, points: 70 },
          { kind: '서술형' as const, count: 5, points: 30 },
        ],
      }
    })
    const sum = each * n
    // 회차가 바뀌면 시험 범위도 다시 잡는다 — 옛 범위를 끌고 가면 진도가 어그러진다
    patchPlan({ exam_count: n, exams: autoAnchors(exams), exam_ratio: sum, perf_ratio: 100 - sum })
    setTimeout(redistribute, 0)
    setTimeout(rebalancePerfRatios, 0)
  }

  /**
   * 시험을 한 번만 볼 때 그것이 1회고사인지 2회고사인지.
   *
   * 회차에 따라 시험 주가 학기 중간이냐 기말이냐로 갈리고, 그러면 진도 배분도
   * 통째로 달라진다. 학교마다 다르므로 고르게 둔다.
   */
  const setSingleExamNo = (n: 1 | 2) => {
    const examWeeks = weeks.filter((w) => w.is_exam).map((w) => w.no)
    const e = plan.exams[0]
    if (!e) return
    patchPlan({
      exams: autoAnchors([
        { ...e, no: n, week: examWeeks[n - 1] ?? examWeeks[examWeeks.length - 1] ?? e.week },
      ]),
    })
    setTimeout(redistribute, 0)
  }

  /**
   * 회차 하나의 반영 비율.
   *
   * 전체 정기시험 비율은 회차 값들의 합이고, 수행평가 몫은 그 나머지다.
   * 시험이 있는데 0%면 서술형을 아무리 올려도 반영되지 않으므로 최소 1%를 남긴다.
   * 수행 100%를 원하면 '수행 100%' 칩으로 시험 자체를 없애야 한다.
   */
  const setExamRatio = (no: number, v: number) => {
    const val = Math.max(1, Math.min(100, Math.round(v) || 0))
    const exams = plan.exams.map((e) => ({
      ...e,
      ratio: e.no === no ? val : examRatioOf(plan, e.no),
    }))
    const sum = Math.min(100, exams.reduce((s, e) => s + (e.ratio ?? 0), 0))
    patchPlan({ exams, exam_ratio: sum, perf_ratio: 100 - sum })
    setTimeout(rebalancePerfRatios, 0)
  }

  /** 수행평가 하나의 반영 비율 — 여기서 정한 값은 다시 자동 배분하지 않는다 */
  const setPerfRatio = (perfId: string, v: number) => {
    const p = plan.performances.find((x) => x.id === perfId)
    if (!p) return
    upsertPerf({
      id: p.id,
      name: p.name,
      intent: p.intent ?? p.activity ?? '',
      week: p.week,
      ratio: Math.max(0, Math.min(100, Math.round(v) || 0)),
    })
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

  /*
   * 앵커 자동 배정 — 성취기준을 회차 수만큼 등분해 각 구간의 마지막 기준을 앵커로.
   * 앵커가 하나도 없을 때(새 계획서·과목 교체 직후)만 돈다. 교사가 지운 건 존중한다.
   */
  useEffect(() => {
    if (codes.length === 0 || plan.exams.length === 0) return
    if (!plan.exams.every((e) => !e.anchor_code)) return
    patchPlan({ exams: autoAnchors([...plan.exams].sort((a, b) => a.week - b.week)) })
    setTimeout(redistribute, 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject.id, codes.length, plan.exams.length])

  /* ── 수행평가 ─────────────────────────────── */

  const addPerf = () => {
    const taken = new Set(plan.performances.map((p) => p.week))
    const week = teachWeeks.find((w) => !taken.has(w.no) && w.no > 2)?.no ?? teachWeeks[0]?.no ?? 3
    upsertPerf({ name: '', intent: '', week })
  }

  /* ── 서술·논술형 ──────────────────────────── */

  /**
   * 회차의 서술형을 '전체 성적에서 차지하는 %'로 받는다.
   *
   * 표 안에서 수행평가 쪽 서·논술은 전체 기준 %인데 정기시험만 시험지 안 기준 %면
   * 같은 열의 숫자끼리 뜻이 달라진다. 합계가 30%를 넘는지 눈으로 못 세게 되므로
   * 입력은 전체 기준으로 받고, 시험지 안 배점으로는 여기서 되돌린다.
   */
  const examEssayAbs = (examNo: number) =>
    Math.round((examEssayPct(plan, examNo) / 100) * examRatioOf(plan, examNo))

  const setExamEssayAbs = (examNo: number, abs: number) => {
    const ratio = examRatioOf(plan, examNo)
    if (ratio <= 0) return
    const capped = Math.max(0, Math.min(ratio, Math.round(abs) || 0))
    setEssayPct(examNo, Math.round((capped / ratio) * 100))
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

  const essay = essayTotal(plan, plan.exam_ratio)
  const perfSum = plan.performances.reduce((s, p) => s + p.ratio, 0)
  const ratioSum = plan.exam_ratio + perfSum
  const ready = plan.teachers.length > 0 && plan.performances.some((p) => p.name.trim())

  /* 접힌 구획의 미리보기 — 회차마다 한 줄씩. 가로로 이으면 어느 회차 범위인지 흐려진다 */
  const anchorPreview = (
    <div className="flex min-w-0 flex-1 flex-col gap-1 rounded-control border border-line-input bg-surface px-3 py-2 text-[14px] text-ink">
      {plan.exams.map((e) => (
        <span key={e.no} className="truncate">
          {e.no}회 정기고사 시험범위: {e.anchor_code ?? '미정'}까지
        </span>
      ))}
    </div>
  )

  return (
    /* 제목은 상단 바 간판이 대신한다 — 화면 안에 또 두지 않는다 */
    <Screen>
      {/* ① 기본 — 과목은 제목 옆 칩으로, 나머지만 입력한다 */}
      <Fieldset
        id="fs-basic"
        title={
          <span className="flex items-center gap-2.5">
            기본설정
            <SubjectChip name={subject.name} onChange={onPickSubject} />
          </span>
        }
        error={firstError('basic')}
      >
        {pickError && <span className="text-[13px] text-red">{pickError}</span>}
        <div className="field-box grid grid-cols-[0.8fr_1fr_1.6fr_0.8fr] gap-3">
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

      {/*
       * ② 정기시험 — 횟수와 범위는 한 몸이다. 횟수를 바꾸면 범위도 따라 바뀌므로
       * 구획을 나누지 않고 한 상자 안에 위아래로 놓는다.
       */}
      <section
        id="fs-exam"
        className={`flex flex-col gap-3 rounded-box border px-6 py-4 ${
          firstError('exam') || firstError('anchor')
            ? 'border-red-line bg-red-bg/40'
            : 'border-line-card bg-surface-sub'
        }`}
      >
        <div className="flex items-center gap-5">
          <h2 className="fs-title w-[148px] shrink-0">정기시험</h2>
          <div className="flex flex-1 flex-wrap items-center gap-2">
            {([2, 1] as const).map((n) => (
              <button
                key={n}
                className={`chip ${plan.exam_count === n ? 'chip-on' : ''}`}
                onClick={() => setExamCount(n)}
              >
                {n}회
              </button>
            ))}
            <button
              className={`chip ${plan.exam_count === 0 ? 'chip-on' : ''}`}
              onClick={() => setExamCount(0)}
            >
              수행 100%
            </button>

            {/* 한 번만 볼 때는 그게 몇 회 고사인지에 따라 시험 주가 달라진다 */}
            {plan.exam_count === 1 && (
              <>
                <span className="mx-1 h-5 w-px shrink-0 bg-line-input" />
                {([1, 2] as const).map((n) => (
                  <button
                    key={n}
                    className={`chip ${plan.exams[0]?.no === n ? 'chip-on' : ''}`}
                    onClick={() => setSingleExamNo(n)}
                  >
                    {n}회 정기시험
                  </button>
                ))}
              </>
            )}
          </div>
        </div>

        {/* 시험 범위 — 자동 배정돼 있으므로 평소엔 읽기만 하고, 고칠 때만 펼친다 */}
        {plan.exam_count > 0 && (
          <div id="fs-anchor" className="flex items-start gap-5">
            <h3 className="fs-title w-[148px] shrink-0 pt-1.5">시험범위</h3>
            {/* 미리보기는 글자 길이만큼만 차지하고, 고치는 버튼이 바로 뒤에 붙는다 */}
            <div className="flex min-w-0 flex-1 items-start gap-3">
              {openSec.anchor || firstError('anchor') ? (
                <div className="field-box grid flex-1 grid-cols-2 gap-3">
                  {plan.exams.map((e) => (
                    <Field key={e.no} label={`${e.no}회 정기고사 (${e.week}주) 시험범위`}>
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
              ) : (
                anchorPreview
              )}
              {!firstError('anchor') && (
                <button
                  className="btn btn-sm btn-accent shrink-0"
                  onClick={() => toggleSec('anchor')}
                >
                  {openSec.anchor ? '접기 ▴' : '직접 입력 ▾'}
                </button>
              )}
            </div>
          </div>
        )}

        {(firstError('exam') || firstError('anchor')) && (
          <span className="pl-[168px] text-[13px] text-red">
            {firstError('exam') ?? firstError('anchor')}
          </span>
        )}
      </section>

      {/*
       * ④ 비율 조정 — 반영 비율과 서·논술 비율을 항목마다 한 줄에서 정한다.
       * 여기서 수행평가를 늘리면 아래 수행평가 구획에 카드가 따라 생긴다.
       */}
      <Fieldset
        id="fs-essay"
        title="비율 조정"
        action={
          <button className="btn btn-sm btn-accent" onClick={addPerf}>
            + 수행평가
          </button>
        }
        error={firstError('essay')}
      >
        <div className="field-box flex flex-col gap-2">
          {/*
           * 두 열로 놓는다 — 한 열이면 이름과 숫자 칸 사이가 허허벌판이 된다.
           * 두 숫자 모두 '전체 성적에서 차지하는 %'라 세로로 훑으며 더할 수 있다.
           */}
          {/*
           * 폼 폭이 880px로 고정이라 화면 크기와 무관하게 두 열로 간다.
           * (좁은 화면만 한 열 — sm 미만)
           */}
          <div className="grid gap-x-7 gap-y-2 sm:grid-cols-2">
            <RatioHead />
            <RatioHead className="hidden sm:grid" />

            {plan.exams.map((e) => (
              <RatioRow
                key={`x${e.no}`}
                label={`${e.no}회 정기시험`}
                ratio={examRatioOf(plan, e.no)}
                essay={examEssayAbs(e.no)}
                onRatio={(v) => setExamRatio(e.no, v)}
                onEssay={(v) => setExamEssayAbs(e.no, v)}
              />
            ))}

            {plan.performances.map((p, i) => (
              <RatioRow
                key={p.id}
                label={p.name}
                placeholder={`수행평가 ${i + 1}`}
                ratio={p.ratio}
                essay={perfEssayRatio(p)}
                onRatio={(v) => setPerfRatio(p.id, v)}
                onEssay={(v) => setPerfEssay(p.id, v)}
              />
            ))}
          </div>

          <div className="flex flex-wrap items-baseline gap-x-5 border-t border-line-input pt-3 text-[13px]">
            <span className={ratioSum === 100 ? 'text-ink-2' : 'font-semibold text-amber'}>
              반영 합계 {ratioSum}%{ratioSum !== 100 && (ratioSum < 100 ? ' · 모자람' : ' · 넘침')}
            </span>
            <span
              className={
                essay < school.rules.essay_min
                  ? 'font-semibold text-red'
                  : 'font-semibold text-navy'
              }
            >
              서·논술 {essay.toFixed(0)}% / {school.rules.essay_min}%
            </span>
            <span className="text-ink-2">
              지필 {(essay - perfEssayTotal(plan)).toFixed(0)}% + 수행 {perfEssayTotal(plan)}%
            </span>
          </div>
        </div>
      </Fieldset>

      {/* ⑤ 수행평가 — 맨 아래. 위에서 늘린 만큼 카드가 여기 생긴다 */}
      <Fieldset
        id="fs-perf"
        title="수행평가"
        action={
          <button className="btn btn-sm btn-accent" onClick={addPerf}>
            + 추가
          </button>
        }
        error={firstError('perf')}
      >
        {plan.performances.length === 0 ? (
          <p className="text-[13px] text-ink-3">
            위에서 &lsquo;+ 수행평가&rsquo;를 누르거나 여기서 추가하세요
          </p>
        ) : (
          plan.performances.map((p) => (
            <PerfCard key={p.id} perfId={p.id} weeks={teachWeeks} subject={subject} />
          ))
        )}
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

/* ── 비율 조정 한 줄 ──────────────────────────── */

const RATIO_COLS = 'grid grid-cols-[1fr_80px_80px] items-center gap-2'

function RatioHead({ className = '' }: { className?: string }) {
  return (
    <div className={`${RATIO_COLS} px-1 ${className}`}>
      <span className="label">항목</span>
      <span className="label text-center">반영 비율</span>
      {/* 서논술은 반영 비율 안에 든 값이다 — 글씨 색으로 다른 종류임을 알린다 */}
      <span className="label text-center text-navy">서논술 비율</span>
    </div>
  )
}

function RatioRow({
  label,
  placeholder,
  ratio,
  essay,
  onRatio,
  onEssay,
}: {
  label: string
  /** 이름을 아직 안 쓴 수행평가에 붙일 임시 이름 */
  placeholder?: string
  ratio: number
  essay: number
  onRatio: (v: number) => void
  onEssay: (v: number) => void
}) {
  return (
    <div className={RATIO_COLS}>
      <span className="truncate pl-1 text-[14px]" title={label || placeholder}>
        {label || <span className="text-ink-3">{placeholder}</span>}
      </span>
      <input
        className="control text-center"
        type="number"
        value={ratio}
        onChange={(e) => onRatio(Number(e.target.value) || 0)}
      />
      <input
        className="control control-sub text-center"
        type="number"
        value={essay}
        onChange={(e) => onEssay(Number(e.target.value) || 0)}
      />
    </div>
  )
}

/* ── 과목 칩 — 눌러야 바꾸는 칸이 열린다 ────────── */

function SubjectChip({
  name,
  onChange,
}: {
  name: string
  onChange: (name: string, listed: boolean) => void
}) {
  const [editing, setEditing] = useState(false)

  if (editing) {
    return (
      <span className="inline-flex w-[320px] items-center gap-2">
        <SubjectPicker
          value={name}
          autoFocus
          onPick={(n, listed) => {
            setEditing(false)
            onChange(n, listed)
          }}
        />
        <a className="shrink-0 text-[13px]" onClick={() => setEditing(false)}>
          취소
        </a>
      </span>
    )
  }

  return (
    <button
      className="chip chip-tag cursor-pointer text-[13px] font-medium"
      onClick={() => setEditing(true)}
      title="눌러서 과목 바꾸기"
    >
      {name} ▾
    </button>
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
  const [confirming, setConfirming] = useState(false)

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
    <div className="field-box relative flex flex-col gap-3">
      {/* 지우기는 오른쪽 위 모서리에 — 입력 칸 사이에 두면 잘못 누른다 */}
      <button
        className="btn-trash absolute top-2.5 right-2.5"
        onClick={() => setConfirming(true)}
        title="이 수행평가 지우기"
        aria-label="이 수행평가 지우기"
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9.2a1 1 0 0 0 1 .8h4.6a1 1 0 0 0 1-.8L12 4M6.5 7v4M9.5 7v4" />
        </svg>
      </button>

      {/* 라벨 높이를 고정해 칸끼리 어긋나지 않게 한다. 비율은 '비율 조정'에서 정한다 */}
      <div className="grid grid-cols-[1.6fr_1fr_auto] items-start gap-3 pr-11">
        <label className="flex flex-col gap-2">
          <span className="label label-over flex h-5 items-center gap-2">
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
          <span className="label label-over flex h-5 items-center">실시 시기</span>
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
        <div className="flex flex-col gap-2">
          <span className="label h-5" aria-hidden />
          {/* 성취기준 — 안 고르면 진도에 맞춰 자동으로 채운다 */}
          <button className="btn btn-sm btn-accent" onClick={() => setPicking(true)}>
            성취기준 입력
            <svg
              className="ml-1.5 inline-block align-[-2px]"
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M11.5 2.5a1.6 1.6 0 0 1 2.3 2.3L5.6 13 2.5 13.5 3 10.4z" />
            </svg>
          </button>
        </div>
      </div>

      <label className="flex flex-col gap-2">
        <span className="label label-over flex h-5 items-center gap-2">
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

      <div className="flex flex-wrap items-center gap-2">
        {perf.standard_codes.map((c) => (
          <span key={c} className="chip chip-tag" title={stdText(c)}>
            {c}
          </span>
        ))}
      </div>

      {confirming && (
        <ConfirmDialog
          title={`‘${name || '이름 없는 수행평가'}’를 지울까요?`}
          detail="내용과 성취기준, 루브릭까지 함께 사라집니다. 되돌릴 수 없습니다."
          onConfirm={() => removePerf(perf.id)}
          onClose={() => setConfirming(false)}
        />
      )}

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

