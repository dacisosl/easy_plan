/** 특정 최상위 문단의 run 구성을 그대로 보여 준다: node scripts/dump-para.mjs 32 19 4 */
import { readFileSync } from 'node:fs'
import JSZip from 'jszip'
import { DOMParser } from '@xmldom/xmldom'

const zip = await JSZip.loadAsync(readFileSync('templates/form_2026.hwpx'))
const headerXml = await zip.file('Contents/header.xml').async('string')
const doc = new DOMParser().parseFromString(
  await zip.file('Contents/section0.xml').async('string'),
  'text/xml',
)
const charPr = new Map()
for (const m of headerXml.matchAll(/<hh:charPr id="(\d+)"([^>]*)>([\s\S]*?)<\/hh:charPr>/g)) {
  const fr = /<hh:fontRef[^>]*hangul="(\d+)"/.exec(m[3])
  charPr.set(m[1], {
    color: /textColor="([^"]+)"/.exec(m[2])?.[1] ?? '',
    shade: /shadeColor="([^"]+)"/.exec(m[2])?.[1] ?? '',
    height: /height="(\d+)"/.exec(m[2])?.[1] ?? '',
    hangul: fr?.[1] ?? '',
    bold: m[3].includes('<hh:bold/>'),
    italic: m[3].includes('<hh:italic/>'),
    underline: /<hh:underline type="(?!NONE)/.test(m[3]),
  })
}
const fonts = new Map()
{
  const hg = /<hh:fontface lang="HANGUL"[^>]*>([\s\S]*?)<\/hh:fontface>/.exec(headerXml)
  if (hg) for (const m of hg[1].matchAll(/<hh:font id="(\d+)" face="([^"]*)"/g)) fonts.set(m[1], m[2])
}

const sec = doc.documentElement
const el = (n) => n && n.nodeType === 1
const kids = (n, tag) => Array.from(n.childNodes).filter((c) => el(c) && c.localName === tag)
const tops = kids(sec, 'p')

for (const idx of process.argv.slice(2).map(Number)) {
  const p = tops[idx]
  if (!p) { console.log(`p${idx} 없음`); continue }
  console.log(`\n════ p${idx}  paraPrIDRef=${p.getAttribute('paraPrIDRef')} styleIDRef=${p.getAttribute('styleIDRef')} ════`)
  const walk = (n, depth) => {
    for (const c of Array.from(n.childNodes)) {
      if (!el(c)) continue
      if (c.localName === 'run') {
        const id = c.getAttribute('charPrIDRef')
        const f = charPr.get(id) ?? {}
        let txt = ''
        const g = (x) => { for (const y of Array.from(x.childNodes)) { if (el(y)) { if (y.localName === 't') txt += y.textContent ?? ''; else g(y) } } }
        g(c)
        const special = Array.from(c.childNodes).filter((x) => el(x) && x.localName !== 't').map((x) => x.localName)
        console.log(
          `  run charPr=${String(id).padStart(3)} [${fonts.get(f.hangul) ?? '?'} ${Number(f.height) / 100}pt` +
            `${f.bold ? ' B' : ''}${f.italic ? ' I' : ''}${f.underline ? ' U' : ''}` +
            `${f.color && f.color !== '#000000' ? ' color=' + f.color : ''}` +
            `${f.shade && f.shade !== 'none' ? ' shade=' + f.shade : ''}]` +
            `${special.length ? ' {' + special.join(',') + '}' : ''}  ${JSON.stringify(txt)}`,
        )
      } else if (c.localName !== 'linesegarray') walk(c, depth + 1)
    }
  }
  walk(p, 0)
}
