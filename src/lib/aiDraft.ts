/**
 * AI 초안 — 프롬프트 · 결정적 fallback · 입력 지문.
 *
 * 원칙: AI는 문장만 쓴다. 숫자(배점·비율·요소 수·주차)는 전부 코드가 정한다.
 * 키가 없거나 호출이 실패하면 결정적 대체 문구로 완결된다 — 파이프라인은 멈추지 않는다.
 *
 * 서버(/api/generate)와 스크립트에서만 쓴다. 프롬프트를 클라이언트에 내보내지 않는다.
 */

import { createHash } from 'node:crypto'
import type {
  AiDraft,
  Performance,
  RubricRow,
  SchoolLayer,
  SemesterPlan,
  Subject,
} from '@/types'
import { rubricFromChecks } from './autofill'
import { isContinued, weeksOf } from './derive'

export type GenerateStage = 'sections' | 'weekly' | 'perfs'
export const STAGES: GenerateStage[] = ['sections', 'weekly', 'perfs']

/* ── 입력 지문 ────────────────────────────────
   문안에 영향을 주는 입력만 담는다. 일치하면 재호출을 건너뛴다. */

export function inputHash(plan: SemesterPlan, subject: Subject): string {
  const src = JSON.stringify({
    subject: subject.name,
    grade: plan.grade,
    credit: plan.credit,
    semester: plan.semester,
    ratios: [plan.exam_ratio, plan.perf_ratio],
    units: subject.units.map((u) => [u.order, u.name, u.standard_codes]),
    distribution: plan.distribution,
    exams: plan.exams.map((e) => [e.no, e.week, e.anchor_code]),
    performances: plan.performances.map((p) => [
      p.id,
      p.name,
      p.week,
      p.ratio,
      p.intent ?? p.activity,
      p.method_checks,
    ]),
  })
  return createHash('sha256').update(src).digest('hex').slice(0, 16)
}

/* ── 결정적 fallback ─────────────────────────── */

export function fallbackSections(
  _plan: SemesterPlan,
  subject: Subject,
  school: SchoolLayer,
): AiDraft['sections'] {
  void school
  const split = (s: string) => s.split(/\n+/).map((x) => x.trim()).filter(Boolean)
  const n = subject.name
  return {
    II:
      split(subject.objectives).slice(0, 3).length > 0
        ? split(subject.objectives).slice(0, 3)
        : [
            `${n}의 핵심 개념과 원리를 이해하고 이를 설명하는 능력을 기르도록 한다.`,
            `${n}에서 다루는 문제를 탐구하고 근거를 들어 자신의 견해를 제시하는 능력을 기르도록 한다.`,
            `${n}의 학습 내용을 실생활 맥락에 적용하여 해결 방안을 모색하는 태도를 기르도록 한다.`,
          ],
    III1: [
      `${n} 교과 내용 요소에 대한 단순한 지식 습득 여부보다는 ${n}의 교과 역량 함양과 핵심 아이디어에 대한 이해를 중심으로 평가한다.`,
      `${n}에서 요구하는 탐구, 추론, 의사소통, 문제해결 등의 교과 역량을 평가한다.`,
      `${n}의 지식⋅이해, 과정⋅기능, 가치⋅태도의 모든 측면에서 학생들의 성장이 있었는지를 평가하도록 한다.`,
    ],
    semesterLevels:
      Object.keys(subject.semester_levels).length > 0
        ? subject.semester_levels
        : {
            A: `${n}의 핵심 개념을 정확히 설명하고, 학습한 내용을 새로운 상황에 적용하여 문제를 해결할 수 있다.`,
            B: `${n}의 핵심 개념을 설명하고, 학습한 내용을 활용하여 문제를 해결할 수 있다.`,
            C: `${n}의 핵심 개념을 이해하고, 기본적인 문제를 해결할 수 있다.`,
            D: `${n}의 핵심 개념을 부분적으로 이해하고, 안내된 절차에 따라 간단한 문제를 해결할 수 있다.`,
            E: `${n}의 핵심 개념을 안내에 따라 확인하고, 간단한 문제를 따라 해결할 수 있다.`,
          },
    minLevel:
      subject.min_level ??
      `${n}의 핵심 개념을 안내에 따라 확인하고, 학습한 내용을 간단한 사례에 연결할 수 있다.`,
  }
}

/**
 * 주안점 한 칸의 형식 — 양식 예시와 같은 4줄.
 *   [수업방법]
 *   -활동 하나
 *   -활동 둘
 *   [평가유형] 그 차시의 평가 내용
 */
/**
 * 성취기준 문장을 활동 문구로 바꾼다.
 * "…을 이해하고, …을 탐구할 수 있다." → ["…을 이해하기", "…을 탐구하기"]
 *
 * 어미만 갈아끼우고 못 바꾸면 원문을 그대로 쓴다.
 * 어차피 문서에서 빨간 글씨라 교사가 손보는 자리다.
 */
