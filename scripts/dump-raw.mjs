/** 최상위 문단 하나의 XML을 그대로 찍는다: node scripts/dump-raw.mjs 32 [maxChars] */
import { readFileSync } from 'node:fs'
import JSZip from 'jszip'
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'

const zip = await JSZip.loadAsync(readFileSync('templates/form_2026.hwpx'))
const doc = new DOMParser().parseFromString(
  await zip.file('Contents/section0.xml').async('string'),
  'text/xml',
)
const sec = doc.documentElement
const el = (n) => n && n.nodeType === 1
const tops = Array.from(sec.childNodes).filter((c) => el(c) && c.localName === 'p')
const idx = Number(process.argv[2] ?? 32)
const max = Number(process.argv[3] ?? 4000)
const xml = new XMLSerializer().serializeToString(tops[idx])
console.log(xml.replace(/></g, '>\n<').slice(0, max))
