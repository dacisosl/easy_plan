/**
 * /api/generate → /api/export 왕복 테스트 — dev 서버가 떠 있을 때 쓴다.
 *
 *   npx tsx scripts/test-export-api.ts [http://localhost:3000] [--no-ai]
 *
 * OPENROUTER_API_KEY가 없으면 fallback 문안으로 완결되는지,
 * 있으면 실제 모델 문안이 들어가는지 둘 다 이 스크립트 하나로 본다.
 */

import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { SCHOOL_SEED } from '../src/data/school'
import { PLAN_SEED, SUBJECT_SEED } from '../src/data/subject'
import type { AiDraft } from '../src/types'

const BASE = process.argv[2]?.startsWith('http') ? process.argv[2] : 'http://localhost:3000'
const NO_AI = process.argv.includes('--no-ai')
const OUT = resolve('out/api-export.hwpx')

async function post<T>(path: string, body: unknown): Promise<{ status: number; json?: T; res: Response }> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const isJson = res.headers.get('Content-Type')?.includes('json')
  return { status: res.status, json: isJson ? ((await res.json()) as T) : undefined, res }
}

async function main() {
  const base = { plan: PLAN_SEED, subject: SUBJECT_SEED, school: SCHOOL_SEED }
  let ai: AiDraft | undefined

  if (!NO_AI) {
    console.log('── /api/generate ──')
    const s = await post<{ input_hash: string; model: string; fallback: boolean; sections: AiDraft['sections'] }>(
      '/api/generate',
      { stage: 'sections', ...base },
    )
    if (s.status !== 200 || !s.json) throw new Error(`sections 실패 (${s.status})`)
    console.log(
      `sections: model=${s.json.model} fallback=${s.json.fallback} · Ⅰ ${s.json.sections.I.length} · Ⅱ ${s.json.sections.II.length} · Ⅲ-1 ${s.json.sections.III1.length} · 학기단위 ${Object.keys(s.json.sections.semesterLevels).length}`,
    )

    const w = await post<{ fallback: boolean; weekly: AiDraft['weekly'] }>('/api/generate', {
      stage: 'weekly',
      ...base,
    })
    if (w.status !== 200 || !w.json) throw new Error(`weekly 실패 (${w.status})`)
    console.log(`weekly: fallback=${w.json.fallback} · ${Object.keys(w.json.weekly).length}개 주`)

    const p = await post<{ fallback: boolean; perfs: AiDraft['perfs']; warnings: string[] }>(
      '/api/generate',
      { stage: 'perfs', ...base },
    )
    if (p.status !== 200 || !p.json) throw new Error(`perfs 실패 (${p.status})`)
    console.log(`perfs: fallback=${p.json.fallback} · ${Object.keys(p.json.perfs).length}개 · 자체 점검 ${p.json.warnings.length}건`)

    ai = {
      model: s.json.model,
      created_at: new Date().toISOString(),
      fallback: s.json.fallback || w.json.fallback || p.json.fallback,
      input_hash: s.json.input_hash,
      sections: s.json.sections,
      weekly: w.json.weekly,
      perfs: p.json.perfs,
      warnings: p.json.warnings,
    }
  }

  console.log('── /api/export ──')
  const { status, res } = await post('/api/export', { ...base, ai })
  console.log(`status ${status} · ${res.headers.get('Content-Type')}`)
  if (status !== 200) {
    console.error(await res.text())
    process.exit(1)
  }
  const warn = res.headers.get('X-Render-Warnings')
  if (warn) {
    const list = JSON.parse(decodeURIComponent(warn)) as string[]
    console.log(list.length ? `렌더 경고 ${list.length}건: ${list.join(' / ')}` : '렌더 경고 없음')
  }
  const bytes = new Uint8Array(await res.arrayBuffer())
  const firstEntry = Buffer.from(bytes.slice(30, 38)).toString('latin1')
  console.log(`${(bytes.length / 1024).toFixed(1)} KB · 첫 항목 '${firstEntry}'`)
  await writeFile(OUT, bytes)
  console.log(`→ ${OUT}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
