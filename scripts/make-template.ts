/**
 * templates/reference.hwpx (미적분Ⅰ 완성본) → templates/plan_blank.hwpx
 *
 * 예시 내용만 걷어내고 서식·표 구조·병합은 그대로 남긴다.
 * 반복되는 표(수행평가 세부기준 · Ⅺ 성취수준)는 한 벌만 남겨 렌더러가 복제하도록 한다.
 *
 *   npm run template
 */

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { HwpxDoc, childrenOf } from '../src/lib/hwpx/doc'

const REF = resolve('templates/reference.hwpx')
const OUT = resolve('templates/plan_blank.hwpx')

const log: string[] = []
const note = (s: string) => {
  log.push(s)
  console.log('  ' + s)
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`템플릿 생성 중단 — ${msg}\n참조 파일이 예상과 다릅니다.`)
}

async function main() {
  const doc = await HwpxDoc.load(await readFile(REF))
  const tables = doc.topTables()
  note(`최상위 표 ${tables.length}개`)
  assert(tables.length === 23, `표가 23개여야 하는데 ${tables.length}개입니다`)

  const find = (pred: (head: string[], t: Element) => boolean, what: string) => {
    const t = tables.find((x) => pred(doc.headOf(x), x))
    assert(t, `'${what}' 표를 찾지 못했습니다`)
    return t
  }

  /* ── 표지 · 대상 학년 ─────────────────────── */
  const cover = tables[0]
  doc.setCell(cover, 1, 0, ['2026학년도 ○학년 ○학기 < 과목명 >', '교수학습 및 평가 운영계획'])
  doc.setCell(tables[1], 0, 0, '◆ 대상 학년 : ○학년 (1반 ~ ○반)  ◆ 학점 : ○학점  ◆ 지도 교사 :   (인)')
  note('표지 · 대상 학년 자리표시자로')

  /* ── 진도표 ───────────────────────────────── */
  const progress = find((h) => h[0] === '주' && h[1] === '기간', '진도표')
  const pRows = doc.rows(progress).length
  for (let r = 1; r < pRows; r++) {
    for (let c = 0; c < 7; c++) doc.setCell(progress, r, c, '')
  }
  note(`진도표 ${pRows - 1}행 비움`)

  /* ── Ⅳ 평가 계획 ──────────────────────────── */
  const evalTbl = find((h) => h[0] === '구분' && h.some((x) => x.includes('평가영역')), 'Ⅳ 평가 계획')
  // 병합 때문에 행마다 <tc> 개수가 다르다. 인덱스로 라벨을 판정하면 어긋난다.
  // 남길 글자를 이름으로 정해 둔다.
  const EVAL_LABELS = new Set([
    '구분',
    '평가영역',
    '비고',
    '1학기',
    '평가 방법',
    '영역 만점',
    '반영 비율',
    '서술형･논술형',
    '서술형·논술형',
    '성취 기준',
    '평가 시기',
  ])
  doc.rows(evalTbl).forEach((tr, ri) => {
    childrenOf(tr, 'tc').forEach((_, ci) => {
      const txt = (doc.cellText(evalTbl, ri, ci) ?? '').trim()
      if (!EVAL_LABELS.has(txt)) doc.setCell(evalTbl, ri, ci, '')
    })
  })
  note('Ⅳ 평가 계획 값 비움 (라벨만 유지)')

  /* ── 수행평가 세부기준 — 한 벌만 남긴다 ──── */
  const perfTables = tables.filter(
    (t) => doc.cellText(t, 0, 0) === '성취기준' && doc.cellText(t, 1, 0) === '수행 활동 과정',
  )
  assert(perfTables.length >= 1, '수행평가 세부기준 표를 찾지 못했습니다')
  for (const extra of perfTables.slice(1)) doc.removeTable(extra)
  const perf = perfTables[0]
  const perfRows = doc.rows(perf).length
  for (let r = 0; r < perfRows; r++) {
    const cols = childrenOf(doc.rows(perf)[r], 'tc').length
    for (let c = 0; c < cols; c++) {
      const txt = doc.cellText(perf, r, c) ?? ''
      // 고정 라벨(성취기준·수행 활동 과정·평가 방법·평가 영역·평가요소·채점 기준…·평가척도·비고)은 남긴다
      const fixed =
        ['성취기준', '수행 활동 과정', '평가 방법', '평가 영역', '평가요소', '평가척도', '비고'].includes(txt) ||
        txt.startsWith('채점 기준')
      if (!fixed) doc.setCell(perf, r, c, '')
    }
  }
  // 체크박스 줄은 renderer가 다시 쓰되, 모양은 남겨 둔다
  doc.setCell(perf, 2, 2, '□서술·논술 □구술·발표 □토의·토론 □프로젝트 □실험·실습 □포트폴리오 □기타(          )')
  note(`수행평가 세부기준 1벌 유지 (${perfRows}행) · 나머지 ${perfTables.length - 1}벌 제거`)

  /* ── Ⅺ 성취기준별 성취수준 — 한 벌만, 블록 1개만 ── */
  const stdTables = tables.filter(
    (t) => doc.cellText(t, 0, 0) === '성취기준' && (doc.cellText(t, 0, 1) ?? '').includes('성취기준별'),
  )
  assert(stdTables.length >= 1, 'Ⅺ 성취수준 표를 찾지 못했습니다')
  for (const extra of stdTables.slice(1)) doc.removeTable(extra)
  const std = stdTables[0]
  doc.repeatRowBlock(std, 1, 5, 1) // 머리 1행 + A~E 블록 1개
  for (let r = 1; r <= 5; r++) {
    doc.setCell(std, r, 0, '')
    const cols = childrenOf(doc.rows(std)[r], 'tc').length
    doc.setCell(std, r, cols - 1, '')
  }
  note(`Ⅺ 성취수준 1벌 · 블록 1개(6행) 유지 · 나머지 ${stdTables.length - 1}벌 제거`)

  /* ── 학기단위 성취수준 ────────────────────── */
  const semTbl = find((h) => h[0] === '성취수준' && h[1] === '학기단위 성취수준', '학기단위 성취수준')
  for (let r = 1; r < doc.rows(semTbl).length; r++) doc.setCell(semTbl, r, 1, '')
  note('학기단위 성취수준 비움')

  /* ── 본문 문단 — 한 문단만 자리표시자로 남긴다 ── */
  const tops = doc.topParas()
  const textAt = (i: number) => doc.paraText(tops[i]).trim()

  /** 항목 문단(가. 나. 다. …) 묶음의 기본 이어짐 조건 */
  const isItem = (s: string) => /^[가-힣]\.\s?/.test(s)

  /** 조건에 맞는 문단 묶음을 첫 문단 하나로 줄인다 */
  const collapse = (
    startPred: (s: string) => boolean,
    label: string,
    contPred: (s: string) => boolean = isItem,
  ) => {
    const first = tops.findIndex((p) => startPred(doc.paraText(p).trim()))
    if (first < 0) {
      note(`· '${label}' 문단을 찾지 못해 건너뜀`)
      return
    }
    const group: Element[] = []
    for (let i = first; i < tops.length; i++) {
      const s = textAt(i)
      if (s === '') break
      if (i > first && !contPred(s)) break
      group.push(tops[i])
    }
    if (group.length === 0) return
    doc.setPara(group[0], '')
    for (const p of group.slice(1)) doc.remove(p)
    note(`${label} 문단 ${group.length}개 → 1개`)
  }

  // Ⅰ은 항목 기호 없는 평문이 이어진다. ※ 안내문 앞까지 걷어낸다.
  collapse(
    (s) => s.startsWith('미적분Ⅰ은 함수의 극한'),
    'Ⅰ 교수학습',
    (s) => !s.startsWith('※'),
  )
  collapse((s) => s.startsWith('가. 미적분의 기본 개념'), 'Ⅱ 평가의 목적')
  collapse((s) => s.startsWith('가. 미적분Ⅰ 교과 내용'), 'Ⅲ-1 평가의 기본 방향')
  collapse((s) => s.startsWith('가. 평가 계획과 평가 기준'), 'Ⅲ-2 평가의 방침')
  collapse((s) => s.startsWith('가. 수행평가는 과제물 위주'), 'Ⅶ 유의 사항')
  collapse((s) => s.startsWith('가. 정기시험 결시생의 성적'), 'Ⅷ 결시생 (가·나)')
  collapse((s) => s.startsWith('다. 인정점은 학기말'), 'Ⅷ 결시생 (다·라)')
  collapse((s) => s.startsWith('가. 정기시험이 끝나면'), 'Ⅸ 활용 방안')
  collapse((s) => s.startsWith('가. 감염병의 전국적 유행'), 'Ⅹ 원격수업')

  /* ── Ⅵ · Ⅺ 소제목 정리 ───────────────────── */
  for (const p of doc.topParas()) {
    const s = doc.paraText(p).trim()
    if (/^\d+\.\s*수행평가명\s*\d+$/.test(s)) {
      if (s.endsWith('1')) doc.setPara(p, '1. 수행평가명')
      else doc.remove(p)
    }
    if (/^\(\d+\)\s/.test(s)) {
      if (s.startsWith('(1)')) doc.setPara(p, '(1) 영역명')
      else doc.remove(p)
    }
    if (s.includes('미적분Ⅰ')) doc.setPara(p, s.replace(/미적분Ⅰ/g, '< 과목명 >'))
  }
  note('Ⅵ · Ⅺ 소제목 자리표시자로')

  const bytes = await doc.save()
  await writeFile(OUT, bytes)
  console.log(`\n✓ ${OUT}  (${(bytes.length / 1024).toFixed(1)} KB)`)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
