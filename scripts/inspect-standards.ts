/**
 * 성취기준 xlsx 파서 점검 — 실제 파일로 파싱 규칙이 맞는지 확인한다.
 *
 *   npx tsx scripts/inspect-standards.ts [과목명]
 */

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import * as XLSX from 'xlsx'
import { extractSubject, listSubjects, parseStandardCell } from '../src/lib/importStandards'

const FILE = resolve('data/고등학교_성취기준_2022.xlsx')

async function main() {
  const wb = XLSX.read(await readFile(FILE), { type: 'buffer' })
  console.log(`시트: ${wb.SheetNames.join(' · ')}\n`)

  const ws = wb.Sheets['전체_성취기준']
  if (!ws) throw new Error("'전체_성취기준' 시트가 없습니다")

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
  console.log(`행 ${rows.length}개`)
  console.log(`열: ${Object.keys(rows[0]).join(' · ')}\n`)

  // 파싱 규칙 점검
  const parsed = rows.map((r) => parseStandardCell(String(r['성취기준'] ?? '')))
  const failed = parsed.filter((p) => !p).length
  console.log(`성취기준 셀 파싱 실패 ${failed}행 / ${rows.length}행`)

  const areaFilled = rows.filter((r) => String(r['영역(단원)'] ?? '').trim() !== '').length
  console.log(
    `영역(단원) 채워진 행 ${areaFilled} (${((areaFilled / rows.length) * 100).toFixed(1)}%)`,
  )

  const scales = new Map<string, number>()
  for (const r of rows) {
    const k = String(r['척도유형'] ?? '(빈칸)')
    scales.set(k, (scales.get(k) ?? 0) + 1)
  }
  console.log(`척도유형: ${[...scales].map(([k, v]) => `${k}=${v}`).join(' · ')}`)

  // LVL_4가 실제로 5칸을 다 쓰는지 — 열 이름에 괄호가 붙어 있어 접두로 찾는다
  const keyOf = (p: string) => Object.keys(rows[0]).find((k) => k.startsWith(p))!
  const lvl4 = rows.filter((r) => String(r['척도유형']) === 'LVL_4')
  if (lvl4.length) {
    const four = lvl4.filter((r) => String(r[keyOf('수준4')] ?? '').trim() !== '').length
    const five = lvl4.filter((r) => String(r[keyOf('수준5')] ?? '').trim() !== '').length
    console.log(`LVL_4 ${lvl4.length}행 중 수준4 채움 ${four} · 수준5 채움 ${five}`)
  }
  const l3 = rows.filter((r) => String(r['척도유형']).startsWith('3단계'))
  if (l3.length) {
    const four = l3.filter((r) => String(r[keyOf('수준4')] ?? '').trim() !== '').length
    console.log(`3단계 ${l3.length}행 중 수준4 채움 ${four} (0이어야 정상)`)
  }

  // 파싱 실패 행이 무엇인지 보여 준다
  rows.forEach((r, i) => {
    if (!parseStandardCell(String(r['성취기준'] ?? ''))) {
      const raw = String(r['성취기준'] ?? '').replace(/\s+/g, ' ').slice(0, 60)
      console.log(`  파싱 실패 ${i + 2}행 · ${r['과목']} · ${JSON.stringify(raw)}`)
    }
  })

  const subjects = listSubjects(wb)
  console.log(`\n과목 ${subjects.length}개`)

  const want = process.argv[2]
  const targets = want ? [want] : ['현대사회와 윤리', '미적분Ⅰ', '통합사회1', '과학탐구실험1']
  for (const name of targets) {
    const hit = subjects.find((s) => s === name) ?? subjects.find((s) => s.includes(name))
    if (!hit) {
      console.log(`\n— '${name}' 없음`)
      continue
    }
    const s = extractSubject(wb, hit)
    console.log(
      `\n— ${hit}: 접두 ${s.code_prefix} · 척도 ${s.scale_type} · 영역 ${s.areas.length}개 · 성취기준 ${s.standards.length}개`,
    )
    console.log(`   영역: ${s.areas.map((a) => `${a.no} ${a.name}`).join(' | ')}`)
    const f = s.standards[0]
    console.log(`   첫 성취기준 ${f.code} ${f.text.slice(0, 60)}`)
    console.log(`   수준 A: ${(f.levels.A ?? '').slice(0, 60)}`)
    console.log(`   수준 E: ${(f.levels.E ?? '(없음)').slice(0, 60)}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
