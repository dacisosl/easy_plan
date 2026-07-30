/**
 * POST /api/generate — AI 초안 생성. 스테이지 하나씩 처리한다.
 *
 * 키는 서버에만 있다. 키가 없거나 호출이 실패하면 결정적 fallback으로 완결한다 —
 * 실패해도 파이프라인은 멈추지 않고, fallback 여부만 표시한다.
 *
 * AI는 문장만 쓴다. 숫자는 aiDraft.ts의 뼈대(코드 계산값)가 강제한다.
 */

import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { SchoolLayer, SemesterPlan, Subject } from '@/types'
import { SESSION_COOKIE, adminReady, userFromSession } from '@/lib/firebase/admin'
import {
  STAGES,
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
  type GenerateStage,
} from '@/lib/aiDraft'
import { aiReview } from '@/lib/validate'

export const runtime = 'nodejs'

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions'
const DEFAULT_MODEL = 'anthropic/claude-sonnet-4.5'

interface Body {
  stage: GenerateStage
  plan: SemesterPlan
  subject: Subject
  school: SchoolLayer
}

async function callModel(
  prompt: { system: string; user: string },
  allowed: boolean,
): Promise<{ json: unknown; model: string } | null> {
  // 승인받지 않은 사람은 모델을 부르지 않는다 — 대체 문구로 완결된다
  if (!allowed) return null
  const key = process.env.OPENROUTER_API_KEY
  if (!key) return null
  const model = process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.OPENROUTER_SITE_URL ?? 'http://localhost:3000',
        'X-Title': '교수학습 및 평가 운영계획서',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user },
        ],
        temperature: 0.3,
      }),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    const text = data.choices?.[0]?.message?.content ?? ''
    return { json: extractJson(text), model }
  } catch {
    return null
  }
}

/**
 * 이 사람이 모델을 부를 수 있는가.
 *
 * 우리 OpenRouter 키로 도는 자리라 아무나 부르면 크레딧이 타 버린다.
 * 관리자가 승인한 사람만 통과시키고, 나머지는 대체 문구로 완결한다 —
 * 막는 게 아니라 '키를 안 쓰는 길'로 보내는 것이다. 계획서는 그대로 만들어진다.
 *
 * 로그인 설정이 없는 로컬 개발에서는 그냥 허용한다.
 */
async function mayUseModel(): Promise<boolean> {
  if (!adminReady) return true
  const user = await userFromSession((await cookies()).get(SESSION_COOKIE)?.value)
  return user?.approved === true
}

export async function POST(req: Request) {
  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다' }, { status: 400 })
  }

  const { stage, plan, subject, school } = body
  if (!STAGES.includes(stage) || !plan || !subject || !school) {
    return NextResponse.json(
      { error: `stage는 ${STAGES.join(' · ')} 중 하나이고 plan·subject·school이 필요합니다` },
      { status: 400 },
    )
  }

  const hash = inputHash(plan, subject)
  const allowed = await mayUseModel()

  if (stage === 'sections') {
    const fb = fallbackSections(plan, subject, school)
    const res = await callModel(sectionsPrompt(plan, subject), allowed)
    const parsed = parseSections(res?.json, fb)
    return NextResponse.json({
      input_hash: hash,
      model: res ? res.model : 'fallback',
      fallback: !res || parsed.usedFallback,
      sections: parsed.value,
    })
  }

  if (stage === 'weekly') {
    const fb = fallbackWeekly(plan, subject, school)
    const res = await callModel(weeklyPrompt(plan, subject, school), allowed)
    const parsed = parseWeekly(res?.json, fb)
    return NextResponse.json({
      input_hash: hash,
      model: res ? res.model : 'fallback',
      fallback: !res || parsed.usedFallback,
      weekly: parsed.value,
    })
  }

  // perfs — 문안 생성 + 내부 자체 점검(aiReview)을 warnings로
  const res = plan.performances.length > 0 ? await callModel(perfsPrompt(plan, subject), allowed) : null
  const parsed = res
    ? parsePerfs(res.json, plan)
    : {
        value: Object.fromEntries(plan.performances.map((p) => [p.id, fallbackPerf(p)])),
        usedFallback: true,
      }

  // 자체 점검은 생성된 문안을 반영한 상태로 돌린다
  const reviewed: SemesterPlan = {
    ...plan,
    performances: plan.performances.map((p) => {
      const d = parsed.value[p.id]
      return d ? { ...p, activity: d.activity, rubric: d.rubric } : p
    }),
  }
  const warnings = aiReview(reviewed, subject, school).map((i) =>
    i.detail ? `${i.title} — ${i.detail}` : i.title,
  )

  return NextResponse.json({
    input_hash: hash,
    model: res ? res.model : 'fallback',
    fallback: !res || parsed.usedFallback,
    perfs: parsed.value,
    warnings,
  })
}
