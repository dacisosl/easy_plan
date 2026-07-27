/** 표 구조를 셀 단위로: node scripts/dump-table.mjs 2 15 30 */
import { readFileSync } from 'node:fs'
import JSZip from 'jszip'
import { DOMParser } from '@xmldom/xmldom'

const HP = 'http://www.hancom.co.kr/hwpml/2011/paragraph'
const zip = await JSZip.loadAsync(readFileSync('templates/form_2026.hwpx'))
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
const runsNoCtrl = (node) => {
  const out = []
  const walk = (n) => {
    for (const c of Array.from(n.childNodes)) {
      if (!el(c) || c.localName === 'ctrl') continue
      if (c.localName === 'run') { out.push(c); walk(c) } else walk(c)
    }
  }
  walk(node)
  return out
}
const runText = (r) => Array.from(r.childNodes).filter((c) => el(c) && c.localName === 't').map((c) => c.textContent ?? '').join('')
const cellText = (tc) =>
  kids(tc, 'subList')
    .flatMap((s) => kids(s, 'p'))
    .map((p) => runsNoCtrl(p).map((r) => (RED.has(r.getAttribute('charPrIDRef')) ? `«${runText(r)}»` : runText(r))).join(''))
    .filter((s) => s !== '')
    .join(' ⏎ ')

const topTbl = Array.from(sec.getElementsByTagNameNS(HP, 'tbl')).filter((t) => {
  let n = t.parentNode
  while (n && n !== sec) { if (el(n) && n.localName === 'tbl') return false; n = n.parentNode }
  return true
})

for (const i of process.argv.slice(2).map(Number)) {
  const t = topTbl[i]
  if (!t) { console.log(`표${i} 없음`); continue }
  console.log(`\n════ 표${i} rowCnt=${t.getAttribute('rowCnt')} colCnt=${t.getAttribute('colCnt')} ════`)
  kids(t, 'tr').forEach((tr, ri) => {
    const cells = kids(tr, 'tc').map((tc) => {
      const sp = kids(tc, 'cellSpan')[0]
      const cs = sp?.getAttribute('colSpan') ?? '1'
      const rs = sp?.getAttribute('rowSpan') ?? '1'
      const ca = kids(tc, 'cellAddr')[0]
      const tag = cs !== '1' || rs !== '1' ? `«${cs}x${rs}»` : ''
      return `(${ca?.getAttribute('colAddr')})${tag}${(cellText(tc) || '·').slice(0, 58)}`
    })
    console.log(` ${String(ri).padStart(2)}: ${cells.join(' | ')}`)
  })
}
