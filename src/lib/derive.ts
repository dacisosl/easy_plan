/**
 * 4. 파생값 — 절대 저장하지 않는다. 필요할 때 계산한다.
 *
 * 이 파일의 함수는 전부 순수 함수다. 저장소에 쓰지 말 것.
 */

import type {
  AcademicCalendar,
  AchievementTable,
  AchievementTableId,
  ISODate,
  Performance,
  SchoolLayer,
  SchoolRules,
  SemesterPlan,
  Sentence,
  Subject,
  Week,
} from '@/types'

/* ── 날짜 ─────────────────────────────────────── */

export function parseDate(iso: ISODate): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** 진도표 기간 표시. `weeks[].label`은 저장하지 않고 여기서 만든다. → "3.3.–3.6." */
export function periodLabel(w: Week): string {
  const s = parseDate(w.start)
  const e = parseDate(w.end)
  return `${s.getMonth() + 1}.${s.getDate()}.–${e.getMonth() + 1}.${e.getDate()}.`
}

/* ── 4-1. 월 기준 주차 ────────────────────────── */

/**
 * 확정 규칙: 시작일이 속한 달로 귀속하고, 그 달에서 시작하는 주 중 몇 번째인지 센다.
 * 달을 걸친 주는 시작일 쪽 달에만 속한다. (3.30~4.3 → 3월 5주)
 * 주차 ↔ 라벨이 1:1이라 역변환이 가능하다.
 */
export function monthWeekByStart(weeks: Week[], no: number): string {
  const w = weeks.find((x) => x.no === no)
  if (!w) return ''
  const month = parseDate(w.start).getMonth() + 1
  const sameMonth = weeks.filter((x) => parseDate(x.start).getMonth() + 1 === month)
  const n = sameMonth.findIndex((x) => x.no === no) + 1
  return `${month}월 ${n}주`
}

/**
 * 배포된 양식 예시 방식: 그 달 1일이 낀 주를 그 달 1주로 두고 센다.
 * 귀속 달은 확정 규칙과 같게 시작일 기준. 번호만 한 주씩 밀린다.
 * (9주 4.27~5.1 → 확정 4월 4주 / 예시 4월 5주. 6월만 우연히 일치.)
 */
export function monthWeekByFormExample(weeks: Week[], no: number): string {
  const idx = weeks.findIndex((x) => x.no === no)
  if (idx < 0) return ''
  const month = parseDate(weeks[idx].start).getMonth() + 1

  // 그 달 1일을 품은 주 = 그 달 1주
  const anchorIdx = weeks.findIndex((x) => {
    const s = parseDate(x.start)
    const e = parseDate(x.end)
    const first = new Date(s.getFullYear(), month - 1, 1)
    return s <= first && first <= e
  })
  // 1일이 학사일정 밖이면(개학 전 등) 그 달에 처음 시작하는 주를 1주로 본다
  const base =
    anchorIdx >= 0 ? anchorIdx : weeks.findIndex((x) => parseDate(x.start).getMonth() + 1 === month)

  return `${month}월 ${idx - base + 1}주`
}

/**
 * 그 주의 목요일. 주 시작일이 낀 달력 주(월~일)의 목요일이라, 학기 마지막 주가
 * 화요일에 끝나도(7/20~21) 같은 달력 주의 목요일(7/23)로 셈한다 — 라벨 공백이 안 생긴다.
 */
function thursdayOf(w: Week): Date {
  const s = parseDate(w.start)
  const d = new Date(s)
  d.setDate(s.getDate() + ((4 - s.getDay() + 7) % 7)) // getDay(): 목요일 = 4
  return d
}

/**
 * 학교 확정 규칙: 목요일이 속한 달로 귀속하고, 그 달에 목요일이 있는 주 중 몇 번째인지 센다.
 * (6/29~7/3 → 목요일 7/2 → 7월 1주. 시작일 기준으로는 6월 5주였다.)
 */
export function monthWeekByThursday(weeks: Week[], no: number): string {
  const w = weeks.find((x) => x.no === no)
  if (!w) return ''
  const month = thursdayOf(w).getMonth() + 1
  const sameMonth = weeks.filter((x) => thursdayOf(x).getMonth() + 1 === month)
  const n = sameMonth.findIndex((x) => x.no === no) + 1
  return `${month}월 ${n}주`
}

