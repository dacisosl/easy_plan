/**
 * 양식(form_2026.hwpx) 분석 — 빨간 글씨가 어디에 있고 검은 글씨와 어떻게 섞여 있는지.
 *
 *   node scripts/inspect-form.mjs [--paras] [--tables] [--red]
 */
import { readFileSync } from 'node:fs'
import JSZip from 'jszip'
import { DOMParser } from '@xmldom/xmldom'

const HP = 'http://www.hancom.co.kr/hwpml/2011/paragraph'
const file = process.argv.find((a) => a.endsWith('.hwpx')) ?? 'templates/form_2026.hwpx'
const zip = await JSZip.loadAsync(readFileSync(file))
const headerXml = await zip.file('Contents/header.xml').async('string')
const sectionXml = await zip.file('Contents/section0.xml').async('string')

/* ── header: charPr 색·크기·글꼴 ── */
const charPr = new Map()
for (const m of headerXml.matchAll(
  /<hh:charPr id="(\d+)"([^>]*)>([\s\S]*?)<\/hh:charPr>/g,
)) {
  const attrs = m[2]
  const inner = m[3]
  const fr = /<hh:fontRef[^>]*hangul="(\d+)"/.exec(inner)
  charPr.set(m[1], {
    color: /textColor="([^"]+)"/.exec(attrs)?.[1] ?? '',
    height: /height="(\d+)"/.exec(attrs)?.[1] ?? '',
    hangul: fr?.[1] ?? '',
    bold: inner.includes('<hh:bold/>'),
  })
}
const fonts = new Map()
{
  const hg = /<hh:fontface lang="HANGUL"[^>]*>([\s\S]*?)<\/hh:fontface>/.exec(headerXml)
  if (hg) for (const m of hg[1].matchAll(/<hh:font id="(\d+)" face="([^"]*)"/g)) fonts.set(m[1], m[2])
}
const desc = (id) => {
  const c = charPr.get(id)
  if (!c) return `charPr ${id}(?)`
  return `${fonts.get(c.hangul) ?? '?'} ${Number(c.height) / 100}pt${c.bold ? ' 굵게' : ''}${
    c.color && c.color !== '#000000' ? ` ${c.color}` : ''
  }`
}
const RED = new Set([...charPr].filter(([, c]) => c.color === '#FF0000').map(([id]) => id))

/* ── section 파싱 ── */
const doc = new DOMParser().parseFromString(sectionXml, 'text/xml')
const sec = doc.documentElement
const el = (n) => n && n.nodeType === 1
const kids = (n, tag) => Array.from(n.childNodes).filter((c) => el(c) && c.localName === tag)
const runsOf = (p) => {
  const out = []
  const walk = (n) => {
    for (const c of Array.from(n.childNodes)) {
      if (el(c)) {
        if (c.localName === 'run') out.push(c)
        else walk(c)
      }
    }
  }
  walk(p)
  return out
}
const runText = (r) => {
  let s = ''
  const walk = (n) => {
    for (const c of Array.from(n.childNodes)) {
      if (el(c)) {
        if (c.localName === 't') s += c.textContent ?? ''
        else walk(c)
      }
    }
  }
  walk(r)
  return s
}
const paraText = (p) => runsOf(p).map(runText).join('')
const textOf = (node) => {
  let s = ''
  const walk = (n) => {
    for (const c of Array.from(n.childNodes)) {
      if (el(c)) {
        if (c.localName === 't') s += c.textContent ?? ''
        else walk(c)
      }
    }
  }
  walk(node)
  return s.replace(/\s+/g, ' ').trim()
}

const topParas = kids(sec, 'p')
const allTbl = Array.from(sec.getElementsByTagNameNS(HP, 'tbl'))
const topTbl = allTbl.filter((t) => {
  let n = t.parentNode
  while (n && n !== sec) {
    if (el(n) && n.localName === 'tbl') return false
    n = n.parentNode
  }
  return true
})
const paraIdx = new Map(topParas.map((p, i) => [p, i]))
const tblPara = (t) => {
  let n = t.parentNode
  while (n && !paraIdx.has(n)) n = n.parentNode
  return paraIdx.has(n) ? paraIdx.get(n) : -1
}

const mode = process.argv.includes('--tables')
  ? 'tables'
  : process.argv.includes('--red')
    ? 'red'
    : 'paras'

if (mode === 'tables') {
  console.log(`최상위 표 ${topTbl.length}개 / 최상위 문단 ${topParas.length}개\n`)
  topTbl.forEach((t, i) => {
    const rows = kids(t, 'tr')
    const head = rows[0] ? kids(rows[0], 'tc').map((c) => textOf(c).slice(0, 22)).join(' | ') : ''
    console.log(`표${String(i).padStart(2)} p${tblPara(t)} rows=${String(rows.length).padStart(2)} cols=${t.getAttribute('colCnt')} :: ${head}`)
  })
} else if (mode === 'red') {
  console.log(`빨간 charPr: ${[...RED].join(' ')}\n`)
  topParas.forEach((p, i) => {
    const rs = runsOf(p)
    if (!rs.some((r) => RED.has(r.getAttribute('charPrIDRef')))) return
    const parts = rs
      .map((r) => {
        const t = runText(r)
        if (!t) return ''
        return RED.has(r.getAttribute('charPrIDRef')) ? `«${t}»` : t
      })
      .join('')
    console.log(`[p${i}] ${parts.replace(/\s+/g, ' ').trim().slice(0, 300)}`)
  })
} else {
  let ti = 0
  const tblAt = new Map()
  topTbl.forEach((t) => {
    const k = tblPara(t)
    tblAt.set(k, [...(tblAt.get(k) ?? []), ti++])
  })
  topParas.forEach((p, i) => {
    if (tblAt.has(i)) {
      for (const n of tblAt.get(i)) {
        const t = topTbl[n]
        const rows = kids(t, 'tr')
        const head = rows[0] ? kids(rows[0], 'tc').map((c) => textOf(c).slice(0, 18)).join(' | ') : ''
        console.log(`[p${i}] ■표${n} rows=${rows.length} :: ${head}`)
      }
      return
    }
    const rs = runsOf(p)
    const s = paraText(p).replace(/\s+/g, ' ').trim()
    if (!s) {
      console.log(`[p${i}] (빈 문단)`)
      return
    }
    const hasRed = rs.some((r) => RED.has(r.getAttribute('charPrIDRef')))
    const refs = [...new Set(rs.map((r) => r.getAttribute('charPrIDRef')).filter(Boolean))]
    console.log(`[p${i}]${hasRed ? ' 🔴' : '   '} ${s.slice(0, 150)}   ⟨${refs.map(desc).join(' / ')}⟩`)
  })
}
