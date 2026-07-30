/**
 * 5. 검증 규칙 (검토 기능)
 *
 * 로직 검증은 전부 결정적이다. 통과 못 하면 내려받기를 막는다.
 * AI 검토는 남아 있어도 내려받을 수 있다.
 */

import type { FocusTarget, SchoolLayer, SemesterPlan, Subject } from '@/types'
import {
  essayExempt,
  essayTotal,
  examStandardCodes,
  monthWeekLabel,
  noticeWeek,
  perfAreaCap,
  ratioTotal,
  rubricMax,
  teachingWeeks,
  weeksOf,
} from './derive'

/** 로직 규칙 수 — 화면의 'N개 규칙 통과'도 이 값을 본다 */
export const RULE_COUNT = 19

export type Severity = 'error' | 'ai'

export interface Issue {
  /** 로직 규칙 번호 (1~RULE_COUNT). AI 검토는 없음. */
  rule?: number
  severity: Severity
  title: string
  detail: string
  /** '고치기'가 데려갈 화면 */
  target?: FocusTarget
  /** 대상 수행평가 id */
  perfId?: string
}

export interface ValidationResult {
  errors: Issue[]
  ai: Issue[]
  /** 통과한 로직 규칙 번호 */
  passed: number[]
  /** 규칙 10 — 미배정 성취기준 코드 목록 */
  unassignedStandards: string[]
}

