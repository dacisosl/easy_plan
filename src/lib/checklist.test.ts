/**
 * 학교 점검표 반영분 검증.
 *
 *  - 월 주차 목요일 기준 (점검표 6: "실시 주차는 목요일이 속한 월 기준")
 *  - 수행평가 성취기준 ↔ 진도 연동 (점검표 5)
 *  - 신규 검증 규칙 16~19와 2·3 수정
 */

import { describe, expect, it } from 'vitest'
import { SCHOOL_SEED, WEEKS_2026_1 } from '@/data/school'
import { PLAN_SEED, SUBJECT_SEED } from '@/data/subject'
import type { Performance, SchoolLayer, SemesterPlan } from '@/types'
import {
  distributeStandards,
  essayExempt,
  monthWeekByThursday,
  monthWeekLabel,
  orderedStandardCodes,
  perfAreaCap,
  perfProgressFingerprint,
  perfWindow,
  weekNoFromMonthWeek,
} from './derive'
import { RULE_COUNT, validate } from './validate'

const weeks = WEEKS_2026_1

describe('monthWeekByThursday — 목요일이 속한 달 기준', () => {
  it.each([
    [1, '3월 1주'], // 3.3(화)~3.6 → 목 3.5
    [5, '4월 1주'], // 3.30~4.3 → 목 4.2 — 시작일 기준으로는 3월 5주였다
    [9, '4월 5주'], // 4.27~4.30 → 목 4.30
    [10, '5월 1주'],
    [18, '7월 1주'], // 2회 정기시험 — 점검표가 요구한 바로 그 라벨. 시작일 기준으로는 6월 5주
    [21, '7월 4주'], // 7.20(월)~21(화) — 주가 목요일 전에 끝나도 달력 주 목요일(7.23)로 귀속
  ])('%i주 → %s', (no, label) => {
    expect(monthWeekByThursday(weeks, no)).toBe(label)
  })

  it('라벨 ↔ 주차 왕복이 전 주차에서 성립한다 (thursday · start 두 모드)', () => {
    for (const rule of ['thursday', 'start'] as const) {
      const school: SchoolLayer = {
        ...SCHOOL_SEED,
        rules: { ...SCHOOL_SEED.rules, month_week_rule: rule },
      }
      for (const w of weeks) {
        const label = monthWeekLabel(school, 1, w.no)
        expect(weekNoFromMonthWeek(school, 1, label), `${rule} ${w.no}주`).toBe(w.no)
      }
    }
  })
})

/* ── 수행평가 앵커 배분 ─────────────────────────── */

const subject = SUBJECT_SEED
const ordered = orderedStandardCodes(subject)

/** 주어진 코드가 배정된 마지막 주차 */
function lastWeekOf(dist: Record<number, string[]>, code: string): number {
  return Math.max(
    ...Object.entries(dist)
      .filter(([, codes]) => codes.includes(code))
      .map(([wk]) => Number(wk)),
  )
}

const perf = (over: Partial<Performance>): Performance => ({
  ...PLAN_SEED.performances[0],
  ...over,
})

