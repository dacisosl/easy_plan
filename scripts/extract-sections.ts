/**
 * samples/ 의 실물 계획서에서 '문장을 배울 구역'만 뽑아 모은다.
 *
 *   npx tsx scripts/extract-sections.ts
 *
 * 뽑는 곳 (그 밖은 건드리지 않는다):
 *   Ⅰ   교수학습 운영계획      — 내용과 구조(교사별로 나뉘는지)
 *   Ⅱ   평가의 목적            — 가~마
 *   Ⅲ-1 평가의 기본 방향과 지침 — 가~라
 *   Ⅳ   평가의 종류와 방법      — 표 모양 (정기시험 횟수·수행평가 수에 따라)
 *   Ⅺ   성취기준 및 성취수준 나 — 학기단위 성취수준
 *
 * Ⅵ 수행평가 세부기준(루브릭)은 일부러 건너뛴다 — 교사가 한글에서 직접 고치는
 * 자리라 본보기를 모을 이유가 없다.
 *
 * ★ 교사 실명은 지운다. 산출물(out/)도 저장소에 올리지 않는다.
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { HwpxDoc, childrenOf } from '@/lib/hwpx/doc'

const SAMPLES = 'samples'

/** 흔한 개인정보 자국을 지운다 — 이름은 문장 틀에 필요 없다 */
function scrub(s: string): string {
  return s
    .replace(/\[[^\]]{2,4}\]\s*/g, '') // [김서연] 같은 교사 표시
    .replace(/[가-힣]{2,4}\s*(선생님|교사|T)\b/g, '(교사)')
    .replace(/\s+/g, ' ')
    .trim()
}

interface Doc {
  file: string
  I: { blocks: string[]; splitByTeacher: boolean }
  II: string[]
  III1: string[]
  IV: { colCnt: number; groups: string[]; exams: number; perfs: number } | null
  XI_semesterLevels: Record<string, string>
  warnings: string[]
}

async function extract(path: string, file: string): Promise<Doc> {
  const warnings: string[] = []
  const doc = await HwpxDoc.load(readFileSync(path))
  const tables = doc.topTables()
  const tops = doc.topParas()

  const sectionTable = (roman: string) =>
    tables.find((t) => doc.cellText(t, 0, 0) === roman && doc.rows(t).length === 1)
  const paraOf = (node: Element): Element | null => {
    let n: Node | null = node
    while (n && !tops.includes(n as Element)) n = n.parentNode
    return (n as Element) ?? null
  }
  const between = (from: string, to: string): Element[] => {
    const a = sectionTable(from)
    if (!a) return []
    const b = sectionTable(to)
    const i = tops.indexOf(paraOf(a)!)
    const j = b ? tops.indexOf(paraOf(b)!) : tops.length
    return tops.slice(i + 1, j < 0 ? tops.length : j)
  }
  /** '가.' '나.' … 로 시작하는 항목만 순서대로 */
  const items = (scope: Element[]): string[] =>
    scope
      .map((p) => scrub(doc.paraText(p)))
      .filter((t) => /^[가-하]\.\s*\S/.test(t))

  /*
   * Ⅰ 교수학습 운영계획.
   * 실물에서는 이 구역이 진도표 하나로 끝나고 서술 문단이 없다. 서술이 붙는
   * 학교도 있는지 알아야 하므로, 진도표 밖의 문단만 따로 센다.
   */
  const one = between('Ⅰ', 'Ⅱ')
  const IBlocks = one
    .filter((p) => p.getElementsByTagName('hp:tbl').length === 0)
    .map((p) => scrub(doc.paraText(p)))
    .filter((t) => t.length > 10 && !t.startsWith('※'))
  const splitByTeacher = false

  /* ── Ⅱ 평가의 목적 ── */
  const II = items(between('Ⅱ', 'Ⅲ'))
  if (II.length === 0) warnings.push('Ⅱ 항목을 못 찾음')

  /* ── Ⅲ-1 평가의 기본 방향 ── */
  const three = between('Ⅲ', 'Ⅳ')
  const cut = three.findIndex((p) => /^2\.\s*평가의 방침/.test(doc.paraText(p).trim()))
  const III1 = items(cut < 0 ? three : three.slice(0, cut))
  if (III1.length === 0) warnings.push('Ⅲ-1 항목을 못 찾음')

  /* ── Ⅳ 평가의 종류와 방법 — 표 모양 ── */
  // Ⅷ 결시생 표도 '구분'으로 시작한다 — 열 수로 가른다
  const iv = tables.find(
    (t) =>
      doc.cellText(t, 0, 0) === '구분' &&
      doc.rows(t).length >= 6 &&
      Number(t.getAttribute('colCnt') ?? '0') >= 5,
  )
  let IV: Doc['IV'] = null
  if (iv) {
    const row0 = doc.rows(iv)[0]
    const span = (tc: Element) =>
      Number(childrenOf(tc, 'cellSpan')[0]?.getAttribute('colSpan') ?? '1')
    const col = (tc: Element) =>
      Number(childrenOf(tc, 'cellAddr')[0]?.getAttribute('colAddr') ?? '0')
    const colCnt = Number(iv.getAttribute('colCnt') ?? '0')
    const groups = childrenOf(row0, 'tc')
      .filter((tc) => col(tc) >= 2 && col(tc) < colCnt - 1)
      .map((tc) => `${doc.textOf(tc)}×${span(tc)}`)
    const g = (kw: string) => {
      const hit = childrenOf(row0, 'tc').find((tc) => doc.textOf(tc).includes(kw))
      return hit ? span(hit) : 0
    }
    IV = { colCnt, groups, exams: g('정기시험'), perfs: g('수행평가') }
  } else warnings.push('Ⅳ 표를 못 찾음')

  /* ── Ⅺ 나. 학기단위 성취수준 ── */
  const XI_semesterLevels: Record<string, string> = {}
  // 머리가 '성취수준 | 학기단위 성취수준'인 표. 성취기준별 표(61행)와 헷갈리면 안 된다.
  const lv = tables.find((t) => doc.headOf(t).join(' ').includes('학기단위'))
  if (lv) {
    for (const r of doc.rows(lv)) {
      const cs = childrenOf(r, 'tc')
      const key = doc.textOf(cs[0] ?? r).trim()
      if (cs[1] && (/^[A-E]$/.test(key) || key.startsWith('최소'))) {
        XI_semesterLevels[key] = scrub(doc.textOf(cs[1]))
      }
    }
  }
  if (Object.keys(XI_semesterLevels).length === 0) warnings.push('Ⅺ 학기단위 성취수준을 못 찾음')

  return { file, I: { blocks: IBlocks, splitByTeacher }, II, III1, IV, XI_semesterLevels, warnings }
}

