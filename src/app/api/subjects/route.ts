/**
 * GET /api/subjects — 성취기준 파일의 과목 이름 목록 (239개).
 */

import { NextResponse } from 'next/server'
import { loadWorkbook } from '@/lib/subjectsSource'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const { names } = await loadWorkbook()
    return NextResponse.json({ subjects: names })
  } catch {
    return NextResponse.json(
      { error: 'data/고등학교_성취기준_2022.xlsx를 읽지 못했습니다' },
      { status: 500 },
    )
  }
}
