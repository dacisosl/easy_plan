/**
 * GET /api/subjects/[name] — 과목 하나의 영역·성취기준·성취수준 + 영역 기반 단원.
 *
 * 부분 일치(공백 무시)도 받아 준다. 콤보박스에서 고른 이름이 그대로 온다.
 */

import { NextResponse } from 'next/server'
import { extractSubject, unitsFromAreas } from '@/lib/importStandards'
import { loadWorkbook } from '@/lib/subjectsSource'

export const runtime = 'nodejs'

export async function GET(_req: Request, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params
  const want = decodeURIComponent(name)

  let wb, names
  try {
    ;({ wb, names } = await loadWorkbook())
  } catch {
    return NextResponse.json(
      { error: 'data/고등학교_성취기준_2022.xlsx를 읽지 못했습니다' },
      { status: 500 },
    )
  }

  const squash = (s: string) => s.replace(/\s/g, '')
  const hit = names.find((n) => n === want) ?? names.find((n) => squash(n) === squash(want))
  if (!hit) {
    return NextResponse.json({ error: `'${want}' 과목이 파일에 없습니다` }, { status: 404 })
  }

  try {
    const imported = extractSubject(wb, hit)
    return NextResponse.json({ ...imported, units: unitsFromAreas(imported) })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '과목을 읽지 못했습니다' },
      { status: 500 },
    )
  }
}