export function monthWeekLabel(school: SchoolLayer, semester: 1 | 2, no: number): string {
  const weeks = weeksOf(school, semester)
  switch (school.rules.month_week_rule) {
    case 'form_example':
      return monthWeekByFormExample(weeks, no)
    case 'start':
      return monthWeekByStart(weeks, no)
    default:
      return monthWeekByThursday(weeks, no)
  }
}

/**
 * "3월 5주" → 주차 번호. 라벨 규칙이 1:1이라 전 주차 라벨과 대조하면 된다.
 * 공백·표기 차이("3월5주")를 견딘다. 못 찾으면 null.
 */
export function weekNoFromMonthWeek(
  school: SchoolLayer,
  semester: 1 | 2,
  label: string,
): number | null {
  const squash = (s: string) => s.replace(/\s/g, '')
  const want = squash(label)
  for (const w of weeksOf(school, semester)) {
    if (squash(monthWeekLabel(school, semester, w.no)) === want) return w.no
  }
  return null
}

/* ── 학사일정 고르기 ──────────────────────────── */

/** 그 학기의 학사일정. 없으면 첫 번째 것으로 떨어진다. */
export function calendarOf(school: SchoolLayer, semester: 1 | 2): AcademicCalendar {
  return school.calendars.find((c) => c.semester === semester) ?? school.calendars[0]
}

/** 그 학기의 주차 목록 — 가장 많이 쓰는 형태라 따로 둔다 */
export function weeksOf(school: SchoolLayer, semester: 1 | 2): Week[] {
  return calendarOf(school, semester).weeks
}

/* ── 진도표 예정시간 · 실시누계 ────────────────── */

/** 온전한 한 주의 수업일 수 */
const FULL_WEEK_DAYS = 5

export interface WeekHours {
  no: number
  /** 그 주의 예정시간 */
  planned: number
  /** 그 주까지의 실시누계 */
  cumulative: number
}

/**
 * 주차별 예정시간과 누계.
 *
 * 학교가 배포한 표(`school.hourly_tables[credit]`)가 있으면 그 값을 쓰고,
 * 없으면 주당 시수를 그 주 수업일수에 비례시켜 계산한다.
 * 양식 메모7이 "주당 이수시간별로 배포해드린 표를 활용"하라고 하므로,
 * 배포표가 들어오면 계산값을 덮는다.
 */
export function scheduledHours(school: SchoolLayer, semester: 1 | 2, credit: number): WeekHours[] {
  const weeks = weeksOf(school, semester)
  const table = school.hourly_tables?.[credit]
  let acc = 0
  return weeks.map((w, i) => {
    const planned =
      table?.[i] ?? Math.round((credit * Math.min(w.class_days, FULL_WEEK_DAYS)) / FULL_WEEK_DAYS)
    acc += planned
    return { no: w.no, planned, cumulative: acc }
  })
}

/* ── 진도 배분 ────────────────────────────────── */

/** 수업이 실제로 이루어지는 주 (정기시험 주·수업일 0인 주 제외) */
export function teachingWeeks(weeks: Week[]): Week[] {
  return weeks.filter((w) => !w.is_exam && w.class_days > 0)
}

/**
 * items 개를 slots 칸에 최대한 고르게 나눈다.
 * slots ≥ items 이면 한 항목이 여러 칸에 걸치고, items > slots 이면 한 칸에 여러 항목이 들어간다.
 * 앞쪽 칸부터 나머지를 하나씩 더 받는다.
 */
export function spread(items: number, slots: number): number[][] {
  const out: number[][] = Array.from({ length: slots }, () => [])
  if (items <= 0 || slots <= 0) return out

  if (slots >= items) {
    const base = Math.floor(slots / items)
    const rem = slots % items
    let s = 0
    for (let k = 0; k < items; k++) {
      const span = base + (k < rem ? 1 : 0)
      for (let j = 0; j < span; j++) out[s + j].push(k)
      s += span
    }
  } else {
    const base = Math.floor(items / slots)
    const rem = items % slots
    let k = 0
    for (let s = 0; s < slots; s++) {
      const take = base + (s < rem ? 1 : 0)
      for (let j = 0; j < take; j++) out[s].push(k++)
    }
  }
  return out
}