export function validate(
  plan: SemesterPlan,
  subject: Subject,
  school: SchoolLayer,
): ValidationResult {
  const errors: Issue[] = []
  const failed = new Set<number>()
  const { rules } = school
  const weeks = weeksOf(school, plan.semester)

  const fail = (rule: number, i: Omit<Issue, 'severity' | 'rule'>) => {
    failed.add(rule)
    errors.push({ ...i, rule, severity: 'error' })
  }

  /* 1. 반영 비율 합 = 100% */
  const total = ratioTotal(plan, plan.exam_ratio)
  if (Math.abs(total - 100) > 0.001) {
    const perfSum = plan.performances.reduce((s, p) => s + p.ratio, 0)
    fail(1, {
      title: `반영 비율 합계가 100%가 아닙니다`,
      detail:
        plan.exam_count > 0
          ? `정기시험 ${plan.exam_ratio}% + 수행평가 ${perfSum}% = ${total}% · ${(100 - total).toFixed(0)}%가 남습니다`
          : `수행평가 ${perfSum}% · ${(100 - total).toFixed(0)}%가 남습니다`,
      target: 'perf',
    })
  }

  /* 2. 수행평가 한 영역 ≤ 상한 (기본 35% · 정기시험 2회 과목은 40%) */
  const areaCap = perfAreaCap(plan, rules)
  for (const p of plan.performances) {
    if (p.ratio > areaCap) {
      fail(2, {
        title: `수행평가 한 영역이 ${areaCap}%를 넘습니다`,
        detail: `${p.name || '(이름 없음)'} · ${p.ratio}%${plan.exam_count >= 2 ? ' · 정기시험 2회 과목 상한 40%' : ''}`,
        target: 'perf',
        perfId: p.id,
      })
    }
  }

  /* 3. 서술·논술 합계 ≥ 30% — 1단위 과목·수행 80% 이상이면 면제(점검표) */
  if (!essayExempt(plan)) {
    const essay = essayTotal(plan, plan.exam_ratio)
    if (essay < rules.essay_min - 0.001) {
      fail(3, {
        title: `서술·논술 합계가 ${rules.essay_min}%에 못 미칩니다`,
        detail: `지필 서술형 + 수행 논술형 = ${essay.toFixed(1)}%`,
        target: 'essay',
      })
    }
  }

  for (const p of plan.performances) {
    const label = p.name || '(이름 없음)'

    /* 4. 기본점수 = 영역 만점의 20% 이상 ~ 40% 미만 */
    if (p.max_score > 0) {
      const pct = (p.base_score / p.max_score) * 100
      if (pct < rules.base_score_min || pct >= rules.base_score_max) {
        fail(4, {
          title: '기본점수가 허용 범위를 벗어납니다',
          detail: `${label} · 기본점수 ${p.base_score}점 · 만점 ${p.max_score}점의 ${pct.toFixed(0)}% (${rules.base_score_min}% 이상 ~ ${rules.base_score_max}% 미만)`,
          target: 'perf',
          perfId: p.id,
        })
      }
    }

    /* 5. 기본점수 > 1점 */
    if (p.base_score <= 1) {
      fail(5, {
        title: '기본점수가 1점을 넘지 않습니다',
        detail: `${label} · 기본점수 ${p.base_score}점`,
        target: 'perf',
        perfId: p.id,
      })
    }

    /* 6. 영역 만점 = 반영 비율과 일치 */
    if (p.max_score !== p.ratio) {
      fail(6, {
        title: '영역 만점이 반영 비율과 다릅니다',
        detail: `${label} · 반영 비율 ${p.ratio}% · 영역 만점 ${p.max_score}점`,
        target: 'perf',
        perfId: p.id,
      })
    }

    /* 7. 루브릭 배점 합 = 영역 만점 */
    const rmax = rubricMax(p)
    if (p.rubric.length === 0) {
      fail(7, {
        title: '루브릭이 없습니다',
        detail: `${label} · 평가 요소를 하나 이상 넣으세요`,
        target: 'perf',
        perfId: p.id,
      })
    } else if (rmax !== p.max_score) {
      fail(7, {
        title: '루브릭 배점 합이 영역 만점과 다릅니다',
        detail: `${label} · 배점 합 ${rmax}점 · 영역 만점 ${p.max_score}점`,
        target: 'perf',
        perfId: p.id,
      })
    }

    /* 8. 수행평가별 성취기준 ≤ 6개 */
    if (p.standard_codes.length > rules.standards_per_perf_max) {
      fail(8, {
        title: `수행평가 하나에 성취기준이 ${rules.standards_per_perf_max}개를 넘습니다`,
        detail: `${label} · ${p.standard_codes.length}개 · 나이스 입력 한도`,
        target: 'perf',
        perfId: p.id,
      })
    }

    /* 12. 수행평가명 20자 이내 */
    if ([...p.name].length > rules.perf_name_maxlen) {
      fail(12, {
        title: `수행평가명이 ${rules.perf_name_maxlen}자를 넘습니다`,
        detail: `${label} · ${[...p.name].length}자`,
        target: 'perf',
        perfId: p.id,
      })
    }
  }

  /* 9. 성취기준 코드가 과목 목록에 실제 존재 */
  const known = new Set(subject.standards.map((s) => s.code))
  const ghosts = new Set<string>()
  for (const u of subject.units) for (const c of u.standard_codes) if (!known.has(c)) ghosts.add(c)
  for (const p of plan.performances)
    for (const c of p.standard_codes) if (!known.has(c)) ghosts.add(c)
  if (ghosts.size > 0) {
    fail(9, {
      title: '과목 목록에 없는 성취기준 코드가 있습니다',
      detail: [...ghosts].join(' · '),
      target: 'basic',
    })
  }

  /* 10. 모든 성취기준이 어느 주차엔가 배정됨 — 가장 중요한 규칙 */
  const placedCodes = new Set(Object.values(plan.distribution).flat())
  const unassignedStandards = subject.standards
    .map((s) => s.code)
    .filter((c) => !placedCodes.has(c))
  if (unassignedStandards.length > 0) {
    fail(10, {
      title: `배정되지 않은 성취기준 ${unassignedStandards.length}개`,
      detail: unassignedStandards.join(' · '),
      target: 'anchor',
    })
  }

  /* 11. 수행평가가 2회 정기시험 이전에 완료 */
  const lastExam = [...plan.exams].sort((a, b) => b.week - a.week)[0]
  if (lastExam) {
    const late = plan.performances.filter((p) => p.week > lastExam.week)
    if (late.length > 0) {
      fail(11, {
        title: `${lastExam.no}회 정기시험 뒤에 실시하는 수행평가가 있습니다`,
        detail: late.map((p) => `${p.name || '(이름 없음)'} ${p.week}주`).join(' · '),
        target: 'perf',
      })
    }
  }

  /* 13. 시험 범위 성취기준이 해당 시점까지 진도에 포함 */
  for (const e of plan.exams) {
    const range = examStandardCodes(subject, plan.exams, e.no)
    const taught = new Set(
      Object.entries(plan.distribution)
        .filter(([wk]) => Number(wk) <= e.week)
        .flatMap(([, codes]) => codes),
    )
    const missing = range.filter((c) => !taught.has(c))
    if (missing.length > 0) {
      fail(13, {
        title: `${e.no}회 정기시험 범위가 진도보다 앞섭니다`,
        detail: `${e.week}주까지 다루지 않는 성취기준 ${missing.length}개 · ${missing.join(' · ')}`,
        target: 'anchor',
      })
    }
  }

  /* 14. 평가 시기가 특정 주에 몰리지 않음 */
  const byWeek = new Map<number, string[]>()
  for (const p of plan.performances) {
    byWeek.set(p.week, [...(byWeek.get(p.week) ?? []), p.name || '(이름 없음)'])
  }
  for (const [wk, names] of byWeek) {
    if (names.length > 1) {
      fail(14, {
        title: `${wk}주에 수행평가가 ${names.length}개 몰려 있습니다`,
        detail: names.join(' · '),
        target: 'perf',
      })
    }
  }

  /* 15. 안내 주가 시험주·비수업주와 겹치지 않음 */
  const teachSet = new Set(teachingWeeks(weeks).map((w) => w.no))
  for (const p of plan.performances) {
    const nw = noticeWeek(p, rules.notice_lead_weeks)
    if (nw < 1) {
      fail(15, {
        title: '안내 주가 학기 시작 전입니다',
        detail: `${p.name || '(이름 없음)'} · 실시 ${p.week}주 · 안내 ${nw}주`,
        target: 'perf',
        perfId: p.id,
      })
    } else if (!teachSet.has(nw)) {
      const w = weeks.find((x) => x.no === nw)
      fail(15, {
        title: '안내 주가 시험주 또는 비수업주와 겹칩니다',
        detail: `${p.name || '(이름 없음)'} · 안내 ${nw}주${w?.is_exam ? ' (정기시험 주)' : ' (수업일 0)'}`,
        target: 'perf',
        perfId: p.id,
      })
    }
  }

  /* 16. 수행평가 성취기준이 실시 주까지의 진도에 포함 — 점검표 "실시일까지 진도가 나갔는지" */
  for (const p of plan.performances) {
    const taught = new Set(
      Object.entries(plan.distribution)
        .filter(([wk]) => Number(wk) <= p.week)
        .flatMap(([, codes]) => codes),
    )
    // distribution 어디에도 없는 코드는 규칙 10의 몫 — 여기서 또 알리면 이중 보고다
    const late = p.standard_codes.filter((c) => !taught.has(c) && placedCodes.has(c))
    if (late.length > 0) {
      const lastWeekOf = (c: string) =>
        Math.max(
          ...Object.entries(plan.distribution)
            .filter(([, codes]) => codes.includes(c))
            .map(([wk]) => Number(wk)),
        )
      const worst = late.reduce((a, b) => (lastWeekOf(a) >= lastWeekOf(b) ? a : b))
      const wk = lastWeekOf(worst)
      fail(16, {
        title: '수행평가 성취기준이 진도보다 앞섭니다',
        detail:
          `${p.name || '(이름 없음)'} · 실시 ${p.week}주(${monthWeekLabel(school, plan.semester, p.week)}) · ` +
          `가장 늦게 배우는 ${worst}는 ${wk}주(${monthWeekLabel(school, plan.semester, wk)})에 배웁니다 — ` +
          `실시 주차를 그 뒤로 옮기거나 성취기준을 바꾸세요`,
        target: 'perf',
        perfId: p.id,
      })
    }
  }

  /* 17. 수행평가 총 반영 비율 하한 — 40% 이상, 3학년 교과만 30% 이상(점검표) */
  const perfFloor = plan.grade === 3 ? 30 : 40
  if (plan.perf_ratio < perfFloor) {
    fail(17, {
      title: `수행평가 총 반영 비율이 ${perfFloor}%에 못 미칩니다`,
      detail: `수행평가 ${plan.perf_ratio}% · ${plan.grade}학년은 ${perfFloor}% 이상이어야 합니다`,
      target: 'perf',
    })
  }

  /* 18. 수행평가 2영역 이상(점검표) */
  if (plan.performances.length < 2) {
    fail(18, {
      title: '수행평가가 2영역 미만입니다',
      detail: `현재 ${plan.performances.length}개 · 서로 다른 영역 2개 이상으로 나누세요`,
      target: 'perf',
    })
  }

  /* 19. 수행평가 실시 창 — 1회 시험 2주 전부터 2회 시험 전까지(점검표). 2회 실시 과목만 */
  if (plan.exam_count === 2 && plan.exams.length >= 2) {
    const [e1, e2] = [...plan.exams].sort((a, b) => a.week - b.week)
    for (const p of plan.performances) {
      if (p.week < e1.week - 2 || p.week >= e2.week) {
        fail(19, {
          title: '수행평가 실시 시기가 권장 창을 벗어납니다',
          detail:
            `${p.name || '(이름 없음)'} · 실시 ${p.week}주 · ` +
            `1회 시험(${e1.week}주) 2주 전 ~ 2회 시험(${e2.week}주) 전 사이여야 합니다`,
          target: 'perf',
          perfId: p.id,
        })
      }
    }
  }

  const passed = Array.from({ length: RULE_COUNT }, (_, i) => i + 1).filter((n) => !failed.has(n))
  return { errors, ai: aiReview(plan, subject, school), passed, unassignedStandards }
}

