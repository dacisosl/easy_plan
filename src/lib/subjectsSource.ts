/**
 * 성취기준 xlsx 서버 캐시 — /api/subjects 라우트들이 공유한다.
 * 파일은 한 번만 읽는다. 서버 전용.
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import * as XLSX from 'xlsx'
import { listSubjects } from './importStandards'

const XLSX_PATH = join(process.cwd(), 'data', '고등학교_성취기준_2022.xlsx')

let cache: { wb: XLSX.WorkBook; names: string[] } | null = null

export async function loadWorkbook(): Promise<{ wb: XLSX.WorkBook; names: string[] }> {
  if (cache) return cache
  const wb = XLSX.read(await readFile(XLSX_PATH), { type: 'buffer' })
  cache = { wb, names: listSubjects(wb) }
  return cache
}
