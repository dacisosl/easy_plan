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
  essayExempt,
  essayTotal,
  examRatioOf,
  monthWeekLabel,
  orderedStandardCodes,
  perfEssayRatio,
  perfEssayTotal,
  weeksOf,
} from '@/lib/derive'
import { methodsFromIntent } from '@/lib/autofill'
import { validate } from '@/lib/validate'
import type { ExamPart, FocusTarget, Performance, SemesterPlan, Subject } from '@/types'

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
   * 쓰던 계획서로 되돌아가는 일은 저장분을 읽는 시점에 끝난다(store의 onRehydrateStorage).
   * 여기서 effect로 하면 첫 프레임이 '계획서 없음'으로 그려져 첫 화면이 반짝인다.
   */

  /*
   * 첫 화면으로 돌아오면 '물러나는 중' 표시를 끈다.
   *
   * 과목을 고를 때 켠 페이드아웃이 그대로 남아 있으면, '이전'으로 돌아왔을 때
   * 첫 화면이 투명한 채로 그려져 아무것도 없는 화면이 된다.
   */
  useEffect(() => {
    if (!currentPlanId) setLeaving(false)
  }, [currentPlanId])

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

  const pickSubject = async (name: string, listed: boolean) => {
    setPickError(null)
    // 과목을 이미 고른 뒤 바꾸는 경우엔 첫 화면이 아니라 그냥 갈아끼운다
    if (!listed) {
      const id = upsertManualSubject(name)
      if (plan) patchPlan({ subject_id: id })
      else newPlan(id)
      return
    }
    setLoading(true)
    const started = Date.now()
    try {
      const res = await fetch(`/api/subjects/${encodeURIComponent(name)}`)
      if (!res.ok) throw new Error(`과목을 불러오지 못했습니다 (${res.status})`)
      const imported = await res.json()

      if (!plan) {
        await sleep(Math.max(0, MIN_SHOW_MS - (Date.now() - started)))
        setLoading(false)
        // 여기서야 물러난다 — 먼저 물리면 로딩 표시가 보이지 않는다
        setLeaving(true)
        await sleep(180)
      }
      const id = upsertSubject(imported)
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
      <HeroScreen
        leaving={leaving}
        loading={loading}
        pickError={pickError}
        draft={draft}
        onDraftChange={setDraft}
        onPick={pickSubject}
      />
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

/**
 * 첫 화면.
 *
 * 두 박자로 연다 — 물음 하나만 먼저 띄우고, 잠깐 뒤에 그 답을 펼친다.
 * 한꺼번에 다 띄우면 볼 것이 많아 어디부터 읽을지 모른다.
 *
 * ★ Home이 아니라 여기서 상태를 갖는 이유: Home은 작성 화면일 때도 계속 살아 있어서,
 *   '새 계획서'로 돌아오면 타이머가 이미 지나간 뒤라 펼침이 안 걸린다.
 *   이 컴포넌트는 첫 화면에 올 때마다 새로 마운트되므로 매번 제대로 열린다.
 */
function HeroScreen({
  leaving,
  loading,
  pickError,
  draft,
  onDraftChange,
  onPick,
}: {
  leaving: boolean
  loading: boolean
  pickError: string | null
  draft: SubjectDraft | null
  onDraftChange: (d: SubjectDraft | null) => void
  onPick: (name: string, listed: boolean) => void
}) {
  /*
   * 세 장면으로 넘어간다.
   *   ask     물음만 크게 — 고개를 끄덕일 시간을 준다
   *   leaving 물음이 물러난다 (사라지는 동안)
   *   answer  그 자리에 답이 아래에서 떠오른다
   * 과목을 고르면(loading) 이 셋은 전부 물러나고 기다림 안내만 남는다.
   */
  const [phase, setPhase] = useState<'ask' | 'leaving' | 'answer'>('ask')
  /*
   * 한 단계씩 이어 붙인다.
   *
   * ★ 두 타이머를 한 effect에 같이 두면 안 된다. 첫 타이머가 phase를 바꾸는 순간
   *   effect가 정리되면서 아직 안 터진 둘째 타이머까지 지워져, 물러난 채로 멈춘다
   *   (화면이 통째로 비어 보인다).
   */
  useEffect(() => {
    if (phase === 'ask') {
      const t = setTimeout(() => setPhase('leaving'), 2300)
      return () => clearTimeout(t)
    }
    if (phase === 'leaving') {
      const t = setTimeout(() => setPhase('answer'), 380)
      return () => clearTimeout(t)
    }
  }, [phase])

  {
    return (
      <div
        className={`flex min-h-[calc(100vh-11rem)] flex-col items-center justify-center ${
          leaving ? 'fade-out' : 'fade-in'
        }`}
      >
        {/*
         * 과목을 고른 뒤에는 이 화면의 말을 전부 거둔다.
         * 기다리는 사람에게 읽을 것을 남겨 두면 뭘 봐야 할지 헷갈린다.
         */}
        {loading ? (
          <LoadingBar />
        ) : phase !== 'answer' ? (
          /* 물음 — 이 한마디에 고개가 끄덕여져야 다음이 읽힌다 */
          <div
            className={`flex flex-col items-center ${
              phase === 'leaving' ? 'stage-out' : 'fade-in'
            }`}
          >
            <p className="text-center text-[clamp(19px,3.4vw,30px)] leading-[1.45] font-medium tracking-[-0.02em] text-ink-2">
              평가계획서 편집하느라
              <br />
              그동안 너무 <span className="font-semibold text-red">화</span>나셨나요?
            </p>
            {/* 기다리기 싫은 사람은 눌러서 바로 넘어간다 */}
            <button
              className="mt-5 cursor-pointer border-0 bg-transparent p-0 text-[14px] text-navy underline-offset-4 hover:underline"
              onClick={() => setPhase('leaving')}
            >
              화 나신다면 클릭!
            </button>
          </div>
        ) : (
          <div className="w-full">
            <div className="stage-in flex flex-col items-center pt-5">
              {/*
               * '선생님,' 하고 한 박자 쉬었다가 나머지가 들어온다.
               * 부르고 → 답하는 말맛이 생긴다. 자리는 미리 잡아 두므로 줄이 밀리지 않는다.
               */}
              <h1 className="text-center text-[clamp(26px,6.4vw,56px)] leading-[1.2] font-semibold tracking-[-0.035em] text-ink">
                선생님,{' '}
                <span className="stage-in-late inline-block">
                  <span className="text-red">편집</span>은{' '}
                  <span className="text-navy">제가 합니다.</span>
                </span>
              </h1>
              {/* 이 도구가 하려는 말 — 한 글자씩 찍어 눈이 한 번 더 머물게 한다 */}
              <p className="mt-4 min-h-[27px] text-center text-[18px] text-ink-2">
                <Typewriter
                  text="이제 진짜 ‘계획’에만 집중해주세요."
                  startDelay={1650}
                  speed={78}
                />
              </p>

              {/* 이 화면의 할 일은 하나 — 검색줄이 곧 시작 버튼이다 */}
              <section id="fs-basic" className="mt-9 w-full max-w-[660px]">
                <SubjectPicker
                  value=""
                  onPick={onPick}
                  autoFocus
                  hero
                  onDraftChange={onDraftChange}
                  placeholder="과목명을 입력하세요 — 예) 대수, 통합사회1"
                  right={
                    draft && (
                      <button
                        className="btn btn-accent fade-in h-11 rounded-full px-5"
                        disabled={loading}
                        onClick={() => onPick(draft.name, draft.listed)}
                      >
                        시작 →
                      </button>
                    )
                  }
                />
              </section>

              <div className="proof mt-6">
                <span>
                  <b>모든</b> 과목 작성 가능
                </span>
                <span className="text-ink-5">·</span>
                <span>
                  <b>2022 개정</b> 성취기준 반영
                </span>
                <span className="text-ink-5">·</span>
                <span>
                  <b>한글 파일</b> 그대로
                </span>
              </div>

              <div className="mt-5 h-6">
                {pickError && <span className="text-[13px] text-red">{pickError}</span>}
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }
}

/*
 * 기다림 안내.
 *
 * 실제 걸리는 시간과 상관없이 문구 하나당 1초씩 보여 준다. 성취기준을 가져오는 일이
 * 대개 빨라서, 진짜 시간에 맞추면 아무 일도 없던 것처럼 화면이 툭 바뀐다.
 * 무슨 일이 있었는지 읽을 틈을 주는 편이 낫다.
 */
const LOADING_STEPS = ['성취기준을 가져오는 중…', '선생님을 위한 양식을 준비하는 중…']
const LOADING_STEP_MS = 1000
/** 문구를 다 보여 줄 만큼은 기다린다 */
const MIN_SHOW_MS = LOADING_STEPS.length * LOADING_STEP_MS

/**
 * 한 글자씩 찍어 나가는 줄.
 *
 * 이 문장이 이 도구가 하려는 말이라 눈이 한 번 더 머물러야 한다.
 * 따옴표로 묶인 부분만 굵게 — 다 찍힌 뒤가 아니라 찍히는 대로 굵어진다.
 */
function Typewriter({
  text,
  startDelay = 0,
  speed = 55,
}: {
  text: string
  startDelay?: number
  speed?: number
}) {
  const [n, setN] = useState(0)
  useEffect(() => {
    let timer: ReturnType<typeof setInterval>
    const start = setTimeout(() => {
      timer = setInterval(() => {
        setN((i) => {
          if (i >= text.length) {
            clearInterval(timer)
            return i
          }
          return i + 1
        })
      }, speed)
    }, startDelay)
    return () => {
      clearTimeout(start)
      clearInterval(timer)
    }
  }, [text, startDelay, speed])

  const a = text.indexOf('‘')
  const b = text.indexOf('’') + 1
  const shown = text.slice(0, n)
  const done = n >= text.length

  return (
    <span>
      {a < 0 ? (
        shown
      ) : (
        <>
          {shown.slice(0, Math.min(n, a))}
          <b className="font-semibold text-ink">{shown.slice(a, Math.min(n, b))}</b>
          {shown.slice(Math.min(n, b))}
        </>
      )}
      {!done && <span className="caret" aria-hidden />}
    </span>
  )
}

/**
 * 과목을 고른 뒤 잠깐의 기다림.
 *
 * 성취기준 3,086개가 든 파일에서 그 과목만 뽑아 오는 시간이라 눈에 띈다.
 * 아무 표시가 없으면 눌린 건지 모르고 다시 누른다 — 무슨 일을 하는 중인지
 * 말로 알려 주고, 막대로 '돌아가고 있음'을 보인다.
 */
function LoadingBar() {
  const [at, setAt] = useState(0)
  useEffect(() => {
    const t = setInterval(
      () => setAt((i) => Math.min(i + 1, LOADING_STEPS.length - 1)),
      LOADING_STEP_MS,
    )
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="fade-in flex flex-col items-center gap-3">
      <span className="text-[15px] text-ink-2">{LOADING_STEPS[at]}</span>
      <span className="loading-bar" />
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
  const {
    school,
    patchPlan,
    upsertPerf,
    addPerf: addPerfToPlan,
    removePerf,
    rebalancePerfRatios,
    redistribute,
    focusTarget,
    clearFocus,
  } = usePlanStore()
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

  /* 시험지 100점을 어떻게 나눌지 — 선택형은 나머지라 따로 적지 않는다 */
  const pointsOf = (e: { parts: ExamPart[] }, kind: ExamPart['kind']) =>
    e.parts.filter((p) => p.kind === kind).reduce((s, p) => s + p.points, 0)

  /**
   * 단답형·서술형 배점을 정하면 선택형이 나머지를 갖는다.
   *
   * Ⅳ 표에서 이 회차가 차지하는 열 수가 곧 유형 개수다. 배점 0인 유형은 빼서
   * 열이 헛되이 늘지 않게 한다 — 실물도 국어는 선택형 하나, 수학은 셋이었다.
   */
  const setExamPoints = (examNo: number, kind: '단답형' | '서술형', points: number) => {
    const e = plan.exams.find((x) => x.no === examNo)
    if (!e) return
    const other = kind === '단답형' ? pointsOf(e, '서술형') : pointsOf(e, '단답형')
    const v = Math.max(0, Math.min(100 - other, Math.round(points) || 0))
    const want: Record<ExamPart['kind'], number> = {
      선택형: 100 - v - other,
      단답형: kind === '단답형' ? v : other,
      서술형: kind === '서술형' ? v : other,
    }
    const counts: Record<string, number> = { 선택형: 20, 단답형: 5, 서술형: 5 }
    const parts = (['선택형', '단답형', '서술형'] as const)
      .filter((k) => want[k] > 0)
      .map((k) => ({
        kind: k,
        count: e.parts.find((p) => p.kind === k)?.count ?? counts[k],
        points: want[k],
      }))
    patchPlan({ exams: plan.exams.map((x) => (x.no === examNo ? { ...x, parts } : x)) })
  }

  /* 오류의 '고치기' — 구획을 펼치고 스크롤한 뒤 첫 입력에 포커스 */
  useEffect(() => {
    if (!focusTarget) return
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
    patchPlan({
      teachers: v
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    }),
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
    const sum = Math.min(
      100,
      exams.reduce((s, e) => s + (e.ratio ?? 0), 0),
    )
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

  /*
   * 비율 조정에서 지울 때.
   *
   * 갓 추가해 비어 있는 줄이면 그냥 지운다 — 잘못 눌러 생긴 빈 칸을 지우는 데
   * 확인을 또 받으면 성가시다. 이름이나 내용이 들어 있으면 그때만 묻는다.
   */
  const [confirmPerfId, setConfirmPerfId] = useState<string | null>(null)
  const askRemovePerf = (p: Performance) => {
    const filled = p.name.trim() || (p.intent ?? p.activity ?? '').trim()
    if (filled) setConfirmPerfId(p.id)
    else removePerf(p.id)
  }

  const addPerf = () => {
    const taken = new Set(plan.performances.map((p) => p.week))
    const week = teachWeeks.find((w) => !taken.has(w.no) && w.no > 2)?.no ?? teachWeeks[0]?.no ?? 3
    // 추가와 재배분이 한 호흡이어야 마지막 칸이 0%로 남지 않는다
    addPerfToPlan(week)
  }

  /* ── 서술·논술형 ──────────────────────────── */

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
        <div className="field-box grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[0.7fr_0.8fr_1.5fr_0.7fr_1fr]">
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
          {/* 성취도 A~E를 가르는 점수를 어떻게 정하는지 — Ⅲ-1·Ⅲ-2 문구가 여기서 갈린다 */}
          <Field label="분할점수">
            <select
              className="control"
              value={plan.split_score_type}
              onChange={(e) =>
                patchPlan({ split_score_type: e.target.value as SemesterPlan['split_score_type'] })
              }
            >
              <option value="추정">추정분할</option>
              <option value="고정">고정분할</option>
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
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <h2 className="fs-title shrink-0 sm:w-[104px]">정기시험</h2>
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

        {/*
         * 시험 범위 — 회차마다 드롭다운 하나씩, 한 줄로.
         * 자동으로 배정돼 있으니 미리보기와 '직접 입력'을 거치지 않고
         * 바로 고칠 수 있게 둔다. 한 번 더 누르게 할 만큼 깊은 설정이 아니다.
         */}
        {plan.exam_count > 0 && (
          <div id="fs-anchor" className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <h3 className="fs-title shrink-0 sm:w-[104px]">시험범위</h3>
            <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:gap-3">
              {plan.exams.map((e) => (
                /*
                 * 닫혀 있을 때는 회차와 코드만, 펼치면 성취기준 문장까지 보인다.
                 * 닫힌 칸에 긴 문장을 넣으면 어차피 잘려서 읽지도 못하면서 자리만 먹는다.
                 * 그래서 선택 칸의 글자는 감추고 그 위에 짧은 표기를 얹는다.
                 */
                <label key={e.no} className="flex min-w-0 flex-1 items-center gap-2">
                  {/*
                   * 칸 이름은 '1회'까지만 — 왼쪽 제목이 이미 '시험범위'라 두 번 적을 필요가 없다.
                   * 폭을 44px로 고정해 아래 '반영 비율' 칸과 세로줄이 맞는다.
                   */}
                  <span className="w-[44px] shrink-0 text-[14px] text-ink-2">{e.no}회</span>
                  <span className="relative flex min-w-0 flex-1">
                    <select
                      className="control select-masked w-full min-w-0"
                      value={e.anchor_code ?? ''}
                      onChange={(ev) => setAnchor(e.no, ev.target.value)}
                    >
                      <option value="">— 고르세요 —</option>
                      {codes.map((c) => (
                        <option key={c} value={c}>
                          {c} {stdText(c).slice(0, 40)}
                        </option>
                      ))}
                    </select>
                    <span
                      className={`pointer-events-none absolute inset-y-0 left-3 flex items-center text-[14px] ${
                        e.anchor_code ? 'text-ink' : 'text-ink-3'
                      }`}
                    >
                      {e.anchor_code ?? '— 고르세요 —'}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        {(firstError('exam') || firstError('anchor')) && (
          <span className="text-[13px] text-red sm:pl-[116px]">
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
          <div className="grid gap-x-7 gap-y-2 lg:grid-cols-2">
            <RatioHead />
            <RatioHead className="hidden lg:grid" />

            {plan.exams.map((e) => (
              <RatioRow
                key={`x${e.no}`}
                label={`${e.no}회 정기시험`}
                ratio={examRatioOf(plan, e.no)}
                short={pointsOf(e, '단답형')}
                essay={pointsOf(e, '서술형')}
                onRatio={(v) => setExamRatio(e.no, v)}
                onShort={(v) => setExamPoints(e.no, '단답형', v)}
                onEssay={(v) => setExamPoints(e.no, '서술형', v)}
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
                onRemove={() => askRemovePerf(p)}
              />
            ))}
          </div>

          <div className="flex flex-wrap items-baseline gap-x-5 border-t border-line-input pt-3 text-[13px]">
            <span className={ratioSum === 100 ? 'text-ink-2' : 'font-semibold text-amber'}>
              반영 합계 {ratioSum}%{ratioSum !== 100 && (ratioSum < 100 ? ' · 모자람' : ' · 넘침')}
            </span>
            {/* 1단위·수행 80%↑ 과목은 서논술 하한 자체가 면제라 빨간 경고를 띄우지 않는다 */}
            <span
              className={
                essay < school.rules.essay_min && !essayExempt(plan)
                  ? 'font-semibold text-red'
                  : 'font-semibold text-navy'
              }
            >
              서논술 {essay}% / {school.rules.essay_min}%
              {essayExempt(plan) && <span className="ml-1 font-normal text-ink-3">(면제)</span>}
            </span>
            <span className="text-ink-2">
              지필 {essay - perfEssayTotal(plan)}% + 수행 {perfEssayTotal(plan)}%
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
        {plan.performances.length === 0
          ? null
          : plan.performances.map((p) => (
              <PerfCard key={p.id} perfId={p.id} weeks={teachWeeks} subject={subject} />
            ))}
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

      {/* 비율 조정에서 지울 때 — 내용이 든 것만 한 번 묻는다 */}
      {confirmPerfId && (
        <ConfirmDialog
          title={`‘${
            plan.performances.find((p) => p.id === confirmPerfId)?.name || '이름 없는 수행평가'
          }’를 지울까요?`}
          detail="내용과 성취기준, 루브릭까지 함께 사라집니다. 되돌릴 수 없습니다."
          onConfirm={() => {
            removePerf(confirmPerfId)
            setConfirmPerfId(null)
          }}
          onClose={() => setConfirmPerfId(null)}
        />
      )}
    </Screen>
  )
}

/* ── 비율 조정 한 줄 ──────────────────────────── */

const RATIO_COLS = 'grid grid-cols-[minmax(0,1fr)_66px_62px_66px] items-center gap-2'

/**
 * 칸에 맞게 글자를 줄여 다 보이게 한다.
 *
 * 수행평가 이름은 길이가 제각각이라 잘라내면 무슨 평가인지 알 수 없다.
 * CSS만으로는 '길이에 맞춰 줄이기'가 안 되므로 실제로 재서 줄인다.
 * 최소 크기까지 줄여도 안 들어가면 그때만 말줄임표로 넘긴다.
 */
function FitText({
  text,
  muted,
  max = 14,
  min = 10,
}: {
  text: string
  /** 아직 이름을 안 쓴 자리 */
  muted?: boolean
  max?: number
  min?: number
}) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const fit = () => {
      let size = max
      el.style.fontSize = `${size}px`
      while (size > min && el.scrollWidth > el.clientWidth + 0.5) {
        size -= 0.5
        el.style.fontSize = `${size}px`
      }
    }
    fit()
    // 칸 너비가 바뀌면 다시 잰다. 자기 자신이 아니라 부모를 봐야 되먹임이 없다.
    const box = el.parentElement
    if (!box) return
    const ro = new ResizeObserver(fit)
    ro.observe(box)
    return () => ro.disconnect()
  }, [text, max, min])

  return (
    <span
      ref={ref}
      className={`block truncate leading-snug ${muted ? 'text-ink-3' : ''}`}
      title={text}
    >
      {text}
    </span>
  )
}

function RatioHead({ className = '' }: { className?: string }) {
  return (
    // 머리 줄 아래 가는 선 — 이름표와 값이 한 덩어리로 뭉쳐 보이지 않게
    <div className={`${RATIO_COLS} border-b border-line-input px-1 pb-2 ${className}`}>
      <span className="label">항목</span>
      <span className="label text-center">반영 비율</span>
      {/* 정기시험은 시험지 100점을 어떻게 나눌지다 — 선택형은 나머지라 칸이 없다 */}
      <span className="label text-center">단답</span>
      <span className="label text-center font-semibold text-navy">서·논술</span>
    </div>
  )
}

function RatioRow({
  label,
  placeholder,
  ratio,
  short,
  essay,
  onRatio,
  onShort,
  onEssay,
  onRemove,
}: {
  label: string
  /** 이름을 아직 안 쓴 수행평가에 붙일 임시 이름 */
  placeholder?: string
  ratio: number
  /** 단답형 배점 — 정기시험에만 있다 */
  short?: number
  essay: number
  onRatio: (v: number) => void
  onShort?: (v: number) => void
  onEssay: (v: number) => void
  /** 지울 수 있는 줄이면 — 마우스를 올렸을 때만 × 가 뜬다 */
  onRemove?: () => void
}) {
  return (
    <div className={`${RATIO_COLS} group`}>
      <span className="flex min-w-0 items-center gap-1.5 pl-1">
        <span className="min-w-0 flex-1">
          <FitText text={label || placeholder || ''} muted={!label} />
        </span>
        {onRemove && (
          <button
            className="flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0 text-ink-4 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-hover hover:text-red focus-visible:opacity-100"
            onClick={onRemove}
            title="이 수행평가 지우기"
            aria-label="이 수행평가 지우기"
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 12 12"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" />
            </svg>
          </button>
        )}
      </span>
      <input
        className="control text-center"
        type="number"
        value={ratio}
        onChange={(e) => onRatio(Number(e.target.value) || 0)}
      />
      {onShort ? (
        <input
          className="control text-center"
          type="number"
          value={short ?? 0}
          onChange={(e) => onShort(Number(e.target.value) || 0)}
        />
      ) : (
        // 수행평가에는 단답형이 없다 — 칸을 비워 세로 줄만 맞춘다
        <span aria-hidden />
      )}
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
      <span className="inline-flex w-full max-w-[320px] items-center gap-2">
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
      <div className="grid grid-cols-1 items-start gap-3 pr-11 sm:grid-cols-[1.6fr_1fr_auto]">
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
