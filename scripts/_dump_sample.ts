import { readFileSync } from 'node:fs'
import { HwpxDoc } from '@/lib/hwpx/doc'

async function main() {
  const doc = await HwpxDoc.load(readFileSync(process.argv[2]))
  doc.topTables().forEach((t, ti) => {
    const rows = doc.rows(t)
    console.log(`\n### 표 ${ti} — ${rows.length}행`)
    rows.forEach((r, ri) => {
      const cells = Array.from(r.getElementsByTagName('hp:tc'))
      console.log(
        ' ',
        ri,
        cells
          .map((c) => {
            const a = c.getElementsByTagName('hp:cellAddr')[0]
            const s = c.getElementsByTagName('hp:cellSpan')[0]
            const cs = s?.getAttribute('colSpan') ?? '1'
            const rs = s?.getAttribute('rowSpan') ?? '1'
            const txt = (c.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 20)
            return `[c${a?.getAttribute('colAddr')}${cs !== '1' ? `×${cs}` : ''}${rs !== '1' ? `↓${rs}` : ''} "${txt}"]`
          })
          .join(' '),
      )
    })
  })
}
main()
