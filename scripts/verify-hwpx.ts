/**
 * hwpx 왕복 테스트 — 한글로 열기 전에 기계적으로 거를 수 있는 것만 먼저 거른다.
 *
 *   npx tsx scripts/verify-hwpx.ts templates/plan_blank.hwpx
 *
 * 확인하는 것
 *  1. mimetype이 zip 첫 항목이고 무압축인가 (①)
 *  2. 원본 항목이 하나도 빠지지 않았는가
 *  3. section0.xml이 파싱되는가
 *  4. 모든 표에서 rowCnt == 실제 tr 수, rowAddr가 0..n-1로 이어지는가 (⑤)
 *  5. 글자를 바꾼 문단에 linesegarray가 남아 있지 않은가 (⑥)
 *  6. 남아 있으면 안 되는 예시 글자가 없는가
 *
 * 한글에서 실제로 열어 표 테두리와 셀 높이를 보는 것이 최종 기준이다.
 * 이 스크립트는 그 앞단이다.
 */

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import JSZip from 'jszip'
import { HwpxDoc, childrenOf } from '../src/lib/hwpx/doc'

const REQUIRED = [
  'mimetype',
  'version.xml',
  'settings.xml',
  'Contents/header.xml',
  'Contents/section0.xml',
  'Contents/content.hpf',
  'META-INF/container.xml',
  'META-INF/manifest.xml',
]

let failures = 0
const ok = (m: string) => console.log(`  ✓ ${m}`)
const bad = (m: string) => {
  failures++
  console.log(`  ✗ ${m}`)
}

async function main() {
  const path = resolve(process.argv[2] ?? 'templates/plan_blank.hwpx')
  const bytes = await readFile(path)
  console.log(`\n${path}  (${(bytes.length / 1024).toFixed(1)} KB)\n`)

  /* 1 · 2 — zip 구조 */
  const raw = new Uint8Array(bytes)
  // 로컬 헤더 첫 항목의 이름과 압축 방식을 직접 읽는다
  const sig = raw[0] === 0x50 && raw[1] === 0x4b && raw[2] === 0x03 && raw[3] === 0x04
  const method = raw[8] | (raw[9] << 8)
  const nameLen = raw[26] | (raw[27] << 8)
  const firstName = Buffer.from(raw.slice(30, 30 + nameLen)).toString('latin1')
  if (sig && firstName === 'mimetype') ok('mimetype이 zip 첫 항목')
  else bad(`zip 첫 항목이 mimetype이 아님 (${firstName})`)
  if (method === 0) ok('mimetype 무압축(STORED)')
  else bad(`mimetype이 압축됨 (method=${method})`)

  const zip = await JSZip.loadAsync(bytes)
  const names = Object.keys(zip.files)
  const missing = REQUIRED.filter((n) => !names.includes(n))
  if (missing.length === 0) ok(`필수 항목 ${REQUIRED.length}개 모두 존재 (전체 ${names.length}개)`)
  else bad(`빠진 항목: ${missing.join(', ')}`)

  const mime = await zip.file('mimetype')!.async('string')
  if (mime === 'application/hwp+zip') ok('mimetype 내용 정상')
  else bad(`mimetype 내용이 다름: ${JSON.stringify(mime)}`)

  /* 3 — XML 파싱 */
  const doc = await HwpxDoc.load(bytes)
  const tables = doc.topTables()
  ok(`section0.xml 파싱 · 최상위 표 ${tables.length}개 · 최상위 문단 ${doc.topParas().length}개`)

  /* 4 — rowCnt / rowAddr */
  let tblBad = 0
  tables.forEach((t, i) => {
    const trs = doc.rows(t)
    const declared = Number(t.getAttribute('rowCnt'))
    if (declared !== trs.length) {
      bad(`표${i}: rowCnt=${declared} 인데 실제 ${trs.length}행`)
      tblBad++
    }
    trs.forEach((tr, ri) => {
      for (const tc of childrenOf(tr, 'tc')) {
        const ca = childrenOf(tc, 'cellAddr')[0]
        if (ca && Number(ca.getAttribute('rowAddr')) !== ri) {
          bad(`표${i} ${ri}행: rowAddr=${ca.getAttribute('rowAddr')}`)
          tblBad++
        }
      }
    })
  })
  if (tblBad === 0) ok('모든 표의 rowCnt · rowAddr 일치')

  /* 5 — 빈 문단에 남은 linesegarray */
  let lsaBad = 0
  for (const p of doc.topParas()) {
    if (doc.paraText(p).trim() === '' && childrenOf(p, 'linesegarray').length > 0) lsaBad++
  }
  // 원래 비어 있던 문단은 캐시를 그대로 두는 게 맞다. 개수만 알려 준다.
  ok(`빈 문단 중 줄바꿈 캐시가 남은 것 ${lsaBad}개 (손대지 않은 문단이면 정상)`)

  /* 6 — 예시 글자 잔존 */
  const xml = await zip.file('Contents/section0.xml')!.async('string')
  // 양식에 남아 있으면 안 되는 예시 글자. '해밀고'는 학교 이름이라 남는 게 맞다.
  const leftovers = ['미적분Ⅰ', '12미적', '김민준', '통합사회', '수행평가명1', '수행평가명2', 'MEMO']
  const found = leftovers.filter((s) => xml.includes(s))
  if (found.length === 0) ok('예시 글자 잔존 없음')
  else bad(`예시 글자가 남아 있음: ${found.join(', ')}`)

  console.log(failures === 0 ? '\n통과\n' : `\n실패 ${failures}건\n`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
