/**
 * 간단 작성 — 6가지 입력에서 나머지를 채운다.
 *
 * 지금은 결정적 규칙으로 채운다. '실시 의도' 문장의 낱말에서 평가 방법을 잡고,
 * 진도 배분에서 그 주에 다루는 성취기준을 가져오고, 루브릭 배점은 영역 만점에 맞춰 나눈다.
 * 모델 호출로 바꾸려면 이 파일만 교체하면 된다.
 */

import type {
  PerfMethodCheck,
  Performance,
  RubricRow,
  SchoolLayer,
  SemesterPlan,
  Subject,
} from '@/types'
import {
  calendarOf,
  distributeStandards,
  essayExempt,
  essayTotal,
  parseDate,
  perfWindow,
  spread,
  teachingWeeks,
  weeksOf,
} from './derive'

/** '5월 20일' 또는 '2026-05-20' → 그 날짜가 든 주차 번호 */
export function weekFromDate(school: SchoolLayer, semester: 1 | 2, input: string): number | null {
  const iso = input.match(/(\d{4})-(\d{2})-(\d{2})/)
  const ko = input.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/)
  let target: Date | null = null
  if (iso) target = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
  else if (ko)
    target = new Date(calendarOf(school, semester).year, Number(ko[1]) - 1, Number(ko[2]))
  if (!target) return null

  for (const w of weeksOf(school, semester)) {
    if (parseDate(w.start) <= target && target <= parseDate(w.end)) return w.no
  }
  return null
}

const METHOD_HINTS: { re: RegExp; check: PerfMethodCheck; method: string }[] = [
  { re: /토론|토의|쟁점|찬반|입장/, check: '토의·토론', method: '토의·토론형' },
  { re: /발표|말하|구술|설명하게/, check: '구술·발표', method: '구술·발표형' },
  { re: /실험|실습|제작|만들/, check: '실험·실습', method: '실험·실습형' },
  { re: /포트폴리오|누적|모아/, check: '포트폴리오', method: '포트폴리오형' },
  { re: /조사|자료를? 찾|탐구|분석/, check: '프로젝트', method: '프로젝트형' },
  { re: /글|쓰|서술|논술|보고|작성/, check: '서술·논술', method: '논술형' },
]

export function methodsFromIntent(intent: string): {
  checks: PerfMethodCheck[]
  method: string
} {
  const hits = METHOD_HINTS.filter((h) => h.re.test(intent))
  if (hits.length === 0) return { checks: ['서술·논술'], method: '논술형' }
  return { checks: [...new Set(hits.map((h) => h.check))], method: hits[0].method }
}

/** 배점을 요소 수만큼 나눈다. 합이 정확히 max가 되도록 앞쪽부터 나머지를 얹는다. */
export function splitScore(max: number, parts: number): number[] {
  if (parts <= 0) return []
  const base = Math.floor(max / parts)
  const rem = max - base * parts
  return Array.from({ length: parts }, (_, i) => base + (i < rem ? 1 : 0))
}

/**
 * 수행평가 비율을 영역 수만큼 나누되 한 영역이 상한(기본 35%)을 넘지 않게 한다.
 *
 * 상한 때문에 다 담지 못하면 영역 수를 늘려야 한다 — 몇 개가 필요한지도 함께 돌려준다.
 * (검증 규칙 2가 '수행평가 한 영역 ≤ 35%'를 요구한다)
 */
export function splitPerfRatios(
  total: number,
  count: number,
  areaMax: number,
): { ratios: number[]; needed: number } {
  const needed = Math.max(1, count, Math.ceil(total / Math.max(1, areaMax)))
  return { ratios: allocatePerfRatios(total, needed, areaMax), needed }
}

/**
 * 수행평가 반영 비율을 개수대로 나눈다.
 *
 * 학교 문서는 비율을 **10% 단위**로 적는다. 그래서 그냥 등분하면
 * 40%를 셋으로 나눈 13.3% 같은 숫자가 나와 실제로 쓰지 않는 값이 된다.
 * 10 단위로 내려 깔고 남는 몫을 앞에서부터 10씩 얹는다.
 *
 *   40% · 1개 → 40
 *   40% · 2개 → 20 20
 *   40% · 3개 → 20 10 10
 *  100% · 3개 → 40 30 30   (한 영역 상한이 걸리면 35 35 30 으로 눌린다)
 *
 * 상한(perf_area_max)을 넘는 몫은 다음 영역으로 넘긴다 — 버리면 합이 모자란다.
 */
