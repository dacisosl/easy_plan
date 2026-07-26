/**
 * /api/export 라우트 왕복 테스트 — dev 서버가 떠 있을 때 쓴다.
 *
 *   npx tsx scripts/test-export-api.ts [http://localhost:3000]
 */

import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { SCHOOL_SEED } from '../src/data/school'
import { PLAN_SEED, SUBJECT_SEED } from '../src/data/subject'

const BASE = process.argv[2] ?? 'http://localhost:3000'
const OUT = resolve('out/api-export.hwpx')

async function main() {
  const res = await fetch(`${BASE}/api/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan: PLAN_SEED, subject: SUBJECT_SEED, school: SCHOOL_SEED }),
  })

  console.log(`status ${res.status} · ${res.headers.get('Content-Type')}`)
  const disp = res.headers.get('Content-Disposition')
  if (disp) console.log(`filename ${decodeURIComponent(disp)}`)

  if (!res.ok) {
    console.error(await res.text())
    process.exit(1)
  }

  const warn = res.headers.get('X-Render-Warnings')
  if (warn) {
    const list = JSON.parse(decodeURIComponent(warn)) as string[]
    console.log(list.length ? `경고 ${list.length}건: ${list.join(' / ')}` : '경고 없음')
  }

  const bytes = new Uint8Array(await res.arrayBuffer())
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b
  const firstEntry = Buffer.from(bytes.slice(30, 38)).toString('latin1')
  console.log(`${(bytes.length / 1024).toFixed(1)} KB · zip=${isZip} · 첫 항목 '${firstEntry}'`)

  await writeFile(OUT, bytes)
  console.log(`→ ${OUT}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