export function activityClauses(text: string): string[] {
  const body = text.trim().replace(/\s*\.$/, '')
  if (!body) return []
  return body
    .split(/,\s*/)
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) =>
      c
        .replace(/할 수 있다$/, '하기')
        .replace(/될 수 있다$/, '되기')
        .replace(/한다$/, '하기')
        .replace(/된다$/, '되기')
        .replace(/(하|되)(고|며|여|어)$/, '$1기'),
    )
}

export function fallbackWeekly(
  plan: SemesterPlan,
  subject: Subject,
  school: SchoolLayer,
): AiDraft['weekly'] {
  const stdByCode = new Map(subject.standards.map((s) => [s.code, s]))
  const out: AiDraft['weekly'] = {}
  const rotate = ['[강의식, 모둠협력수업]', '[문제해결학습, 모둠협력수업]', '[탐구학습, 발표활동]']
  const evals = [
    '[관찰평가] 모둠 활동 참여와 발언 내용을 중심으로 관찰 평가',
    '[형성평가] 핵심 개념 확인 퀴즈 활동',
    '[동료평가, 관찰평가] 경청과 공감적 반응 태도를 성찰하는 체크리스트 작성',
  ]
  let i = 0
  for (const w of weeksOf(school, plan.semester)) {
    if (w.is_exam) continue
    const codes = plan.distribution[w.no] ?? []

    // 성취기준이 없는 주 — 복습·보충으로 채운다 (빈 칸으로 두지 않는다)
    if (codes.length === 0) {
      out[w.no] = ['[문제해결학습]', '-앞 차시 내용 복습하기', '-미도달 학생 보충 지도하기']
      continue
    }

    const lines: string[] = [rotate[i % rotate.length]]
    for (const code of codes) {
      const std = stdByCode.get(code)
      const clauses = std?.text ? activityClauses(std.text) : []
      if (clauses.length === 0) {
        lines.push(`-${code} 관련 내용 다루기`)
        continue
      }
      // 두 주에 걸친 성취기준이면 뒷주에는 뒷절을 쓴다 — 같은 문장이 반복되지 않게
      const cont = isContinued(plan.distribution, w.no, code)
      const pick = cont ? clauses.slice(1) : clauses.slice(0, 2)
      for (const c of (pick.length > 0 ? pick : clauses).slice(0, 2)) lines.push(`-${c}`)
    }
    lines.push(evals[i % evals.length])
    out[w.no] = lines
    i++
  }
  return out
}

/**
 * 수행평가가 잡힌 주에 넣는 줄 — 양식 메모(memo36·37)가 요구하는 형식.
 *
 *   실시: `[수행평가(수행평가명)] 간단설명`
 *   안내: `[수행평가(수행평가명) 추정분할점수 공지]`
 *
 * 간단설명은 실시 의도의 첫 절을 활동 문구로 바꿔 쓴다. 없으면 방법으로 떨어진다.
 */
export function perfNoteLine(
  perf: Pick<Performance, 'name' | 'method' | 'intent' | 'activity'>,
  kind: '실시' | '안내',
  splitType: SemesterPlan['split_score_type'] = '추정',
): string {
  if (kind === '안내') {
    return `[수행평가(${perf.name}) ${splitType}분할점수 공지]`
  }
  const source = (perf.intent ?? perf.activity ?? '').trim()
  const brief = source ? (activityClauses(source)[0] ?? source) : ''
  const tail = brief.length > 0 ? brief.slice(0, 40) : `${perf.method} 평가 실시`
  return `[수행평가(${perf.name})] ${tail}`
}

export function fallbackPerf(perf: Performance): { activity: string; rubric: RubricRow[] } {
  return {
    activity: perf.activity || perf.intent || `${perf.name} 수행 활동을 실시한다.`,
    rubric:
      perf.rubric.length > 0 ? perf.rubric : rubricFromChecks(perf.method_checks, perf.max_score),
  }
}

/* ── 프롬프트 ─────────────────────────────────
   출력은 전부 JSON으로 강제한다. 파싱 실패분은 fallback으로 메운다. */

const TONE =
  '고등학교 학업성적관리 계획서의 문체로 쓴다: 평서형 종결(~한다), 과장 없이 담백하게. ' +
  '숫자·배점·비율은 절대 새로 정하지 말고 주어진 값을 그대로 쓴다. 지어낸 성취기준을 넣지 않는다.'

