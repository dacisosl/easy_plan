/**
 * 간단 경로 회귀 — Generating 화면이 하는 일을 그대로 재현한다.
 *
 * 과목(물리학, 단원 매핑 없음 → 영역 기반 단원) + 간단 입력 → autofill →
 * 로직 15개 규칙이 전부 통과하는지 확인한다.
 *
 *   npx tsx scripts/test-simple-flow.ts
 */

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import * as XLSX from 'xlsx'
import { extractSubject, unitsFromAreas } from '../src/lib/importStandards'
import { autofill } from '../src/lib/autofill'
import { distributeUnits, monthWeekLabel, weekNoFromMonthWeek } from '../src/lib/derive'
import { validate } from '../src/lib/validate'
import { SCHOOL_SEED } from '../src/data/school'
import type { SemesterPlan, Subject } from '../src/types'

async function main() {
  const wb = XLSX.read(await readFile(resolve('data/고등학교_성취기준_2022.xlsx')), {
    type: 'buffer',
  })
  const imported = extractSubject(wb, '물리학')
  const units = unitsFromAreas(imported)
  console.log(`물리학 · 영역 ${imported.areas.length} → 단원 ${units.length} · 성취기준 ${imported.standards.length}`)

  const subject: Subject = {
    id: 'subj-test',
    name: imported.name,
    code_prefix: imported.code_prefix,
    type: 'elective',
    is_common: false,
    objectives: '',
    scale_type: imported.scale_type,
    teaching_plan: '',
    areas: imported.areas,
    standards: imported.standards,
    units,
    semester_levels: {},
    min_level: null,
  }

  const exams: SemesterPlan['exams'] = [
    { no: 1, week: 8, anchor_unit: units[0].id, parts: [{ kind: '선택형', count: 20, points: 70 }, { kind: '서술형', count: 5, points: 30 }] },
    { no: 2, week: 18, anchor_unit: units[units.length - 1].id, parts: [{ kind: '선택형', count: 20, points: 70 }, { kind: '서술형', count: 5, points: 30 }] },
  ]

  const base: SemesterPlan = {
    id: 'plan-test',
    subject_id: subject.id,
    grade: 2,
    credit: 4,
    teachers: ['테스트'],
    split_score_type: '추정',
    exam_count: 2,
    exams,
    performances: [],
    distribution: distributeUnits(units, SCHOOL_SEED.calendar.weeks, exams),
    mode: '간단',
    step: 1,
    updated_at: new Date().toISOString(),
  }

  // 월주 라벨 왕복 확인
  const label = monthWeekLabel(SCHOOL_SEED, 12)
  const back = weekNoFromMonthWeek(SCHOOL_SEED, label)
  console.log(`월주 왕복: 12주 → '${label}' → ${back}주 ${back === 12 ? '✓' : '✗'}`)
  if (back !== 12) process.exit(1)

  const filled = autofill(base, subject, SCHOOL_SEED, [
    { date: '', week: 12, name: '역학 실험 보고 발표', intent: '역학 실험을 수행하고 결과를 분석해 발표하게 하고 싶다' },
    { date: '', week: null, name: '전자기 개념 글쓰기', intent: '전기와 자기 개념을 실생활 사례에 적용해 근거를 들어 서술하게 하고 싶다' },
  ])

  for (const p of filled.performances) {
    console.log(
      `  ${p.name}: ${p.week}주(${monthWeekLabel(SCHOOL_SEED, p.week)}) · ${p.method} · ${p.ratio}% · 기본 ${p.base_score}점 · 성취기준 ${p.standard_codes.length} · 루브릭 ${p.rubric.length}행`,
    )
  }

  const result = validate(filled, subject, SCHOOL_SEED)
  console.log(`\n로직 검증: 통과 ${result.passed.length} / 15 · 오류 ${result.errors.length}`)
  for (const e of result.errors) console.log(`  ✗ [규칙 ${e.rule}] ${e.title} — ${e.detail}`)

  process.exit(result.errors.length === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