export interface Feasibility {
  ok: boolean
  /** 주당 평균 성취기준 수 */
  avgPerWeek: number
  /** 한 주에 들어가는 최대 성취기준 수 */
  maxPerWeek: number
  /** 성취기준이 하나도 안 들어가는 주 (= 복습·보충 여유) */
  slackWeeks: number
  message: string
}

/** 한 주에 들어갈 수 있는 성취기준 수 상한 */
export const MAX_PER_WEEK = 3
/** 성취기준 하나가 걸칠 수 있는 주 수 상한 — 보통 1주, 가끔 2주 */
export const MAX_SPAN = 2

/** 진도 순서대로 편 성취기준 코드. 단원 순서가 진도 순서의 원천이다. */
export function orderedStandardCodes(subject: Pick<Subject, 'units' | 'standards'>): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const u of [...subject.units].sort((a, b) => a.order - b.order)) {
    for (const c of u.standard_codes) {
      if (!seen.has(c)) {
        seen.add(c)
        out.push(c)
      }
    }
  }

  /*
   * 어느 단원에도 안 들어간 성취기준을 여기서 건진다.
   *
   * 단원 구성이 성취기준을 빠뜨리면 그 기준은 진도에도, 시험 범위 목록에도
   * 나타나지 않는다 — 교사가 화면에서 되찾을 방법이 없어진다.
   * 끝에 몰아 붙이면 순서가 어긋나므로 원래 차례상 앞서는 것들 바로 뒤에 끼운다.
   */
  const natural = new Map(subject.standards.map((s, i) => [s.code, i]))
  for (const s of subject.standards) {
    if (seen.has(s.code)) continue
    const mine = natural.get(s.code) ?? 0
    let at = 0
    for (let i = out.length - 1; i >= 0; i--) {
      if ((natural.get(out[i]) ?? -1) < mine) {
        at = i + 1
        break
      }
    }
    out.splice(at, 0, s.code)
    seen.add(s.code)
  }
  return out
}

/**
 * 성취기준 목록을 주에 배분한다.
 *
 *  - 주가 남으면 성취기준 하나가 최대 2주까지 걸친다. 그래도 남는 주는 비운다(복습·보충).
 *  - 주가 모자라면 한 주에 여러 개가 들어가되 3개를 넘기지 않으려 한다.
 *
 * 반환: 그 구간의 주차 번호 → 성취기준 코드 목록.
 */
function allocateSegment(codes: string[], weeks: Week[]): Record<number, string[]> {
  const out: Record<number, string[]> = {}
  const n = codes.length
  const m = weeks.length
  if (n === 0 || m === 0) return out

  if (m >= n) {
    // 한 개씩 놓고, 남는 주를 앞에서부터 하나씩 더 준다 (최대 2주)
    const extra = Math.min(m - n, n * (MAX_SPAN - 1))
    let w = 0
    for (let k = 0; k < n; k++) {
      const span = 1 + (k < extra ? 1 : 0)
      for (let j = 0; j < span && w < m; j++, w++) {
        out[weeks[w].no] = [codes[k]]
      }
    }
    // 남은 주는 비워 둔다 — 복습·보충 주
    return out
  }

  // 주가 모자라면 앞 주부터 하나씩 더 얹는다
  const base = Math.floor(n / m)
  const rem = n % m
  let k = 0
  for (let s = 0; s < m; s++) {
    const take = base + (s < rem ? 1 : 0)
    out[weeks[s].no] = codes.slice(k, k + take)
    k += take
  }
  return out
}