describe('distributeStandards — 수행평가 경계', () => {
  it('직접 고른 성취기준은 실시 주까지 전부 배정된다', () => {
    const anchor = ordered[5]
    const dist = distributeStandards(
      subject,
      weeks,
      [],
      [{ week: 8, standard_codes: [anchor], standards_manual: true }],
    )
    for (const c of ordered.slice(0, 6)) {
      expect(lastWeekOf(dist, c), c).toBeLessThanOrEqual(8)
    }
  })

  it('구간이 주당 3개를 넘게 과밀해지면 그 경계는 버린다', () => {
    // 3주 안에 전체 성취기준을 끝내라는 요구 — 불가능하므로 기본 배분과 같아야 한다
    const base = distributeStandards(subject, weeks, [])
    const dist = distributeStandards(
      subject,
      weeks,
      [],
      [{ week: 3, standard_codes: [ordered[ordered.length - 1]], standards_manual: true }],
    )
    expect(dist).toEqual(base)
  })

  it('자동 선정 수행평가는 경계로 쓰지 않는다 — 순환 방지', () => {
    const base = distributeStandards(subject, weeks, [])
    const dist = distributeStandards(
      subject,
      weeks,
      [],
      [{ week: 8, standard_codes: [ordered[5]], standards_manual: false }],
    )
    expect(dist).toEqual(base)
  })

  it('시험 경계와 함께 쓰여도 시험 경계는 그대로다', () => {
    const dist = distributeStandards(subject, weeks, PLAN_SEED.exams, [
      { week: 6, standard_codes: [ordered[3]], standards_manual: true },
    ])
    // 1회 시험(8주) 앵커까지의 코드는 여전히 8주 안에 끝난다
    const e1 = PLAN_SEED.exams[0]
    const upTo = ordered.slice(0, ordered.indexOf(e1.anchor_code!) + 1)
    for (const c of upTo) expect(lastWeekOf(dist, c), c).toBeLessThanOrEqual(e1.week)
    // 수행평가 앵커까지의 코드는 6주 안에 끝난다
    for (const c of ordered.slice(0, 4)) expect(lastWeekOf(dist, c), c).toBeLessThanOrEqual(6)
  })
})

/* ── 검증 규칙 ─────────────────────────────────── */

/** 시드 견본을 바탕으로 규칙 하나를 겨냥한 계획서를 만든다 */
const planWith = (over: Partial<SemesterPlan>): SemesterPlan => ({ ...PLAN_SEED, ...over })

const rulesOf = (plan: SemesterPlan) =>
  validate(plan, subject, SCHOOL_SEED).errors.map((e) => e.rule)