export function sectionsPrompt(plan: SemesterPlan, subject: Subject): {
  system: string
  user: string
} {
  const grades = subject.scale_type === 'LVL_3' ? 'A, B, C' : 'A, B, C, D, E'
  return {
    system:
      `${TONE} 양식에서 빨간 글씨로 표시된 '교사가 채울 곳'만 쓴다. ` +
      `JSON 하나만 출력한다: ` +
      `{"II": string[], "III1": string[], "semesterLevels": {"A": string, ...}, "minLevel": string}. ` +
      `각 문장은 완성형이고 번호(가·나·다)를 붙이지 않는다 — 코드가 붙인다.`,
    user: [
      `과목: ${subject.name} (${plan.grade}학년, ${plan.credit}학점) · 지도교사 ${Math.max(1, plan.teachers.length)}인`,
      `영역: ${subject.areas.map((a) => a.name).join(', ') || '(없음)'}`,
      '',
      'II = 평가의 목적 가·나·다에 해당하는 3문장. 과목 목표에서 나오는 내용. 각 문장은 "~ 능력을 기르도록 한다." 로 끝난다.',
      'III1 = 평가의 기본 방향 가·다·라에 해당하는 3문장. 순서대로',
      `  1) "${subject.name} 교과 내용 요소에 대한 단순한 지식 습득 여부보다는 …" 로 시작하는 문장`,
      '  2) 이 교과의 핵심 역량을 나열하고 그것을 평가한다는 문장',
      `  3) "${subject.name}의 지식⋅이해, 과정⋅기능, 가치⋅태도의 모든 측면에서 …" 로 시작하는 문장`,
      `semesterLevels = 학기단위 성취수준 ${grades}. 상위 수준일수록 수행의 폭과 자립도가 커지게 구분되어야 한다.`,
      'minLevel = 최소 성취수준. 한 학기가 끝났을 때 최소한으로 도달하기를 기대하는 정도를 한 문장으로.',
    ].join('\n'),
  }
}

export function weeklyPrompt(
  plan: SemesterPlan,
  subject: Subject,
  school: SchoolLayer,
): { system: string; user: string } {
  const stdByCode = new Map(subject.standards.map((s) => [s.code, s]))
  const areaOf = (code: string) => {
    const no = subject.standards.find((s) => s.code === code)?.area_no
    return subject.areas.find((a) => a.no === no)?.name ?? ''
  }
  const weeks = weeksOf(school, plan.semester)
    .filter((w) => !w.is_exam && (plan.distribution[w.no] ?? []).length > 0)
    .map((w) => {
      const codes = plan.distribution[w.no] ?? []
      const stds = codes
        .map((c) => {
          const cont = isContinued(plan.distribution, w.no, c) ? ' (전주에서 이어짐)' : ''
          return `${c} ${stdByCode.get(c)?.text ?? ''}${cont}`.trim()
        })
        .join(' / ')
      const areas = [...new Set(codes.map(areaOf).filter(Boolean))].join(', ')
      return `${w.no}주: 영역 [${areas || '—'}] 성취기준 [${stds || '없음'}]`
    })
  return {
    system:
      `${TONE} 진도표의 '수업 방법 및 수업·평가 연계의 주안점' 칸을 쓴다. ` +
      `JSON 하나만 출력한다: {"weekly": {"주차번호": string[]}}. ` +
      `각 주는 정확히 4줄이다:\n` +
      `  1줄: 대괄호로 수업 방법 — 강의식 · 모둠협력수업 · 문제해결학습 · 발표활동 · 탐구학습 중 1~3개. 예 "[강의식, 모둠협력수업]"\n` +
      `  2·3줄: "-"로 시작하는 그 주 활동 두 개. 성취기준에서 곧바로 나오는 활동만.\n` +
      `  4줄: 대괄호로 평가 유형 뒤에 그 차시 평가 내용 — 관찰평가 · 형성평가 · 자기평가 · 동료평가 중. 예 "[형성평가] 동서양 윤리 확인 퀴즈 활동"\n` +
      `분량은 예시와 같은 정도로 맞춘다:\n` +
      `[강의식, 모둠협력수업]\n-이론 윤리학, 실천 윤리학, 메타윤리학의 성격과 특징 파악하기\n-인간 본성에 대한 다양한 관점 분석하기\n[관찰평가] 윤리적 딜레마 속 도덕적 행동의 정당화와 관련된 토의활동 및 관찰 평가\n` +
      `그 주 성취기준에 없는 내용을 넣지 않는다. 수행평가 문구는 코드가 따로 붙이니 쓰지 않는다.\n` +
      `'(전주에서 이어짐)'으로 표시된 성취기준은 앞 주와 다른 활동을 써서 같은 문장이 반복되지 않게 한다.`,
    user: `과목: ${subject.name}\n\n${weeks.join('\n')}`,
  }
}