/**
 * 앵커 성취기준을 기준으로 구간을 나누고, 각 구간을 그 구간의 수업 주에 배분한다.
 * 앵커가 비어 있는 회차는 경계로 쓰지 않고 앞뒤 구간을 합친다.
 *
 * 수행평가도 경계가 된다 — 교사가 성취기준을 **직접 고른** 수행평가는, 그 성취기준을
 * 실시 주까지 다 배우도록 진도를 앞당겨야 한다(점검표: "실시일까지 진도가 나갔는지").
 * 자동 선정 수행평가는 경계로 쓰지 않는다 — 자동 선정 자체가 이 배분에서 파생되므로
 * 경계로 삼으면 순환이다. 수행평가 경계로 구간이 주당 3개를 넘게 과밀해지면 그 경계만
 * 버린다 — 불가능한 진도를 강제로 짜느니 검증(규칙 16)이 사람에게 알리게 한다.
 *
 * 반환: 주차 번호 → 성취기준 코드 목록. (파생값이지만 교사가 손댈 수 있어 학기 레이어에 저장한다)
 */
export function distributeStandards(
  subject: Pick<Subject, 'units' | 'standards'>,
  weeks: Week[],
  exams: { week: number; anchor_code: string | null }[],
  performances: Pick<Performance, 'week' | 'standard_codes' | 'standards_manual'>[] = [],
): Record<number, string[]> {
  const codes = orderedStandardCodes(subject)
  const result: Record<number, string[]> = {}
  if (codes.length === 0) return result

  const tWeeks = teachingWeeks(weeks)

  // 수행평가 경계: 고른 성취기준 중 진도 순서상 마지막 코드를 실시 주까지 끝내야 한다
  const perfBounds = performances
    .filter((p) => p.standards_manual && p.standard_codes.length > 0)
    .map((p) => {
      const idxs = p.standard_codes.map((c) => codes.indexOf(c)).filter((i) => i >= 0)
      const last = Math.max(...idxs, -1)
      return { week: p.week, anchor_code: last >= 0 ? codes[last] : null, fromPerf: true }
    })

  const sorted = [...exams.map((e) => ({ ...e, fromPerf: false })), ...perfBounds].sort(
    (a, b) => a.week - b.week || Number(a.fromPerf) - Number(b.fromPerf),
  ) // 같은 주면 시험 먼저

  const codeSegments: string[][] = []
  const weekSegments: Week[][] = []
  let cStart = 0
  let wStart = 0

  for (const e of sorted) {
    const a = e.anchor_code ? codes.indexOf(e.anchor_code) : -1
    if (a < cStart) continue // 앵커 미선택이거나 순서가 어긋나면 경계로 쓰지 않는다
    const wEnd = tWeeks.findIndex((w) => w.no > e.week)
    const wCut = wEnd < 0 ? tWeeks.length : wEnd
    // 수행평가 경계가 만들 구간이 주당 상한을 넘으면 무리다 — 이 경계는 버린다
    if (e.fromPerf && a + 1 - cStart > (wCut - wStart) * MAX_PER_WEEK) continue
    codeSegments.push(codes.slice(cStart, a + 1))
    weekSegments.push(tWeeks.slice(wStart, wCut))
    cStart = a + 1
    wStart = wCut
  }
  codeSegments.push(codes.slice(cStart))
  weekSegments.push(tWeeks.slice(wStart))

  for (let i = 0; i < codeSegments.length; i++) {
    Object.assign(result, allocateSegment(codeSegments[i], weekSegments[i] ?? []))
  }
  return result
}

/** 그 주의 성취기준이 앞 주에서 이어진 것인지 — 저장하지 않고 배분에서 파생한다 */
export function isContinued(
  distribution: Record<number, string[]>,
  week: number,
  code: string,
): boolean {
  return (distribution[week - 1] ?? []).includes(code)
}

export function feasibility(
  subject: Pick<Subject, 'units' | 'standards'>,
  weeks: Week[],
): Feasibility {
  const tw = teachingWeeks(weeks).length
  const n = orderedStandardCodes(subject).length
  if (tw === 0) {
    return {
      ok: false,
      avgPerWeek: 0,
      maxPerWeek: 0,
      slackWeeks: 0,
      message: '수업 가능한 주가 없습니다',
    }
  }
  const avg = n / tw
  const maxPerWeek = Math.max(1, Math.ceil(avg))
  const slack = Math.max(0, tw - n * MAX_SPAN)
  return {
    ok: n > 0 && maxPerWeek <= MAX_PER_WEEK,
    avgPerWeek: avg,
    maxPerWeek,
    slackWeeks: slack,
    message:
      n === 0
        ? '성취기준이 없습니다'
        : maxPerWeek > MAX_PER_WEEK
          ? `성취기준 ${n}개를 ${tw}주에 넣으면 한 주에 ${maxPerWeek}개가 됩니다 — 학사일정을 확인하세요`
          : `성취기준 ${n}개 · 주당 평균 ${avg.toFixed(1)}개 · 복습 여유 ${slack}주`,
  }
}

