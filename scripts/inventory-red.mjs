/**
 * 양식 전체(문단 + 표 셀)의 빨간 스팬 목록. 메모(ctrl) 안은 제외한다.
 *   node scripts/inventory-red.mjs [file]
 */
import { readFileSync } from 'node:fs'
import JSZip from 'jszip'
import { DOMParser } from '@xmldom/xmldom'

const HP = 'http://www.hancom.co.kr/hwpml/2011/paragraph'
const file = process.argv[2] ?? 'templates/form_2026.hwpx'
const zip = await JSZip.loadAsync(readFileSync(file))
const headerXml = await zip.file('Contents/header.xml').async('string')
const doc = new DOMParser().parseFromString(
  await zip.file('Contents/section0.xml').async('string'),
  'text/xml',
)

const RED = new Set()
for (const m of headerXml.matchAll(/<hh:charPr id="(\d+)"([^>]*)>/g)) {
  if (/textColor="#FF0000"/.test(m[2])) RED.add(m[1])
}

const sec = doc.documentElement
const el = (n) => n && n.nodeType === 1
const kids = (n, tag) => Array.from(n.childNodes).filter((c) => el(c) && c.localName === tag)

/** 메모(ctrl) 안으로는 들어가지 않는 run 수집 */
function runsOutsideCtrl(node) {
  const out = []
  const walk = (n) => {
    for (const c of Array.from(n.childNodes)) {
      if (!el(c)) continue
      if (c.localName === 'ctrl') continue
      if (c.localName === 'run') { out.push(c); walk(c) } else walk(c)
    }
  }
  walk(node)
  return out
}
function runText(r) {
  let s = ''
  for (const c of Array.from(r.childNodes)) {
    if (el(c) && c.localName === 't') s += c.textContent ?? ''
  }
  return s
}
/** 문단 본문 (메모 제외) */
function bodyText(p) {
  return runsOutsideCtrl(p).map(runText).join('')
}
function marked(p) {
  return runsOutsideCtrl(p)
    .map((r) => {
      const t = runText(r)
      if (!t) return ''
      return RED.has(r.getAttribute('charPrIDRef')) ? `«${t}»` : t
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
}
const hasRed = (p) => runsOutsideCtrl(p).some((r) => RED.has(r.getAttribute('charPrIDRef')) && runText(r))

const tops = kids(sec, 'p')
const allTbl = Array.from(sec.getElementsByTagNameNS(HP, 'tbl'))
const topTbl = allTbl.filter((t) => {
  let n = t.parentNode
  while (n && n !== sec) { if (el(n) && n.localName === 'tbl') return false; n = n.parentNode }
  return true
})
const idxOf = new Map(tops.map((p, i) => [p, i]))
const tblIdx = new Map(topTbl.map((t, i) => [t, i]))

console.log(`빨간 charPr: ${[...RED].sort((a, b) => a - b).join(' ')}\n`)
console.log('── 최상위 문단 ──')
tops.forEach((p, i) => {
  if (hasRed(p)) console.log(`[p${i}] ${marked(p).slice(0, 260)}`)
})

console.log('\n── 표 셀 ──')
topTbl.forEach((t) => {
  const ti = tblIdx.get(t)
  kids(t, 'tr').forEach((tr, ri) => {
    kids(tr, 'tc').forEach((tc, ci) => {
      const paras = kids(tc, 'subList').flatMap((s) => kids(s, 'p'))
      if (!paras.some(hasRed)) return
      const txt = paras.map(marked).filter(Boolean).join(' ⏎ ')
      console.log(`표${ti}[${ri},${ci}] ${txt.slice(0, 300)}`)
    })
  })
})

console.log('\n── 메모(안내문) ──')
let memo = 0
for (const fb of Array.from(sec.getElementsByTagNameNS(HP, 'fieldBegin'))) {
  if (fb.getAttribute('type') !== 'MEMO') continue
  memo++
  let txt = ''
  const g = (x) => { for (const y of Array.from(x.childNodes)) { if (el(y)) { if (y.localName === 't') txt += (y.textContent ?? '') + ' '; else g(y) } } }
  g(fb)
  // 어느 문단/표에 붙어 있는지
  let n = fb.parentNode
  while (n && !idxOf.has(n) && !tblIdx.has(n)) n = n.parentNode
  const where = idxOf.has(n) ? `p${idxOf.get(n)}` : tblIdx.has(n) ? `표${tblIdx.get(n)}` : '?'
  console.log(`  ${String(memo).padStart(2)}. (${where}) ${txt.replace(/\s+/g, ' ').trim().slice(0, 140)}`)
}
console.log(`\n메모 ${memo}개`)
