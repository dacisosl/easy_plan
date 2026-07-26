/**
 * 렌더러 왕복 테스트 — 시드 데이터로 완성본을 만들어 구조를 확인한다.
 *
 *   npx tsx scripts/test-render.ts [출력경로]
 *
 * 만들어진 파일은 반드시 한글에서 직접 열어 표 테두리와 셀 높이를 확인할 것.
 * zip 무결성과 XML 파싱만으로는 부족하다.
 */

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { SCHOOL_SEED } from '../src/data/school'
import { PLAN_SEED, SUBJECT_SEED } from '../src/data/subject'
import { distributeUnits } from '../src/lib/derive'
import { renderPlan } from '../src/lib/hwpx/render'
import type { AiDraft } from '../src/types'

const OUT = resolve(process.argv[2] ?? 'out/test-render.hwpx')

/** 가짜 AI 초안 — 빨강·배경색 렌더 경로를 AI 없이 검증한다 */
function fakeAiDraft(): AiDraft {
  const weekly: AiDraft['weekly'] = {}
  for (const w of SCHOOL_SEED.calendar.weeks) {
    if (!w.is_exam) weekly[w.no] = [`[모둠협력수업] ${w.no}주차 쟁점 자료를 읽고 토의한다.`]
  }
  return {
    model: 'fake',
    created_at: '2026-07-26T00:00:00.000Z',
    fallback: false,
    input_hash: 'fake',
    sections: {
      I: ['쟁점 중심으로 자료 탐구와 토의, 글쓰기를 잇는다.', '지도교사 2인이 같은 기준을 적용한다.'],
      II: ['성취기준 도달 정도를 확인한다.', '학습 개선 피드백을 제공한다.'],
      IX: ['결과 분석을 학습 지도 계획에 반영한다.', '모니터링 결과를 다음 계획에 반영한다.'],
      X: ['원격 전환 시 평가 일정을 심의로 조정한다.', '직접 관찰한 활동만 평가에 반영한다.'],
    },
    weekly,
    perfs: Object.fromEntries(
      PLAN_SEED.performances.map((p) => [
        p.id,
        {
          activity: `[AI 초안] ${p.name}의 수행 활동 과정.`,
          rubric:
            p.rubric.length > 0
              ? p.rubric
              : [
                  {
                    id: 'ai-r1',
                    area: '참여',
                    element: '토론 참여하기',
                    levels: [
                      { score: 5, text: '상대 주장을 듣고 근거를 들어 반박함' },
                      { score: 3.5, text: '자기 주장은 말하나 반응이 적음' },
                      { score: 2, text: '발언이 거의 없음' },
                    ],
                  },
                  {
                    id: 'ai-r2',
                    area: '표현',
                    element: '근거 제시하기',
                    levels: [
                      { score: 5, text: '주장마다 근거를 붙여 말함' },
                      { score: 3.5, text: '일부 주장에만 근거를 붙임' },
                      { score: 2, text: '근거 없이 주장만 말함' },
                    ],
                  },
                ],
        },
      ]),
    ),
    warnings: [],
  }
}

async function main() {
  const template = new Uint8Array(await readFile(resolve('templates/plan_blank.hwpx')))

  const plan = {
    ...PLAN_SEED,
    distribution: distributeUnits(SUBJECT_SEED.units, SCHOOL_SEED.calendar.weeks, PLAN_SEED.exams),
  }

  const ai = process.argv.includes('--no-ai') ? undefined : fakeAiDraft()
  const { bytes, report } = await renderPlan(template, plan, SUBJECT_SEED, SCHOOL_SEED, ai)

  console.log('\n채운 것')
  for (const f of report.filled) console.log(`  ✓ ${f}`)
  if (report.warnings.length) {
    console.log('\n경고')
    for (const w of report.warnings) console.log(`  ! ${w}`)
  }

  await writeFile(OUT, bytes)
  console.log(`\n→ ${OUT}  (${(bytes.length / 1024).toFixed(1)} KB)`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
