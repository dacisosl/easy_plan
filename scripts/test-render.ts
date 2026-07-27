/**
 * 렌더러 왕복 테스트 — 시드 데이터로 양식을 채워 본다.
 *
 *   npx tsx scripts/test-render.ts [출력경로] [--no-ai]
 *
 * 만들어진 파일은 반드시 한글에서 직접 열어 확인할 것.
 * 표 테두리·셀 높이·빨간 글씨·배경색이 진짜 기준이다.
 */

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { SCHOOL_SEED } from '../src/data/school'
import { PLAN_SEED, SUBJECT_SEED } from '../src/data/subject'
import { distributeUnits } from '../src/lib/derive'
import { renderForm } from '../src/lib/hwpx/renderForm'
import { fallbackSections, fallbackWeekly, fallbackPerf } from '../src/lib/aiDraft'
import type { AiDraft } from '../src/types'

const OUT = resolve(process.argv.find((a) => a.endsWith('.hwpx')) ?? 'out/test-render.hwpx')

async function main() {
  const template = new Uint8Array(await readFile(resolve('templates/form_2026.hwpx')))

  const plan = {
    ...PLAN_SEED,
    distribution: distributeUnits(SUBJECT_SEED.units, SCHOOL_SEED.calendar.weeks, PLAN_SEED.exams),
  }

  // 결정적 fallback을 그대로 AI 초안으로 쓴다 — 모델 없이 빨강 경로를 검증한다
  const ai: AiDraft | undefined = process.argv.includes('--no-ai')
    ? undefined
    : {
        model: 'fallback',
        created_at: '2026-07-27T00:00:00.000Z',
        fallback: true,
        input_hash: 'test',
        sections: fallbackSections(plan, SUBJECT_SEED, SCHOOL_SEED),
        weekly: fallbackWeekly(plan, SUBJECT_SEED, SCHOOL_SEED),
        perfs: Object.fromEntries(plan.performances.map((p) => [p.id, fallbackPerf(p)])),
        warnings: [],
      }

  const { bytes, report } = await renderForm(template, plan, SUBJECT_SEED, SCHOOL_SEED, ai)

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