/* ══════════════════════════════════════════════════════════
   AI 검증

   지금은 결정적 휴리스틱으로 돌아간다. 모델 호출로 바꾸려면
   이 함수만 교체하면 된다 — 반환 타입은 그대로 Issue[].
   ══════════════════════════════════════════════════════════ */

/** 지침에서 금지하는 수행평가명 유형 */
const BANNED_NAME_PATTERNS: { re: RegExp; why: string }[] = [
  { re: /주제\s*탐구\s*보고서/, why: '과제형 명칭' },
  { re: /^말하기$|^쓰기$|^읽기$|^듣기$/, why: '영역명만 쓴 명칭' },
  { re: /보고서\s*작성$/, why: '과제 제출물 명칭' },
  { re: /수행평가\s*\d*$/, why: '내용이 드러나지 않는 명칭' },
  { re: /과제/, why: '과제형 명칭' },
]

export function aiReview(plan: SemesterPlan, subject: Subject, school: SchoolLayer): Issue[] {
  const out: Issue[] = []

  for (const p of plan.performances) {
    const label = p.name || '(이름 없음)'

    // 금지 유형 명칭
    for (const b of BANNED_NAME_PATTERNS) {
      if (b.re.test(p.name)) {
        out.push({
          severity: 'ai',
          title: `수행평가명이 지침의 금지 유형에 가깝습니다 · ${label}`,
          detail: `${b.why}. 무엇을 어떻게 하는지가 드러나는 이름으로 바꾸세요.`,
          target: 'perf',
          perfId: p.id,
        })
        break
      }
    }

    // 루브릭 기준 서술이 배점 사이에서 구분되는가
    for (const r of p.rubric) {
      const texts = r.levels.map((l) => l.text.trim()).filter(Boolean)
      const uniq = new Set(texts)
      if (texts.length > 1 && uniq.size < texts.length) {
        out.push({
          severity: 'ai',
          title: `루브릭 기준 서술이 배점 사이에서 구분되지 않습니다 · ${r.element}`,
          detail: `${label} · 같은 문장이 두 배점에 쓰였습니다`,
          target: 'perf',
          perfId: p.id,
        })
      }
    }

    // 안내 주와의 준비 기간
    const nw = noticeWeek(p, school.rules.notice_lead_weeks)
    if (p.week - nw < 2) {
      out.push({
        severity: 'ai',
        title: `${p.week}주 수행평가가 안내 주차와 ${p.week - nw}주 차이입니다`,
        detail: '준비 기간이 짧습니다',
        target: 'perf',
        perfId: p.id,
      })
    }

    // 평가 요소가 성취기준을 실제로 측정하는가 — 성취기준이 비어 있으면 판단 불가
    if (p.standard_codes.length === 0 && p.rubric.length > 0) {
      out.push({
        severity: 'ai',
        title: `성취기준 없이 루브릭만 있습니다 · ${label}`,
        detail: '평가 요소가 무엇을 측정하는지 확인할 수 없습니다',
        target: 'perf',
        perfId: p.id,
      })
    }
  }

  // 성취기준이 수행평가와 정기시험 양쪽에 쓰였는가
  const examCodes = new Set(plan.exams.flatMap((e) => examStandardCodes(subject, plan.exams, e.no)))
  const seen = new Set<string>()
  for (const p of plan.performances) {
    for (const c of p.standard_codes) {
      if (examCodes.has(c) && !seen.has(c)) {
        seen.add(c)
        out.push({
          severity: 'ai',
          title: `성취기준 ${c}이 수행평가와 정기시험 양쪽에 쓰였습니다`,
          detail: `${p.name || '(이름 없음)'} · 중복 평가인지 확인하세요`,
          target: 'perf',
          perfId: p.id,
        })
      }
    }
  }

  return out
}

/*
 * 인간 확인 목록(HUMAN_CHECKS)은 지웠다 — 앱 안의 체크리스트 대신
 * hwpx의 빨간 글씨(AI 초안)와 배경색 칸(직접 채움)이 검토 장치다.
 */