export function allocatePerfRatios(total: number, count: number, areaMax: number): number[] {
  const n = Math.max(1, count)
  if (total <= 0) return Array(n).fill(0)

  const STEP = 10
  const base = Math.floor(total / n / STEP) * STEP

  // 10씩 나눌 수 없을 만큼 잘게 쪼개야 하면(예: 40%를 5개로) 그냥 고르게 나눈다
  if (base === 0) return splitScore(total, n)

  const out: number[] = Array(n).fill(base)
  // 남는 몫은 앞에서부터 10씩 얹는다
  let rest = total - base * n
  for (let i = 0; i < n && rest > 0; i++) {
    const add = Math.min(STEP, rest)
    out[i] += add
    rest -= add
  }

  // 상한을 넘은 몫은 여유 있는 영역으로 흘려보낸다
  for (let i = 0; i < n; i++) {
    if (out[i] <= areaMax) continue
    let over = out[i] - areaMax
    out[i] = areaMax
    for (let j = 0; j < n && over > 0; j++) {
      if (j === i) continue
      // 이미 상한을 넘은 칸은 여유가 없다 — 음수가 되면 오히려 빼앗아 간다
      const room = Math.max(0, areaMax - out[j])
      const give = Math.min(room, over)
      out[j] += give
      over -= give
    }
    // 옮길 자리가 없으면 상한보다 합계를 지킨다 — 모자란 합은 규칙 검사에서 잡는다
    out[i] += over
  }
  return out
}

const ELEMENT_BY_CHECK: Record<
  PerfMethodCheck,
  { area: string; element: string; verbs: [string, string, string] }
> = {
  '서술·논술': {
    area: '표현',
    element: '근거 들어 쓰기',
    verbs: [
      '주장마다 근거를 들어 분명하게 씀',
      '일부 주장에만 근거를 붙여 씀',
      '근거 없이 주장만 나열함',
    ],
  },
  '구술·발표': {
    area: '표현',
    element: '발표하기',
    verbs: [
      '핵심을 정리해 듣는 사람이 이해하도록 말함',
      '내용은 전달되나 정리가 느슨함',
      '원고를 읽는 수준에 머무름',
    ],
  },
  '토의·토론': {
    area: '참여',
    element: '토론 참여하기',
    verbs: [
      '상대 주장을 듣고 근거를 들어 반박함',
      '자기 주장은 말하나 상대 주장에 대한 반응이 적음',
      '발언이 거의 없음',
    ],
  },
  프로젝트: {
    area: '탐구',
    element: '자료 해석하기',
    verbs: [
      '자료의 핵심을 정확히 해석하고 근거를 들어 설명함',
      '자료를 해석하였으나 근거 제시가 부분적임',
      '자료를 단순히 옮겨 적는 수준에 머무름',
    ],
  },
  '실험·실습': {
    area: '수행',
    element: '절차 수행하기',
    verbs: [
      '절차를 정확히 지키고 결과를 기록함',
      '절차는 지켰으나 기록이 부분적임',
      '절차 수행에 도움이 필요함',
    ],
  },
  포트폴리오: {
    area: '누적',
    element: '기록 관리하기',
    verbs: [
      '모든 차시의 결과물을 빠짐없이 정리함',
      '일부 차시의 결과물이 빠짐',
      '결과물이 대부분 빠짐',
    ],
  },
  기타: {
    area: '수행',
    element: '과제 수행하기',
    verbs: ['요구한 내용을 모두 수행함', '요구한 내용을 부분적으로 수행함', '수행이 미흡함'],
  },
}

export function rubricFromChecks(checks: PerfMethodCheck[], maxScore: number): RubricRow[] {
  const list = checks.length > 0 ? checks : (['기타'] as PerfMethodCheck[])
  const scores = splitScore(maxScore, list.length)
  return list.map((c, i) => {
    const t = ELEMENT_BY_CHECK[c]
    const top = scores[i]
    const mid = Math.max(1, Math.round(top * 0.6 * 2) / 2)
    const low = Math.max(0.5, Math.round(top * 0.3 * 2) / 2)
    return {
      id: `r-${i}-${c}`,
      area: t.area,
      element: t.element,
      levels: [
        { score: top, text: t.verbs[0] },
        { score: mid, text: t.verbs[1] },
        { score: low, text: t.verbs[2] },
      ],
    }
  })
}

export interface SimpleInput {
  /** 실시 날짜 (자유 입력 — week가 없을 때만 해석) */
  date: string
  /** 실시 주차 — 월주 select에서 고르면 여기로 들어온다 */
  week?: number | null
  /** 수행평가명 */
  name: string
  /** 실시 의도 */
  intent: string
}

/**
 * 실시 주차를 고른다. 검증 규칙 15·19를 처음부터 통과하도록 자리를 잡는다.
 *  - 정기시험 주가 아니고 수업이 있는 주
 *  - 실시 창 안 — 학기 시작 4주 뒤 ~ 마지막 정기시험 주 전 (규칙 19)
 *  - 이미 다른 수행평가가 잡힌 주가 아님 (겹치면 학생 부담이라 피한다)
 *  - 안내 주(실시 − 2주)도 수업 주여야 함 (규칙 15)
 */
