/**
 * samples/ 안의 실물 계획서를 한꺼번에 훑어 구조를 뽑는다.
 *
 *   npx tsx scripts/scan-samples.ts            # 요약만
 *   npx tsx scripts/scan-samples.ts --json     # out/sample-scan.json 까지
 *
 * 목적은 '몇 갈래냐'를 알아내는 것이다. 파일이 100개여도 실제 모양은
 * 대여섯 가지뿐이라, 같은 서명끼리 묶어 대표 하나씩만 들여다보면 된다.
 *
 * ★ 교사 실명은 뽑지 않는다. samples/ 는 git에서 제외돼 있고,
 *   여기서 나오는 산출물도 이름을 담지 않는다.
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { HwpxDoc, childrenOf } from '@/lib/hwpx/doc'

const SAMPLES = 'samples'
const ROMAN = ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ', 'Ⅶ', 'Ⅷ', 'Ⅸ', 'Ⅹ', 'Ⅺ', 'Ⅻ']

interface Scan {
  file: string
  /** 파일명에서 짐작한 것 — 문서 안에 학년·학기가 늘 있지는 않다 */
  guessed: { grade?: string; semester?: string; subject?: string }
  /** 문서에 실제로 있는 구역 머리 */
  sections: string[]
  tableCount: number
  /** Ⅳ 평가 계획 표 */
  iv: null | {
    colCnt: number
    /** 0행 그룹 머리 — 예: ["정기시험(60%)×3", "수행평가(40%)×2"] */
    groups: string[]
    /** 1행 항목 이름 수 */
    items: number
    /** 왼쪽 라벨 열 (평가 방법 · 영역 만점 …) */
    labels: string[]
  }
  /** Ⅴ 성취도 기준표 — 머리 글자로 종류를 가른다 */
  gradeTable: null | { head: string[]; rows: number }
  /** 진도표 */
  progress: null | { rows: number; head: string[] }
  /** 구조 서명 — 이게 같으면 같은 갈래다 */
  signature: string
  warnings: string[]
}

function scanOne(path: string, file: string): Scan {
  const warnings: string[] = []
  const out: Scan = {
    file,
    guessed: {},
    sections: [],
    tableCount: 0,
    iv: null,
    gradeTable: null,
    progress: null,
    signature: '',
    warnings,
  }

  // 파일명에서 학년·학기·과목 짐작 (예: 2026_2학년_1학기_미적분Ⅰ_…)
  out.guessed.grade = file.match(/([1-3])\s*학년/)?.[1]
  out.guessed.semester = file.match(/([12])\s*학기/)?.[1]
  const parts = file.replace(/\.hwpx$/i, '').split(/[_\s]+/)
  out.guessed.subject = parts.find(
    (p) => p.length >= 2 && !/^\d+$/.test(p) && !/학년|학기|계획|진도|평가|교과/.test(p),
  )

  let doc: HwpxDoc
  try {
    doc = loadedCache.get(path)!
  } catch {
    warnings.push('열지 못했습니다')
    return out
  }

  const tables = doc.topTables()
  out.tableCount = tables.length

  // 구역 머리 표: [Ⅳ][평가의 종류와 방법] 꼴
  for (const t of tables) {
    const a = doc.cellText(t, 0, 0)?.trim()
    if (a && ROMAN.includes(a)) out.sections.push(`${a} ${doc.cellText(t, 0, 1)?.trim() ?? ''}`)
  }

  /* Ⅳ 평가 계획 — '구분'으로 시작하고 6행 이상 */
  const iv = tables.find((t) => doc.cellText(t, 0, 0) === '구분' && doc.rows(t).length >= 6)
  if (iv) {
    const rows = doc.rows(iv)
    const span = (tc: Element) =>
      Number(childrenOf(tc, 'cellSpan')[0]?.getAttribute('colSpan') ?? '1')
    const col = (tc: Element) =>
      Number(childrenOf(tc, 'cellAddr')[0]?.getAttribute('colAddr') ?? '0')

    const groups = childrenOf(rows[0], 'tc')
      .filter((tc) => col(tc) >= 2 && span(tc) >= 1 && doc.textOf(tc) !== '비고')
      .filter((tc) => col(tc) >= 2)
      .map((tc) => `${doc.textOf(tc)}×${span(tc)}`)
      .filter((s) => !s.startsWith('×') && !s.startsWith('비고'))

    out.iv = {
      colCnt: Number(iv.getAttribute('colCnt') ?? '0'),
      groups,
      items: childrenOf(rows[1] ?? rows[0], 'tc').length,
      labels: rows
        .slice(2)
        .map((r) => {
          const c = childrenOf(r, 'tc').find((tc) => col(tc) === 1)
          return c ? doc.textOf(c) : ''
        })
        .filter(Boolean),
    }
  } else warnings.push('Ⅳ 평가 계획 표 없음')

  /* Ⅴ 성취도 기준표 — 머리가 '성취도'이거나 P/F 표 */
  const grade = tables.find(
    (t) =>
      doc.cellText(t, 0, 1) === '성취도' ||
      ((doc.cellText(t, 0, 0) ?? '').includes('이수(P)') && doc.rows(t).length === 2),
  )
  if (grade) out.gradeTable = { head: doc.headOf(grade), rows: doc.rows(grade).length }

  /* 진도표 — 머리에 '주'와 '기간'이 있는 큰 표 */
  const prog = tables.find((t) => {
    const h = doc.headOf(t).join(' ')
    return h.includes('주') && (h.includes('기간') || h.includes('단원')) && doc.rows(t).length > 10
  })
  if (prog) out.progress = { rows: doc.rows(prog).length, head: doc.headOf(prog) }

  out.signature = [
    `Ⅳ:${out.iv ? `${out.iv.colCnt}열/${out.iv.groups.join('+') || '?'}` : '없음'}`,
    `Ⅴ:${out.gradeTable ? out.gradeTable.head.join('|').slice(0, 24) : '없음'}`,
    `진도:${out.progress ? `${out.progress.rows}행` : '없음'}`,
    `구역:${out.sections.length}`,
  ].join(' · ')

  return out
}

