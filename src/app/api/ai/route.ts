/**
 * POST /api/ai — OpenRouter 프록시.
 *
 * 키는 서버에만 둔다. 클라이언트에 절대 내보내지 않는다.
 * AI가 정해도 되는 것은 문장뿐이다 — 숫자는 전부 코드가 계산한다.
 * (반영 비율·영역 만점·기본점수·배점·서술논술 비율은 lib/autofill.ts에서 나온다)
 */

import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions'
const DEFAULT_MODEL = 'anthropic/claude-sonnet-4.5'

/** 이 앱이 AI에게 맡기는 일 — 목록에 없는 요청은 받지 않는다 */
export type AiTask =
  | 'unit-match' // 단원 ↔ 성취기준 매칭 초안
  | 'weekly-method' // 주차별 수업 방법 및 주안점
  | 'activity' // 수행 활동 과정
  | 'rubric-text' // 루브릭 채점 기준 서술
  | 'section-text' // Ⅰ 교수학습 운영계획 · Ⅱ 평가의 목적
  | 'review' // 평가 요소·성취기준 정합성 검토

const SYSTEM: Record<AiTask, string> = {
  'unit-match':
    '고등학교 교사가 쓴 소단원 목록을 성취기준에 배정한다. 코드만 고르고 새 성취기준을 지어내지 않는다.',
  'weekly-method':
    '한 주의 수업 방법과 수업·평가 연계 주안점을 두세 줄로 쓴다. 성취기준에 없는 내용을 넣지 않는다.',
  activity: '수행평가의 수행 활동 과정을 학생이 무엇을 하는지 드러나게 두세 문장으로 쓴다.',
  'rubric-text':
    '루브릭 채점 기준을 배점마다 구분되게 쓴다. 배점 사이에 관찰 가능한 차이가 드러나야 한다. 점수는 정하지 않는다.',
  'section-text': '학교 계획서 문체로 담백하게 쓴다. 과장하지 않는다.',
  review:
    '평가 요소가 성취기준을 실제로 측정하는지, 그 주 수업 내용과 맞는지 짚는다. 문제가 없으면 없다고 말한다.',
}

const TASKS = Object.keys(SYSTEM) as AiTask[]

export async function POST(req: Request) {
  const key = process.env.OPENROUTER_API_KEY
  if (!key) {
    return NextResponse.json(
      { error: 'OPENROUTER_API_KEY가 설정되지 않았습니다. .env.local을 확인하세요.' },
      { status: 503 },
    )
  }

  let body: { task?: string; prompt?: string; model?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다' }, { status: 400 })
  }

  const { task, prompt } = body
  if (!task || !TASKS.includes(task as AiTask)) {
    return NextResponse.json(
      { error: `task는 ${TASKS.join(' · ')} 중 하나여야 합니다` },
      { status: 400 },
    )
  }
  if (!prompt || prompt.length > 20000) {
    return NextResponse.json({ error: 'prompt가 비었거나 너무 깁니다' }, { status: 400 })
  }

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.OPENROUTER_SITE_URL ?? 'http://localhost:3000',
      'X-Title': '교수학습 및 평가 운영계획서',
    },
    body: JSON.stringify({
      model: body.model ?? process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL,
      messages: [
        { role: 'system', content: SYSTEM[task as AiTask] },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
    }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    return NextResponse.json(
      { error: `OpenRouter 호출 실패 (${res.status})`, detail: detail.slice(0, 500) },
      { status: 502 },
    )
  }

  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  return NextResponse.json({ text: json.choices?.[0]?.message?.content ?? '' })
}
