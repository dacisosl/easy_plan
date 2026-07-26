/**
 * 클라이언트에서 AI 초안을 조립한다 — /api/generate를 스테이지별로 부른다.
 *
 * input_hash가 저장된 초안과 같으면 재호출하지 않는다.
 * force = "다시 생성" 버튼.
 */

import type { AiDraft, SchoolLayer, SemesterPlan, Subject } from '@/types'

export type GenerateProgress = 'sections' | 'weekly' | 'perfs' | 'done'

async function callStage<T>(
  stage: 'sections' | 'weekly' | 'perfs',
  plan: SemesterPlan,
  subject: Subject,
  school: SchoolLayer,
): Promise<T> {
  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stage, plan, subject, school }),
  })
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(j.error ?? `AI 초안 생성 실패 (${res.status})`)
  }
  return (await res.json()) as T
}

export async function generateDraft(
  plan: SemesterPlan,
  subject: Subject,
  school: SchoolLayer,
  opts?: { force?: boolean; onProgress?: (stage: GenerateProgress) => void },
): Promise<AiDraft> {
  opts?.onProgress?.('sections')
  const s = await callStage<{
    input_hash: string
    model: string
    fallback: boolean
    sections: AiDraft['sections']
  }>('sections', plan, subject, school)

  // 저장된 초안이 같은 입력이면 그대로 쓴다
  if (!opts?.force && plan.ai && plan.ai.input_hash === s.input_hash) {
    opts?.onProgress?.('done')
    return plan.ai
  }

  opts?.onProgress?.('weekly')
  const w = await callStage<{ model: string; fallback: boolean; weekly: AiDraft['weekly'] }>(
    'weekly',
    plan,
    subject,
    school,
  )

  opts?.onProgress?.('perfs')
  const p = await callStage<{
    model: string
    fallback: boolean
    perfs: AiDraft['perfs']
    warnings: string[]
  }>('perfs', plan, subject, school)

  opts?.onProgress?.('done')
  return {
    model: s.model,
    created_at: new Date().toISOString(),
    fallback: s.fallback || w.fallback || p.fallback,
    input_hash: s.input_hash,
    sections: s.sections,
    weekly: w.weekly,
    perfs: p.perfs,
    warnings: p.warnings,
  }
}