async function main() {
  if (!existsSync(SAMPLES)) return console.log(`${SAMPLES}/ 가 없습니다.`)
  const files = readdirSync(SAMPLES).filter((f) => f.toLowerCase().endsWith('.hwpx'))
  if (files.length === 0) return console.log(`${SAMPLES}/ 에 .hwpx 가 없습니다.`)

  const docs: Doc[] = []
  for (const f of files) {
    try {
      docs.push(await extract(join(SAMPLES, f), f))
    } catch (e) {
      console.log(`  ✗ ${f}: ${e instanceof Error ? e.message : e}`)
    }
  }

  /* 항목 수 분포 — '가~마 다섯 개'가 맞는지부터 사실로 확인한다 */
  const dist = (name: string, counts: number[]) => {
    const tally = new Map<number, number>()
    for (const c of counts) tally.set(c, (tally.get(c) ?? 0) + 1)
    const s = [...tally.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([n, c]) => `${n}개:${c}건`)
      .join('  ')
    console.log(`${name} 항목 수 — ${s}`)
  }

  console.log(`\n파일 ${docs.length}개\n`)
  dist('Ⅱ  평가의 목적   ', docs.map((d) => d.II.length))
  dist('Ⅲ-1 기본 방향    ', docs.map((d) => d.III1.length))
  dist('Ⅰ  교수학습 문단 ', docs.map((d) => d.I.blocks.length))
  console.log(
    `Ⅰ 교사별 분할: ${docs.filter((d) => d.I.splitByTeacher).length}건 / ${docs.length}건`,
  )

  /* Ⅳ 표 모양 — 정기시험·수행평가 열이 어떻게 갈리는지 */
  const shapes = new Map<string, number>()
  for (const d of docs) {
    if (!d.IV) continue
    const k = `${d.IV.colCnt}열 · 정기 ${d.IV.exams} · 수행 ${d.IV.perfs}`
    shapes.set(k, (shapes.get(k) ?? 0) + 1)
  }
  console.log('\nⅣ 표 모양')
  for (const [k, n] of [...shapes].sort((a, b) => b[1] - a[1])) console.log(`  ${k} — ${n}건`)

  mkdirSync('out', { recursive: true })
  writeFileSync('out/sections.json', JSON.stringify(docs, null, 2), 'utf8')

  /* 문장만 따로 모아 둔다 — 중복은 접는다 */
  const bag = (key: 'II' | 'III1') => {
    const seen = new Map<string, number>()
    for (const d of docs) {
      for (const t of d[key]) {
        const norm = t.replace(/^[가-하]\.\s*/, '')
        seen.set(norm, (seen.get(norm) ?? 0) + 1)
      }
    }
    return [...seen.entries()].sort((a, b) => b[1] - a[1])
  }
  const lines = [
    '# Ⅱ 평가의 목적',
    ...bag('II').map(([t, n]) => `(${n}회) ${t}`),
    '',
    '# Ⅲ-1 평가의 기본 방향과 지침',
    ...bag('III1').map(([t, n]) => `(${n}회) ${t}`),
  ]
  writeFileSync('out/sentences.md', lines.join('\n'), 'utf8')
  console.log('\n→ out/sections.json · out/sentences.md')

  const bad = docs.filter((d) => d.warnings.length)
  if (bad.length) {
    console.log(`\n※ 경고 ${bad.length}건`)
    for (const d of bad.slice(0, 8)) console.log(`   ${d.file}: ${d.warnings.join(' / ')}`)
  }
}

main()