/* ── 수행평가 파생값 ──────────────────────────── */

/** 수행평가 안내 주 = 실시 주 − notice_lead_weeks */
export function noticeWeek(perf: Performance, leadWeeks: number): number {
  return perf.week - leadWeeks
}

/** 학기 초 이 주 수만큼은 수행평가를 두지 않는다 — 수업이 자리를 잡는 기간 */
export const PERF_START_AFTER_WEEKS = 4

/**
 * 수행평가를 실시할 수 있는 주차 창 — [from, to] 양끝 포함.
 *
 *   시작  학기 시작 4주 뒤(5주차부터)
 *   끝    학사일정의 마지막 정기시험(2회 고사) 주 **직전**까지
 *
 * 끝을 계획서의 시험이 아니라 학사일정에서 잡는다 — 1회만 응시하는 과목도
 * 2회 고사 기간 전까지는 실시할 수 있기 때문이다.
 * 검증(규칙 19)과 자동 배치(pickWeek)가 같은 자를 써야 자동으로 놓은 자리가
 * 검증에 걸리는 일이 없다.
 */
export function perfWindow(school: SchoolLayer, semester: 1 | 2): { from: number; to: number } {
  const weeks = weeksOf(school, semester)
  const lastExam = [...weeks].filter((w) => w.is_exam).sort((a, b) => b.no - a.no)[0]?.no
  return { from: PERF_START_AFTER_WEEKS + 1, to: (lastExam ?? weeks.length + 1) - 1 }
}

/** 영역 만점은 반영 비율에서 나온다 (총점 100점 기준) */
export function areaMaxFromRatio(ratio: number): number {
  return ratio
}

/**
 * 이 계획서의 수행평가 한 영역 상한(%).
 * 점검표: 기본 35%, 단 정기시험을 2회 실시하는 과목은 40%까지.
 * 검증(규칙 2)·비율 자동 배분·입력 상한이 전부 이 하나를 봐야 값이 안 어긋난다.
 */
export function perfAreaCap(
  plan: Pick<SemesterPlan, 'exam_count'>,
  rules: Pick<SchoolRules, 'perf_area_max' | 'perf_area_max_relaxed'>,
): number {
  return plan.exam_count >= 2 ? rules.perf_area_max_relaxed : rules.perf_area_max
}

/**
 * 서·논술형 30% 검증을 면제받는 계획서인가.
 * 점검표: 1단위(주당 1시간) 과목, 또는 수행평가가 80% 이상인 과목은 해당 조항 삭제.
 * 검증(규칙 3)과 Ⅲ-2 마 항목 삭제(renderForm)가 같은 판단을 공유한다.
 */
export function essayExempt(plan: Pick<SemesterPlan, 'credit' | 'perf_ratio'>): boolean {
  return plan.credit === 1 || plan.perf_ratio >= 80
}

/**
 * '수행평가 성취기준 ↔ 진도' 확인(규칙 16)이 가리키는 상태의 지문.
 *
 * 확인 버튼은 이 지문과 함께 저장된다. 성취기준·실시 시기·진도 중 하나라도
 * 바뀌면 지문이 달라져 확인이 자동으로 풀린다.
 */
export function perfProgressFingerprint(
  plan: Pick<SemesterPlan, 'distribution' | 'performances'>,
): string {
  return JSON.stringify({
    d: Object.entries(plan.distribution).sort(([a], [b]) => Number(a) - Number(b)),
    p: plan.performances.map((p) => [p.id, p.week, [...p.standard_codes].sort()]),
  })
}

/** 반영 비율 합계 — 정기시험 + 수행평가 전 영역 */
export function ratioTotal(plan: SemesterPlan, examRatio: number): number {
  const perf = plan.performances.reduce((s, p) => s + p.ratio, 0)
  return (plan.exam_count > 0 ? examRatio : 0) + perf
}