function pickWeek(
  school: SchoolLayer,
  plan: SemesterPlan,
  wanted: number | null,
  taken: Set<number>,
): number {
  const lead = school.rules.notice_lead_weeks
  const weeks = weeksOf(school, plan.semester)
  // 검증(규칙 19)과 같은 자를 쓴다 — 자동으로 놓은 자리가 검증에 걸리면 안 된다
  const win = perfWindow(school, plan.semester)
  const lower = Math.max(win.from, lead + 1)
  const limit = win.to
  const teaching = new Set(teachingWeeks(weeks).map((w) => w.no))

  const usable = (n: number) =>
    n >= lower && n <= limit && teaching.has(n) && teaching.has(n - lead) && !taken.has(n)

  if (wanted && usable(wanted)) return wanted

  // 원하는 주에서 가까운 순서로 옮긴다
  const base = wanted ?? Math.floor(limit / 2)
  for (let d = 1; d <= weeks.length; d++) {
    if (usable(base - d)) return base - d
    if (usable(base + d)) return base + d
  }
  return wanted ?? base
}

/**
 * 자동 성취기준 선정 — 실시 주까지 다룬 성취기준 중 마지막 몇 개(배분이 이미 진도 순서다).
 * buildPerformance와, 실시 주차가 바뀔 때의 재동기화(store.patchPerf)가 같은 답을 내야 한다.
 */
export function autoStandardCodes(
  distribution: SemesterPlan['distribution'],
  week: number,
  maxCodes: number,
): string[] {
  const taught = Object.entries(distribution)
    .filter(([wk]) => Number(wk) <= week)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .flatMap(([, codes]) => codes)
  return [...new Set(taught)].slice(-Math.min(3, maxCodes))
}

/**
 * 수행평가 하나를 결정적 규칙으로 완성한다 — 간단·심화 공용.
 *
 * 입력: 명칭 · 실시 주차(또는 희망 주차) · 실시 의도 · 반영 비율.
 * 나머지(방법·만점·기본점수·성취기준·루브릭 뼈대)는 전부 여기서 계산한다.
 * 루브릭 UI 없이도 규칙 4~7이 통과하는 상태로 나온다.
 */
export function buildPerformance(args: {
  id: string
  name: string
  intent: string
  ratio: number
  week: number
  school: SchoolLayer
  distribution: SemesterPlan['distribution']
  /** 교사가 직접 고른 성취기준 — 주면 자동 선정을 하지 않는다 */
  standardCodes?: string[] | null
  /** 교사가 직접 정한 서술·논술 비율 */
  essayRatio?: number | null
}): Performance {
  const { id, name, intent, ratio, week, school, distribution } = args
  const { checks, method } = methodsFromIntent(intent)

  const auto = autoStandardCodes(distribution, week, school.rules.standards_per_perf_max)
  const manual = args.standardCodes && args.standardCodes.length > 0

  return {
    id,
    name,
    method,
    ratio,
    max_score: ratio, // 규칙 6
    // 규칙 4·5 — 만점의 20% 이상 40% 미만, 1점 초과. 프롬프트가 정한 기본은 30%.
    base_score: Math.max(2, Math.round(ratio * 0.3)),
    week,
    standard_codes: manual
      ? args.standardCodes!.slice(0, school.rules.standards_per_perf_max)
      : auto,
    standards_manual: manual || undefined,
    essay_ratio: args.essayRatio ?? undefined,
    method_checks: checks,
    activity: intent,
    rubric: rubricFromChecks(checks, ratio), // 규칙 7 — 합이 만점과 같다
    intent,
  }
}

/** 간단 입력 → 학기 레이어 전체 */
export function autofill(
  plan: SemesterPlan,
  subject: Subject,
  school: SchoolLayer,
  inputs: SimpleInput[],
): SemesterPlan {
  const distribution = distributeStandards(subject, weeksOf(school, plan.semester), plan.exams)

  const n = Math.max(1, inputs.length)
  const ratios = splitScore(plan.perf_ratio, n)
  const taken = new Set<number>()

  const performances: Performance[] = inputs.map((input, i) => {
    const wanted = input.week ?? weekFromDate(school, plan.semester, input.date)
    const week = pickWeek(school, plan, wanted, taken)
    taken.add(week)
    return buildPerformance({
      id: `perf-auto-${i + 1}`,
      name: input.name,
      intent: input.intent,
      ratio: ratios[i],
      week,
      school,
      distribution,
    })
  })

  // 규칙 3 — 서술·논술 합계가 하한에 못 미치면 가장 큰 영역에 서술·논술을 더한다.
  // 면제 대상(1단위·수행 80%↑)에게는 강제하지 않는다 — 검증도 안 보는 값이다.
  const draft = { ...plan, distribution, performances }
  if (!essayExempt(plan) && essayTotal(draft, plan.exam_ratio) < school.rules.essay_min) {
    const biggest = [...performances].sort((a, b) => b.ratio - a.ratio)[0]
    if (biggest && !biggest.method_checks.includes('서술·논술')) {
      biggest.method_checks = ['서술·논술', ...biggest.method_checks]
      biggest.rubric = rubricFromChecks(biggest.method_checks, biggest.max_score)
    }
  }

  return { ...draft, updated_at: new Date().toISOString() }
}

export { spread }