export function perfsPrompt(plan: SemesterPlan, subject: Subject): {
  system: string
  user: string
} {
  const stdByCode = new Map(subject.standards.map((s) => [s.code, s]))
  const items = plan.performances.map((p) => {
    // 구조(요소·배점)는 코드가 정한다 — AI에는 뼈대를 주고 문장만 받는다
    const skeleton = p.rubric.length > 0 ? p.rubric : rubricFromChecks(p.method_checks, p.max_score)
    return {
      id: p.id,
      name: p.name,
      intent: p.intent ?? p.activity,
      standards: p.standard_codes.map((c) => `${c} ${stdByCode.get(c)?.text ?? ''}`.trim()),
      elements: skeleton.map((r) => ({
        element: r.element,
        scores: r.levels.map((l) => l.score),
      })),
    }
  })
  return {
    system:
      `${TONE} 수행평가의 '수행 활동 과정'과 루브릭 채점 기준 서술을 쓴다. ` +
      `JSON 하나만 출력한다: {"perfs": {"<id>": {"activity": string, "rubric": [{"element": string, "texts": string[]}]}}}. ` +
      `rubric은 준 뼈대의 요소 순서·개수를 그대로 따르고, texts는 배점 순서대로(높은 점수부터) 기준 서술 문장이다. ` +
      `배점 사이에 관찰 가능한 수행 차이가 드러나야 한다. 요소명과 배점을 바꾸지 않는다.`,
    user: JSON.stringify(items, null, 2),
  }
}

/* ── AI 응답 → AiDraft 조각 (검증 포함) ──────── */

const asLines = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : []

export function parseSections(
  raw: unknown,
  fb: AiDraft['sections'],
): { value: AiDraft['sections']; usedFallback: boolean } {
  const o = (raw ?? {}) as Record<string, unknown>
  let miss = 0
  const pick = (k: string, f: string[]) => {
    const lines = asLines(o[k])
    if (lines.length === 0) {
      miss++
      return f
    }
    return lines
  }
  const lv = (o.semesterLevels ?? {}) as Record<string, unknown>
  const levels: AiDraft['sections']['semesterLevels'] = {}
  for (const g of ['A', 'B', 'C', 'D', 'E'] as const) {
    const v = typeof lv[g] === 'string' ? (lv[g] as string).trim() : ''
    if (v) levels[g] = v
    else if (fb.semesterLevels[g]) {
      levels[g] = fb.semesterLevels[g]
      miss++
    }
  }
  const minLevel =
    typeof o.minLevel === 'string' && o.minLevel.trim() ? o.minLevel.trim() : fb.minLevel

  return {
    value: {
      II: pick('II', fb.II),
      III1: pick('III1', fb.III1),
      semesterLevels: levels,
      minLevel,
    },
    usedFallback: miss > 0,
  }
}

export function parseWeekly(
  raw: unknown,
  fb: AiDraft['weekly'],
): { value: AiDraft['weekly']; usedFallback: boolean } {
  const o = ((raw ?? {}) as { weekly?: Record<string, unknown> }).weekly ?? {}
  const value: AiDraft['weekly'] = {}
  let missing = 0
  for (const key of Object.keys(fb)) {
    const lines = asLines(o[key])
    if (lines.length > 0) value[Number(key)] = lines
    else {
      value[Number(key)] = fb[Number(key)]
      missing++
    }
  }
  return { value, usedFallback: missing > 0 }
}

export function parsePerfs(
  raw: unknown,
  plan: SemesterPlan,
): { value: AiDraft['perfs']; usedFallback: boolean } {
  const o = ((raw ?? {}) as { perfs?: Record<string, unknown> }).perfs ?? {}
  const value: AiDraft['perfs'] = {}
  let anyFallback = false

  for (const p of plan.performances) {
    const fb = fallbackPerf(p)
    const skeleton = fb.rubric
    const got = o[p.id] as
      | { activity?: unknown; rubric?: { element?: unknown; texts?: unknown }[] }
      | undefined

    const activity =
      typeof got?.activity === 'string' && got.activity.trim() !== '' ? got.activity : fb.activity
    if (activity === fb.activity && !p.activity) anyFallback = true

    // 뼈대(요소·배점)는 코드 것을 쓰고 AI는 text만 갈아끼운다. 행 단위로 실패를 메운다.
    const rubric: RubricRow[] = skeleton.map((row, i) => {
      const texts = asLines(got?.rubric?.[i]?.texts)
      if (texts.length !== row.levels.length) {
        anyFallback = true
        return row
      }
      return { ...row, levels: row.levels.map((lv, k) => ({ ...lv, text: texts[k] })) }
    })

    value[p.id] = { activity, rubric }
  }
  return { value, usedFallback: anyFallback }
}

/** 모델 응답 본문에서 JSON을 꺼낸다 — 코드펜스·앞뒤 잡담을 견딘다 */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text)
  const body = fenced ? fenced[1] : text
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(body.slice(start, end + 1))
  } catch {
    return null
  }
}