/**
 * 회차 하나의 반영 비율(%).
 *
 * 교사가 회차별로 정했으면 그 값을, 안 정했으면 전체 정기시험 비율을 회차 수로 나눈다.
 * 예전 저장분에는 회차별 값이 없어서 이 갈래가 필요하다.
 */
export function examRatioOf(plan: SemesterPlan, examNo: number): number {
  const e = plan.exams.find((x) => x.no === examNo)
  if (!e) return 0
  if (e.ratio != null) return e.ratio
  return plan.exam_count > 0 ? plan.exam_ratio / plan.exam_count : 0
}

/** 회차별 서술형 비율(%) — parts 배점에서 역산 */
export function examEssayPct(plan: SemesterPlan, examNo: number): number {
  const e = plan.exams.find((x) => x.no === examNo)
  if (!e) return 0
  const total = e.parts.reduce((s, p) => s + p.points, 0)
  const essay = e.parts.filter((p) => p.kind === '서술형').reduce((s, p) => s + p.points, 0)
  return total > 0 ? Math.round((essay / total) * 100) : 0
}

/**
 * 회차 하나가 서술·논술 비율에 보태는 몫(%). 전체 성적 기준.
 *
 * ★ 소수점은 **버린다**. 서술·논술은 30% 이상이어야 하는데 올려 적으면
 * 실제로는 미달인 계획서가 충족한 것처럼 보인다(25/100 × 30% = 7.5 → 7).
 * 문서에 적히는 값과 규칙 검사에 쓰는 값이 같아야 하므로 여기 하나로 모은다.
 */
export function examEssayShare(plan: SemesterPlan, examNo: number): number {
  const e = plan.exams.find((x) => x.no === examNo)
  if (!e) return 0
  const total = e.parts.reduce((s, p) => s + p.points, 0)
  if (total <= 0) return 0
  const essay = e.parts.filter((p) => p.kind === '서술형').reduce((s, p) => s + p.points, 0)
  return Math.floor((essay / total) * examRatioOf(plan, examNo))
}

/** 서술·논술 합계 = 지필 서술형 + 수행 논술형. 회차별로 버린 값을 더한다. */
export function essayTotal(plan: SemesterPlan, examRatio: number): number {
  void examRatio // 회차별 비율은 examRatioOf가 본다 — 호출부 호환을 위해 남겨 둔다
  const written = plan.exams.reduce((sum, e) => sum + examEssayShare(plan, e.no), 0)
  return written + perfEssayTotal(plan)
}

/**
 * 수행평가 쪽 서술·논술 비율 합계.
 * 교사가 직접 정한 값(essay_ratio)이 있으면 그것을 쓰고,
 * 없으면 평가 방법에 '서술·논술'이 있는 영역의 반영 비율 전부로 본다.
 */
export function perfEssayRatio(perf: Performance): number {
  if (perf.essay_ratio != null) return Math.max(0, Math.min(perf.ratio, perf.essay_ratio))
  return perf.method_checks.includes('서술·논술') ? perf.ratio : 0
}

export function perfEssayTotal(plan: SemesterPlan): number {
  return plan.performances.reduce((s, p) => s + perfEssayRatio(p), 0)
}

/** 루브릭 배점 합 — 요소별 최고 배점의 합 */
export function rubricMax(perf: Performance): number {
  return perf.rubric.reduce((s, r) => s + Math.max(0, ...r.levels.map((l) => l.score)), 0)
}

/** 루브릭 최저 합 — 기본점수를 뺀 하한 확인용 */
export function rubricMin(perf: Performance): number {
  return perf.rubric.reduce((s, r) => s + Math.min(...r.levels.map((l) => l.score)), 0)
}

/**
 * 배점 합 목록 — 양식에 길게 늘어선 '배점 합 N점' 줄.
 * 교사가 타이핑할 것이 아니라 최대합부터 최소합까지 급간만큼 찍은 것이다.
 */
