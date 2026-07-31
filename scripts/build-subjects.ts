/**
 * 성취기준 xlsx → 정적 JSON.
 *
 *   npx tsx scripts/build-subjects.ts
 *
 * 서버가 없다 — 정적 호스팅에서는 xlsx를 런타임에 읽을 곳이 없으므로,
 * 빌드 때 과목 전체를 JSON으로 구워 public/data/ 아래에 둔다.
 *   public/data/subjects.json          과목 이름 목록
 *   public/data/subjects/<이름>.json   과목 하나 (영역·성취기준·성취수준·단원)
 *
 * `npm run build`의 prebuild로 항상 실행된다 — xlsx를 갱신하면 다음 빌드에 반영된다.
 */

import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import * as XLSX from 'xlsx'
import { extractSubject, listSubjects, unitsFromAreas } from '../src/lib/importStandards'

const SRC = resolve('data', '고등학교_성취기준_2022.xlsx')
const OUT = resolve('public', 'data')

async function main() {
  // 양식도 정적 자산으로 — 브라우저가 받아서 조립한다 (원본은 templates/에 하나만 둔다)
  await copyFile(resolve('templates', 'form_2026.hwpx'), resolve('public', 'form_2026.hwpx'))

  const wb = XLSX.read(await readFile(SRC), { type: 'buffer' })
  const names = listSubjects(wb)

  await rm(OUT, { recursive: true, force: true })
  await mkdir(join(OUT, 'subjects'), { recursive: true })

  await writeFile(join(OUT, 'subjects.json'), JSON.stringify({ subjects: names }))

  let failed = 0
  for (const name of names) {
    try {
      const imported = extractSubject(wb, name)
      await writeFile(
        join(OUT, 'subjects', `${name}.json`),
        JSON.stringify({ ...imported, units: unitsFromAreas(imported) }),
      )
    } catch (e) {
      failed++
      console.error(`  ✗ ${name}: ${e instanceof Error ? e.message : e}`)
    }
  }
  console.log(`과목 ${names.length - failed}/${names.length}개 → public/data/subjects/`)
  if (failed > 0) process.exitCode = 1
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