describe('검증 규칙 16~19 · 2·3 수정', () => {
  it('RULE_COUNT는 passed+failed의 전체 개수다', () => {
    const r = validate(PLAN_SEED, subject, SCHOOL_SEED)
    const failedRules = new Set(r.errors.map((e) => e.rule))
    expect(r.passed.length + failedRules.size).toBe(RULE_COUNT)
  })

  it('16 — 실시 주까지 안 배운 성취기준이 있으면 잡는다', () => {
    // 견본의 수행평가 성취기준은 12주 이후에 배운다 — 4주로 당기면 확실히 걸린다
    const plan = planWith({
      performances: [perf({ week: 4 }), PLAN_SEED.performances[1]],
    })
    const found = validate(plan, subject, SCHOOL_SEED).errors.find((e) => e.rule === 16)
    expect(found).toBeDefined()
    // 안내문에는 무엇을 언제 배우는지가 들어 있어야 교사가 고칠 수 있다
    expect(found!.detail).toMatch(/\d+주\(\d+월 \d+주\)/)
  })

  it("16 — '확인했습니다'는 그 상태에서만 유효하다", () => {
    const plan = planWith({
      performances: [perf({ week: 4 }), PLAN_SEED.performances[1]],
    })
    expect(rulesOf(plan)).toContain(16)
    // 확인: 지금 상태의 지문을 저장하면 조용해진다
    const acked = { ...plan, perf_progress_ack: perfProgressFingerprint(plan) }
    expect(rulesOf(acked)).not.toContain(16)
    // 그러나 시기를 또 바꾸면 지문이 어긋나 다시 묻는다
    const changed = {
      ...acked,
      performances: [perf({ week: 5 }), PLAN_SEED.performances[1]],
    }
    expect(rulesOf(changed)).toContain(16)
  })

  it('16 — 진도를 수행평가에 맞춰 다시 배분하면 통과한다', () => {
    const p = perf({ week: 8, standard_codes: [ordered[3]], standards_manual: true })
    const plan = planWith({
      performances: [p, PLAN_SEED.performances[1]],
      distribution: distributeStandards(subject, weeks, PLAN_SEED.exams, [p]),
    })
    expect(rulesOf(plan)).not.toContain(16)
  })

  it('17 — 수행 총비율 하한: 40% (3학년은 30%)', () => {
    expect(rulesOf(planWith({ perf_ratio: 35 }))).toContain(17)
    expect(rulesOf(planWith({ perf_ratio: 35, grade: 3 }))).not.toContain(17)
    expect(rulesOf(planWith({ perf_ratio: 25, grade: 3 }))).toContain(17)
  })

  it('18 — 수행평가는 2영역 이상', () => {
    expect(rulesOf(planWith({ performances: [PLAN_SEED.performances[0]] }))).toContain(18)
    expect(rulesOf(PLAN_SEED)).not.toContain(18)
  })

  it('19 — 실시 창: 학기 시작 4주 뒤 ~ 마지막 정기시험(18주) 전', () => {
    // 4주 이내는 이르다
    const early = planWith({ performances: [perf({ week: 4 }), PLAN_SEED.performances[1]] })
    expect(rulesOf(early)).toContain(19)
    // 5주부터 열린다
    const ok = planWith({ performances: [perf({ week: 5 }), PLAN_SEED.performances[1]] })
    expect(rulesOf(ok)).not.toContain(19)
    // 마지막 시험 주(18주) 이후는 늦다
    const late = planWith({ performances: [perf({ week: 18 }), PLAN_SEED.performances[1]] })
    expect(rulesOf(late)).toContain(19)
  })

  it('19 — 시험 횟수와 무관하게 학사일정을 자로 쓴다 (1회 응시 과목 오탐 방지)', () => {
    // 1회만 응시(시험 8주)해도 수행평가는 2회 고사 기간(18주) 전까지 실시할 수 있다
    const oneExam = planWith({
      exam_count: 1,
      exams: [PLAN_SEED.exams[0]],
      performances: [perf({ week: 12 }), { ...PLAN_SEED.performances[1], week: 15 }],
    })
    expect(rulesOf(oneExam)).not.toContain(19)
  })

  it('perfWindow — 검증과 자동 배치가 같은 창을 본다', () => {
    expect(perfWindow(SCHOOL_SEED, 1)).toEqual({ from: 5, to: 17 })
  })

  it('2 수정 — 정기시험 2회 과목은 영역 상한 40%', () => {
    expect(perfAreaCap({ exam_count: 2 }, SCHOOL_SEED.rules)).toBe(40)
    expect(perfAreaCap({ exam_count: 1 }, SCHOOL_SEED.rules)).toBe(35)
    expect(perfAreaCap({ exam_count: 0 }, SCHOOL_SEED.rules)).toBe(35)
    // 38%짜리 영역 — 2회 실시 과목에서는 통과
    const plan = planWith({
      performances: [
        perf({ ratio: 38, max_score: 38 }),
        { ...PLAN_SEED.performances[1], ratio: 2, max_score: 2 },
      ],
    })
    expect(rulesOf(plan)).not.toContain(2)
  })

  it('3 수정 — 1단위 과목·수행 80% 이상은 서논술 하한 면제', () => {
    expect(essayExempt({ credit: 1, perf_ratio: 40 })).toBe(true)
    expect(essayExempt({ credit: 3, perf_ratio: 80 })).toBe(true)
    expect(essayExempt({ credit: 3, perf_ratio: 40 })).toBe(false)
    // 서논술이 전혀 없어도 1단위면 규칙 3에 안 걸린다
    const noEssay = planWith({
      credit: 1,
      performances: PLAN_SEED.performances.map((p) => ({
        ...p,
        method_checks: p.method_checks.filter((c) => c !== '서술·논술'),
        essay_ratio: 0,
      })),
      exams: PLAN_SEED.exams.map((e) => ({
        ...e,
        parts: e.parts.filter((x) => x.kind !== '서술형'),
      })),
    })
    expect(rulesOf(noEssay)).not.toContain(3)
    expect(rulesOf({ ...noEssay, credit: 3 })).toContain(3)
  })
})