export function scoreSumLabels(perf: Performance): string[] {
  const rows = perf.rubric.filter((r) => r.levels.length > 1)
  if (rows.length === 0) return []
  const max = rows.reduce((s, r) => s + Math.max(...r.levels.map((l) => l.score)), 0)
  const min = rows.reduce((s, r) => s + Math.min(...r.levels.map((l) => l.score)), 0)
  const step = Math.min(
    ...rows.flatMap((r) =>
      r.levels.slice(0, -1).map((l, i) => Math.abs(l.score - r.levels[i + 1].score)),
    ),
  )
  if (!(step > 0)) return [`배점 합 ${max}점`]

  const out: string[] = []
  for (let v = max; v >= min - 1e-9; v -= step) {
    out.push(`배점 합 ${Number.isInteger(v) ? v : Number(v.toFixed(1))}점`)
  }
  out.push(`기본점수 ${perf.base_score}점`)
  return out
}

/**
 * 한글 조사 — 앞말의 끝소리에 받침이 있는지로 고른다.
 * 따옴표·괄호로 끝나면 그 안의 마지막 글자를 본다.
 *
 *   josa('제시', '와') → '와'   ·  josa('토론', '와') → '과'
 *   josa('제시', '로') → '로'   ·  josa('토론', '로') → '으로'   (ㄹ 받침은 '로')
 */
