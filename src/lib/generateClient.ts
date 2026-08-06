/**
 * 문안 초안을 브라우저에서 조립한다 — 서버가 없다(정적 호스팅).
 *
 * 두 갈래:
 *   키 없음  → 결정적 문장 생성기(aiDraft fallback*)로 완결. 로그인도 승인도 없다.
 *   키 있음  → 브라우저가 OpenRouter를 **직접** 호출해 문장을 다듬는다.
 *
 * 키는 관리자 화면에서 넣고, 이 브라우저의 localStorage에만 산다.
 * 서버가 없으니 어디에도 모이지 않고, OpenRouter로만 전송된다.
 * 호출이 실패하면 결정적 문장으로 완결하고 이유를 남긴다 — 파이프라인은 멈추지 않는다.
 */

import type { AiDraft, SchoolLayer, SemesterPlan, Subject } from '@/types'
import {
  extractJson,
  fallbackPerf,
  fallbackSections,
  fallbackWeekly,
  inputHash,
  parsePerfs,
  parseSections,
  parseWeekly,
  perfsPrompt,
  sectionsPrompt,
  weeklyPrompt,
} from '@/lib/aiDraft'
import { aiReview } from '@/lib/validate'

export type GenerateProgress = 'sections' | 'weekly' | 'perfs' | 'done'

/* ── 키 보관 — 이 브라우저에만 ─────────────────── */

const KEY_STORAGE = 'easy-plan-openrouter-key'
const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions'
const MODEL = 'anthropic/claude-sonnet-4.6'

export function getModelKey(): string {
  try {
    return localStorage.getItem(KEY_STORAGE) ?? ''
  } catch {
    return ''
  }
}

export function setModelKey(key: string): void {
  try {
    if (key.trim()) localStorage.setItem(KEY_STORAGE, key.trim())
    else localStorage.removeItem(KEY_STORAGE)
  } catch {
    /* 시크릿 창 등 저장 불가 환경 — 조용히 넘어간다 */
  }
}

/* ── 모델 호출 ────────────────────────────────── */

type ModelResult = { json: unknown } | { reason: string }

async function callModel(
  prompt: { system: string; user: string },
  key: string,
): Promise<ModelResult> {
  if (!key) return { reason: 'no-key' }
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key.trim()}`,
        'Content-Type': 'application/json',
        // ★ 헤더 값은 Latin-1만 — 한글을 넣으면 fetch가 보내기도 전에 죽는다
        'X-Title': 'easy_plan',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user },
        ],
        temperature: 0.3,
      }),
    })
    if (!res.ok) return { reason: `http-${res.status}` }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    const text = data.choices?.[0]?.message?.content ?? ''
    return { json: extractJson(text) }
  } catch {
    return { reason: 'network' }
  }
}

const ok = (r: ModelResult): r is { json: unknown } => !('reason' in r)

/** 관리자 화면의 '연결 확인' — 성공이면 null, 실패면 사람이 읽을 이유 */
export async function testModelKey(key: string): Promise<string | null> {
  if (!key.trim()) return '키를 먼저 넣어 주세요'
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key.trim()}`,
        'Content-Type': 'application/json',
        'X-Title': 'easy_plan',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: '답은 한 단어로: 확인' }],
        max_tokens: 10,
      }),
    })
    if (res.status === 401) return '키가 올바르지 않습니다 (401)'
    if (res.status === 402) return 'OpenRouter 크레딧이 부족합니다 (402)'
    if (!res.ok) return `호출 실패 (${res.status})`
    return null
  } catch {
    return 'OpenRouter에 연결하지 못했습니다 — 학교 망이 막고 있을 수 있습니다'
  }
}

/** 실패 이유를 사람 말로 — 내려받기 화면이 쓴다 */
export function fallbackReasonLabel(reason?: string): string {
  switch (reason) {
    case 'http-401':
      return 'API 키가 올바르지 않습니다 (401)'
    case 'http-402':
      return 'OpenRouter 크레딧이 부족합니다 (402)'
    case 'http-429':
      return '호출이 너무 잦습니다 — 잠시 뒤 다시 생성해 주세요'
    case 'network':
      return 'OpenRouter에 연결하지 못했습니다'
    case 'parse':
      return '모델 응답을 읽지 못했습니다'
    default:
      return reason ? `호출 실패 (${reason})` : ''
  }
}

/* ── 초안 조립 ────────────────────────────────── */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function generateDraft(
  plan: SemesterPlan,
  subject: Subject,
  school: SchoolLayer,
  opts?: { force?: boolean; onProgress?: (stage: GenerateProgress) => void },
): Promise<AiDraft> {
  const hash = inputHash(plan, subject)

  // 저장된 초안이 같은 입력이면 그대로 쓴다
  if (!opts?.force && plan.ai && plan.ai.input_hash === hash) {
    opts?.onProgress?.('done')
    return plan.ai
  }

  const key = getModelKey()
  let failReason: string | undefined

  opts?.onProgress?.('sections')
  const fbSections = fallbackSections(plan, subject, school)
  const rSections = key ? await callModel(sectionsPrompt(plan, subject), key) : null
  const sections = rSections && ok(rSections) ? parseSections(rSections.json, fbSections) : null
  if (rSections && !ok(rSections)) failReason ??= rSections.reason
  // 교사가 직접 쓴 학기단위 성취수준은 모델이 덮지 않는다 (렌더도 같은 우선순위를 본다)
  if (subject.semester_levels_manual && sections) {
    sections.value.semesterLevels = subject.semester_levels
  }
  if (!key) await sleep(250)

  opts?.onProgress?.('weekly')
  const fbWeekly = fallbackWeekly(plan, subject, school)
  const rWeekly = key ? await callModel(weeklyPrompt(plan, subject, school), key) : null
  const weekly = rWeekly && ok(rWeekly) ? parseWeekly(rWeekly.json, fbWeekly) : null
  if (rWeekly && !ok(rWeekly)) failReason ??= rWeekly.reason
  if (!key) await sleep(250)

  opts?.onProgress?.('perfs')
  const fbPerfs = Object.fromEntries(plan.performances.map((p) => [p.id, fallbackPerf(p)]))
  const rPerfs =
    key && plan.performances.length > 0 ? await callModel(perfsPrompt(plan, subject), key) : null
  const perfs = rPerfs && ok(rPerfs) ? parsePerfs(rPerfs.json, plan) : null
  if (rPerfs && !ok(rPerfs)) failReason ??= rPerfs.reason
  if (!key) await sleep(250)

  const finalPerfs = perfs?.value ?? fbPerfs
  const reviewed: SemesterPlan = {
    ...plan,
    performances: plan.performances.map((p) => {
      const d = finalPerfs[p.id]
      return d ? { ...p, activity: d.activity, rubric: d.rubric } : p
    }),
  }
  const warnings = aiReview(reviewed, subject, school).map((i) =>
    i.detail ? `${i.title} — ${i.detail}` : i.title,
  )

  opts?.onProgress?.('done')
  const usedModel = key && !failReason
  return {
    model: usedModel ? MODEL : 'deterministic',
    created_at: new Date().toISOString(),
    // fallback 표시는 '키를 넣었는데 실패했을 때'만 — 키 없이 쓰는 것은 정상 경로다
    fallback: Boolean(key && failReason),
    fallback_reason: key ? failReason : undefined,
    input_hash: hash,
    sections: sections?.value ?? fbSections,
    weekly: weekly?.value ?? fbWeekly,
    perfs: finalPerfs,
    warnings,
  }
}
