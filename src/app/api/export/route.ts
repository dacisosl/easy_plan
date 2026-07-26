/**
 * POST /api/export — 값을 받아 완성된 hwpx를 돌려준다.
 *
 * hwpx 조립은 서버에서만 한다. @xmldom/xmldom과 jszip이 노드 전용이고,
 * 템플릿 파일을 파일 시스템에서 읽어야 하기 때문이다.
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { NextResponse } from 'next/server'
import { renderPlan } from '@/lib/hwpx/render'
import type { AiDraft, SchoolLayer, SemesterPlan, Subject } from '@/types'

export const runtime = 'nodejs'

interface Body {
  plan: SemesterPlan
  subject: Subject
  school: SchoolLayer
  /** AI 초안 — 있으면 빨간 글씨로 렌더된다 */
  ai?: AiDraft
}

export async function POST(req: Request) {
  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다' }, { status: 400 })
  }

  const { plan, subject, school, ai } = body
  if (!plan || !subject || !school) {
    return NextResponse.json({ error: 'plan · subject · school이 모두 필요합니다' }, { status: 400 })
  }

  let template: Uint8Array
  try {
    template = new Uint8Array(await readFile(join(process.cwd(), 'templates', 'plan_blank.hwpx')))
  } catch {
    return NextResponse.json(
      { error: 'templates/plan_blank.hwpx가 없습니다. `npm run template`을 먼저 실행하세요.' },
      { status: 500 },
    )
  }

  try {
    const { bytes, report } = await renderPlan(template, plan, subject, school, ai)
    const name = `${subject.name}_${school.calendar.semester}학기_계획서.hwpx`
    return new NextResponse(new Uint8Array(bytes) as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/hwp+zip',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
        // 채우지 못한 곳이 있으면 헤더로 알려 준다 (한글은 못 넣으므로 인코딩)
        'X-Render-Warnings': encodeURIComponent(JSON.stringify(report.warnings)),
      },
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'hwpx를 만들지 못했습니다' },
      { status: 500 },
    )
  }
}