export function josa(word: string, kind: '와' | '로' | '은' | '이'): string {
  const m = word.replace(/[’'"”)\]』」\s]+$/u, '')
  const last = m.at(-1) ?? ''
  const code = last.charCodeAt(0)
  if (!(code >= 0xac00 && code <= 0xd7a3)) {
    // 한글이 아니면 받침 없는 쪽으로 (숫자·영문은 경우가 많아 단순화)
    return { 와: '와', 로: '로', 은: '는', 이: '가' }[kind]
  }
  const jong = (code - 0xac00) % 28
  if (kind === '로') return jong === 0 || jong === 8 ? '로' : '으로' // ㄹ 받침은 '로'
  const has = jong !== 0
  return { 와: has ? '과' : '와', 은: has ? '은' : '는', 이: has ? '이' : '가' }[kind]
}

const ROMAN = ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ', 'Ⅶ', 'Ⅷ', 'Ⅸ', 'Ⅹ', 'Ⅺ', 'Ⅻ']

/** 영역 번호 '01' → 'Ⅰ'. 진도표 단원명 윗줄과 Ⅺ 표 소제목에 쓴다. */
export function areaRoman(areaNo: string | null): string {
  const n = Number(areaNo)
  return Number.isFinite(n) && n >= 1 && n <= ROMAN.length ? ROMAN[n - 1] : (areaNo ?? '')
}

/** 시험별 성취기준 범위 — 앵커 단원 → 단원 → 성취기준 코드 */
export function examStandardCodes(
  subject: Pick<Subject, 'units' | 'standards'>,
  exams: { no: number; anchor_code: string | null }[],
  examNo: number,
): string[] {
  const codes = orderedStandardCodes(subject)
  const sorted = [...exams].sort((a, b) => a.no - b.no)
  const idx = sorted.findIndex((e) => e.no === examNo)
  if (idx < 0) return []

  const end = sorted[idx].anchor_code ? codes.indexOf(sorted[idx].anchor_code!) : -1
  if (end < 0) return []
  // 직전 회차 앵커 다음부터가 이번 시험 범위다
  const prev = idx > 0 ? sorted[idx - 1].anchor_code : null
  const start = prev ? codes.indexOf(prev) + 1 : 0
  return codes.slice(Math.max(0, start), end + 1)
}

/** 동점자 처리 순서 — 2회 → 1회 → 수행1 → 수행2 */
export function tiebreakOrder(plan: SemesterPlan): string[] {
  const exams = [...plan.exams].sort((a, b) => b.no - a.no).map((e) => `${e.no}회 정기시험`)
  const perfs = plan.performances.map((p) => p.name || '(이름 없음)')
  return [...exams, ...perfs]
}

/* ── 표 · 표지 ────────────────────────────────── */

/** 성취도 표 선택 — subject.type */
export function achievementTableFor(
  school: SchoolLayer,
  type: AchievementTableId,
): AchievementTable | undefined {
  return school.achievement_tables.find((t) => t.id === type)
}

/** 반 범위 — classes_by_grade[grade] → "1~8반" */
export function classRange(school: SchoolLayer, grade: number): string {
  const n = school.rules.classes_by_grade[grade]
  return n ? `1~${n}반` : ''
}

/* ── 가·나·다 번호 · 문장 은행 ────────────────── */

const KO_ORDINALS = '가나다라마바사아자차카타파하'.split('')

/** 출력 시점에 부여하는 번호. 저장하지 않는다. */
export function koOrdinal(i: number): string {
  if (i < KO_ORDINALS.length) return KO_ORDINALS[i]
  const a = Math.floor(i / KO_ORDINALS.length) - 1
  return KO_ORDINALS[a] + KO_ORDINALS[i % KO_ORDINALS.length]
}

export interface SentenceContext {
  subject: Subject
  plan: SemesterPlan
  school: SchoolLayer
  /** 등급 산출 과목인지 — 등급 미산출이면 Ⅲ-2-사(동점자) 제거 */
  hasRank: boolean
}

export function sentenceApplies(s: Sentence, ctx: SentenceContext): boolean {
  const { subject, plan } = ctx
  switch (s.condition) {
    case 'always':
      return true
    case 'exam_count == 0':
      return plan.exam_count === 0
    case 'exam_count > 0':
      return plan.exam_count > 0
    case 'credit > 1 && perf_ratio < 80':
      // 비율은 계획서 값을 본다 — 학교 기본값이 아니다
      return plan.credit > 1 && plan.perf_ratio < 80
    case 'has_rank':
      return ctx.hasRank
    case 'type != pass_fail':
      return subject.type !== 'pass_fail'
    case 'type == pass_fail':
      return subject.type === 'pass_fail'
    case 'split_score_type == 추정':
      return plan.split_score_type === '추정'
    case 'split_score_type == 고정':
      return plan.split_score_type === '고정'
    case 'is_common':
      return subject.is_common
    default:
      return true
  }
}

/** `{과목명}` `{학년}` `{수행평가명1}` 슬롯을 채운다. */
export function fillSlots(text: string, ctx: SentenceContext): string {
  return text.replace(/\{([^}]+)\}/g, (whole, key: string) => {
    if (key === '과목명') return ctx.subject.name
    if (key === '학년') return `${ctx.plan.grade}학년`
    if (key === '학점') return `${ctx.plan.credit}학점`
    if (key === '지도교사') return ctx.plan.teachers.join(', ')
    if (key === '지침명') return ctx.school.rules.guideline_name
    // 비율은 계획서마다 다르다 — 학교 기본값(school.rules)은 새 계획서의 출발점일 뿐이다
    if (key === '정기시험비율') return `${ctx.plan.exam_ratio}%`
    if (key === '수행평가비율') return `${ctx.plan.perf_ratio}%`
    /*
     * 성적 산출 방식 한 구절.
     * 시험이 없으면 "정기시험 0%와 수행평가 100%를 합산"이 어색하므로 갈래를 나눈다.
     */
    if (key === '성적산출') {
      return ctx.plan.exam_count > 0
        ? `정기시험 ${ctx.plan.exam_ratio}%와 수행평가 ${ctx.plan.perf_ratio}%의 합산`
        : '수행평가 100%'
    }
    if (key === '분할점수방식') return ctx.plan.split_score_type
    if (key === '동점자순서') return tiebreakOrder(ctx.plan).join(' → ')
    const perfMatch = key.match(/^수행평가명(\d+)$/)
    if (perfMatch) {
      const p = ctx.plan.performances[Number(perfMatch[1]) - 1]
      return p ? p.name : whole
    }
    return whole
  })
}

export interface RenderedSentence {
  /** 출력 시점에 부여한 가·나·다 */
  ordinal: string
  text: string
}

/** 조건을 통과한 문장만 골라 순서대로 가·나·다를 붙인다. */
export function renderSection(
  section: Sentence['section'],
  ctx: SentenceContext,
): RenderedSentence[] {
  return ctx.school.sentences
    .filter((s) => s.section === section)
    .filter((s) => sentenceApplies(s, ctx))
    .sort((a, b) => a.order - b.order)
    .map((s, i) => ({ ordinal: koOrdinal(i), text: fillSlots(s.text, ctx) }))
}
