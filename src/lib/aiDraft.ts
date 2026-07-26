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
import { renderSection, type SentenceContext } from './derive'
import { rubricFromChecks } from './autofill'

export type GenerateStage = 'sections' | 'weekly' | 'perfs'
export const STAGES: GenerateStage[] = ['sections', 'weekly', 'perfs']

/* ── 입력 지문 ────────────────────────────────
   문안에 영향을 주는 입력만 담는다. 일치하면 재호출을 건너뛴다. */

export function inputHash(plan: SemesterPlan, subject: Subject): string {
  const src = JSON.stringify({
    subject: subject.name,
    grade: plan.grade,
    credit: plan.credit,
    units: subject.units.map((u) => [u.order, u.name, u.standard_codes]),
    distribution: plan.distribution,
    exams: plan.exams.map((e) => [e.no, e.week, e.anchor_unit]),
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

function ctxOf(plan: SemesterPlan, subject: Subject, school: SchoolLayer): SentenceContext {
  const hasRank = subject.type !== 'pass_fail' && subject.type !== 'arts_pe'
  return { subject, plan, school, hasRank }
}

export function fallbackSections(
  plan: SemesterPlan,
  subject: Subject,
  school: SchoolLayer,
): AiDraft['sections'] {
  const ctx = ctxOf(plan, subject, school)
  const bank = (s: 'Ⅸ' | 'Ⅹ') => renderSection(s, ctx).map((x) => x.text)
  const split = (s: string) => s.split(/\n+/).map((x) => x.trim()).filter(Boolean)
  return {
    I: split(subject.teaching_plan),
    II: split(subject.objectives),
    IX: bank('Ⅸ'),
    X: bank('Ⅹ'),
  }
}

export function fallbackWeekly(
  plan: SemesterPlan,
  subject: Subject,
  school: SchoolLayer,
): AiDraft['weekly'] {
  const unitById = new Map(subject.units.map((u) => [u.id, u]))
  const out: AiDraft['weekly'] = {}
  for (const w of school.calendar.weeks) {
    if (w.is_exam) continue
    const units = (plan.distribution[w.no] ?? [])
      .map((id) => unitById.get(id))
      .filter(Boolean)
    if (units.length === 0) continue
    const names = units.map((u) => u!.name.replace(/^\d+\.\s*/, '')).join(', ')
    out[w.no] = [
      `[강의식, 모둠협력수업] ${names}의 핵심 개념을 파악하고 관련 사례를 탐구한다.`,
    ]
  }
  return out
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
  return {
    system: `${TONE} JSON 하나만 출력한다: {"I": string[], "II": string[], "IX": string[], "X": string[]}. 각 배열 원소는 완성된 문장 하나다. 번호(가·나·다)를 붙이지 않는다 — 출력 시점에 코드가 붙인다.`,
    user: [
      `과목: ${subject.name} (${plan.grade}학년, ${plan.credit}학점)`,
      `영역: ${subject.areas.map((a) => a.name).join(', ')}`,
      `수행평가: ${plan.performances.map((p) => `${p.name}(${p.ratio}%)`).join(', ') || '없음'}`,
      '',
      'I = 교수학습 운영계획 (2~4문장): 이 과목을 한 학기 어떻게 가르칠지.',
      'II = 평가의 목적 (3~5문장): 무엇을 왜 평가하는지.',
      'IX = 평가 결과의 활용 방안 (3~4문장).',
      'X = 원격수업 운영 시 평가 계획 (3~5문장): 원격 전환 시 평가 조정·출결·직접 관찰 원칙.',
    ].join('\n'),
  }
}

export function weeklyPrompt(
  plan: SemesterPlan,
  subject: Subject,
  school: SchoolLayer,
): { system: string; user: string } {
  const unitById = new Map(subject.units.map((u) => [u.id, u]))
  const stdByCode = new Map(subject.standards.map((s) => [s.code, s]))
  const weeks = school.calendar.weeks
    .filter((w) => !w.is_exam && (plan.distribution[w.no] ?? []).length > 0)
    .map((w) => {
      const units = (plan.distribution[w.no] ?? []).map((id) => unitById.get(id)!).filter(Boolean)
      const codes = units.flatMap((u) => u.standard_codes)
      const stds = codes
        .map((c) => `${c} ${stdByCode.get(c)?.text ?? ''}`.trim())
        .join(' / ')
      return `${w.no}주: 단원 [${units.map((u) => u.name).join(', ')}] 성취기준 [${stds || '없음'}]`
    })
  return {
    system: `${TONE} 진도표의 '수업 방법 및 수업·평가 연계의 주안점' 칸을 쓴다. JSON 하나만 출력한다: {"weekly": {"주차번호": string[]}}. 각 주는 1~3줄, 줄마다 "[수업방법] 활동 내용" 형태. 그 주 성취기준에 없는 내용을 넣지 않는다.`,
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
  const pick = (k: string, f: string[]) => {
    const lines = asLines(o[k])
    return lines.length > 0 ? lines : f
  }
  const value = {
    I: pick('I', fb.I),
    II: pick('II', fb.II),
    IX: pick('IX', fb.IX),
    X: pick('X', fb.X),
  }
  const usedFallback =
    value.I === fb.I || value.II === fb.II || value.IX === fb.IX || value.X === fb.X
  return { value, usedFallback }
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
