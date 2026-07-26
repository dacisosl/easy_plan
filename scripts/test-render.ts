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

const OUT = resolve(process.argv[2] ?? 'out/test-render.hwpx')

async function main() {
  const template = new Uint8Array(await readFile(resolve('templates/plan_blank.hwpx')))

  const plan = {
    ...PLAN_SEED,
    distribution: distributeUnits(SUBJECT_SEED.units, SCHOOL_SEED.calendar.weeks, PLAN_SEED.exams),
  }

  const { bytes, report } = await renderPlan(template, plan, SUBJECT_SEED, SCHOOL_SEED)

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