const loadedCache = new Map<string, HwpxDoc>()

async function main() {
  if (!existsSync(SAMPLES)) {
    console.log(`${SAMPLES}/ 가 없습니다. 실물 계획서를 거기 넣고 다시 실행하세요.`)
    return
  }
  const files = readdirSync(SAMPLES).filter((f) => f.toLowerCase().endsWith('.hwpx'))
  if (files.length === 0) {
    console.log(`${SAMPLES}/ 에 .hwpx 가 없습니다.`)
    return
  }

  const scans: Scan[] = []
  for (const f of files) {
    const path = join(SAMPLES, f)
    try {
      loadedCache.set(path, await HwpxDoc.load(readFileSync(path)))
      scans.push(scanOne(path, f))
    } catch (e) {
      scans.push({
        file: f,
        guessed: {},
        sections: [],
        tableCount: 0,
        iv: null,
        gradeTable: null,
        progress: null,
        signature: '(열지 못함)',
        warnings: [e instanceof Error ? e.message : String(e)],
      })
    }
    loadedCache.delete(path) // 메모리에 다 들고 있지 않는다
  }

  /* 같은 서명끼리 묶는다 — 이게 이 스크립트의 요점이다 */
  const byShape = new Map<string, Scan[]>()
  for (const s of scans) {
    const list = byShape.get(s.signature) ?? []
    list.push(s)
    byShape.set(s.signature, list)
  }

  console.log(`\n파일 ${scans.length}개 · 구조 ${byShape.size}갈래\n`)
  const sorted = [...byShape.entries()].sort((a, b) => b[1].length - a[1].length)
  sorted.forEach(([sig, list], i) => {
    console.log(`[${i + 1}] ${list.length}개 — ${sig}`)
    console.log(`     대표: ${list[0].file}`)
    if (list[0].iv) console.log(`     Ⅳ 라벨: ${list[0].iv.labels.join(' / ')}`)
    const others = list.slice(1, 4).map((s) => s.file)
    if (others.length) console.log(`     그 외: ${others.join(', ')}${list.length > 4 ? ' …' : ''}`)
    console.log()
  })

  const bad = scans.filter((s) => s.warnings.length > 0)
  if (bad.length) {
    console.log(`※ 경고 ${bad.length}개`)
    for (const s of bad.slice(0, 10)) console.log(`   ${s.file}: ${s.warnings.join(' / ')}`)
  }

  if (process.argv.includes('--json')) {
    mkdirSync('out', { recursive: true })
    writeFileSync('out/sample-scan.json', JSON.stringify(scans, null, 2), 'utf8')
    console.log('\n→ out/sample-scan.json')
  }
}

main()
