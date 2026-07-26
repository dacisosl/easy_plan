/**
 * data/고등학교_성취기준_2022.xlsx → src/data/subject.seed.json
 *
 * 과목 레이어의 '영역 · 성취기준 · 성취수준'만 원본에서 굽는다.
 * 지어낸 문장을 시드로 넣지 않기 위해서다.
 * 단원 매핑 · 과목 목표 · 교수학습 운영계획은 파일에 없으므로 subject.ts에 남는다.
 *
 *   npm run seed:subject               (기본: 현대사회와 윤리)
 *   npm run seed:subject -- "미적분Ⅰ"
 */

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import * as XLSX from 'xlsx'
import { extractSubject, listSubjects } from '../src/lib/importStandards'

const FILE = resolve('data/고등학교_성취기준_2022.xlsx')
const OUT = resolve('src/data/subject.seed.json')

async function main() {
  const want = process.argv[2] ?? '현대사회와 윤리'
  const wb = XLSX.read(await readFile(FILE), { type: 'buffer' })
  const names = listSubjects(wb)
  const hit = names.find((n) => n === want) ?? names.find((n) => n.includes(want))
  if (!hit) throw new Error(`'${want}' 과목이 파일에 없습니다`)

  const s = extractSubject(wb, hit)
  await writeFile(OUT, JSON.stringify(s, null, 2) + '\n', 'utf8')

  const withLevels = s.standards.filter((x) => (x.levels.A ?? '') !== '').length
  console.log(
    `✓ ${OUT}\n  ${hit} · 접두 ${s.code_prefix} · 척도 ${s.scale_type}\n` +
      `  영역 ${s.areas.length}개 · 성취기준 ${s.standards.length}개 · 성취수준 채워진 것 ${withLevels}개`,
  )
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
