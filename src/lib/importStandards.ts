/**
 * 6. 데이터 원본 — `고등학교_성취기준_2022.xlsx` → `전체_성취기준` 시트를 읽는다.
 *
 * 2015 파일은 쓰지 않는다. 척도가 3단계라 Ⅺ 표(A~E)와 구조가 맞지 않고,
 * 2015 개정은 2026학년도 기준 고3만 해당한다.
 *
 * 파싱 규칙
 *  - `성취기준` 열은 `[코드]\n문장` 형태. 첫 줄이 코드, 나머지가 문장.
 *  - `평가준거 성취기준` 열은 별도. 양식은 원문을 쓰므로 사용하지 않는다.
 *  - `척도유형`의 `LVL_4`는 표기만 그럴 뿐 실제 5칸이 모두 차 있다. A~E로 취급한다.
 *  - 3단계(상~하) 과목은 수준 3칸만 쓰고, Ⅺ 표에서 D·E 행을 비운다.
 */

import * as XLSX from 'xlsx'
import type { Area, ScaleType, Standard, Subject } from '@/types'

const SHEET = '전체_성취기준'

/**
 * 실제 열 이름은 `수준1(A/상)` `수준4(D)` 처럼 괄호가 붙어 있다.
 * 파일이 조금 달라져도 버티도록 접두만 보고 찾는다.
 */
type RawRow = Record<string, unknown>

const LEVEL_KEYS = ['수준1', '수준2', '수준3', '수준4', '수준5'] as const

/** 행에서 `수준N…` 열 값을 꺼낸다 (N은 1부터) */
function level(row: RawRow, n: number): string {
  const prefix = LEVEL_KEYS[n - 1]
  const key = Object.keys(row).find((k) => k.replace(/\s/g, '').startsWith(prefix))
  return key ? cell(row[key]) : ''
}

/** 이름이 정확히 맞지 않아도 접두로 찾는다 */
function col(row: RawRow, name: string): string {
  if (name in row) return cell(row[name])
  const key = Object.keys(row).find((k) => k.replace(/\s/g, '').startsWith(name.replace(/\s/g, '')))
  return key ? cell(row[key]) : ''
}

export interface ImportedSubject {
  name: string
  code_prefix: string
  scale_type: ScaleType
  areas: Area[]
  standards: Standard[]
}

const cell = (v: unknown): string => (v == null ? '' : String(v).trim())

/**
 * `[12현윤01-01]\n문장` → { code, text }
 *
 * 원본에 여는 대괄호가 빠진 행이 다섯 개 있고(`12진로01-03] …`),
 * 코드와 문장이 한 줄에 붙어 있는 행도 있다. 둘 다 받아 준다.
 */
export function parseStandardCell(raw: string): { code: string; text: string } | null {
  const m = raw.match(/^\s*\[?\s*([^[\]\n]+?)\s*\]/)
  if (!m) return null
  const inner = m[1]
  // 코드처럼 생겼는지 — 끝이 `NN-NN`
  if (!/\d{2}-\d{2}$/.test(inner)) return null
  return {
    code: `[${inner}]`,
    text: raw.slice(m[0].length).replace(/\s+/g, ' ').trim(),
  }
}

/** `[12현윤01-01]` → `12현윤` · `[12미적Ⅰ-01-01]` → `12미적Ⅰ` */
export function codePrefix(code: string): string {
  return code
    .replace(/^\[|\]$/g, '')
    .replace(/\d{2}-\d{2}$/, '')
    .replace(/-$/, '')
}

/** `[12현윤01-01]` → `01` */
export function areaNoFromCode(code: string): string {
  const m = code.match(/(\d{2})-\d{2}\]$/)
  return m ? m[1] : ''
}

/**
 * 척도유형 판정. 실제 값은 `5단계(A~E)` · `3단계(상~하)` · `LVL_4` 세 가지다.
 *
 * `LVL_4`는 표기만 그럴 뿐 A~E로 취급한다 (클로드코드 프롬프트).
 * 라벨이 비어 있으면 채워진 수준 칸 수로 판정한다.
 */
function detectScale(rows: RawRow[]): ScaleType {
  const labels = rows.map((r) => col(r, '척도유형')).filter(Boolean)
  if (labels.some((l) => l.startsWith('3단계'))) return 'LVL_3'
  if (labels.some((l) => l.startsWith('5단계') || l === 'LVL_4')) return 'LVL_5'
  const filledFour = rows.some((r) => level(r, 4) !== '')
  const filledFive = rows.some((r) => level(r, 5) !== '')
  return filledFour || filledFive ? 'LVL_5' : 'LVL_3'
}

/** 워크북 → 과목 이름 목록 */
export function listSubjects(wb: XLSX.WorkBook): string[] {
  const ws = wb.Sheets[SHEET]
  if (!ws) throw new Error(`시트 '${SHEET}'를 찾을 수 없습니다`)
  const rows = XLSX.utils.sheet_to_json<RawRow>(ws, { defval: '' })
  return [...new Set(rows.map((r) => col(r, '과목')).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'ko'),
  )
}

/** 워크북에서 과목 하나를 뽑아 과목 레이어 형태로 만든다 */
export function extractSubject(wb: XLSX.WorkBook, subjectName: string): ImportedSubject {
  const ws = wb.Sheets[SHEET]
  if (!ws) throw new Error(`시트 '${SHEET}'를 찾을 수 없습니다`)
  const all = XLSX.utils.sheet_to_json<RawRow>(ws, { defval: '' })
  const rows = all.filter((r) => col(r, '과목') === subjectName)
  if (rows.length === 0) throw new Error(`'${subjectName}' 과목의 행이 없습니다`)

  const scale = detectScale(rows)
  const areaMap = new Map<string, string>()
  const standards: Standard[] = []

  for (const r of rows) {
    const parsed = parseStandardCell(col(r, '성취기준'))
    if (!parsed) continue
    const area_no = areaNoFromCode(parsed.code)
    const areaName = col(r, '영역(단원)')
    // 영역(단원)은 전체의 91%만 채워져 있다. 결측이면 코드에서 만든 번호만 남긴다.
    if (area_no && areaName && !areaMap.has(area_no)) areaMap.set(area_no, areaName)

    // 3단계(상~하) 과목은 A·B·C 세 칸만 쓰고 Ⅺ 표에서 D·E 행을 비운다
    const levels: Standard['levels'] =
      scale === 'LVL_5'
        ? {
            A: level(r, 1),
            B: level(r, 2),
            C: level(r, 3),
            D: level(r, 4),
            E: level(r, 5),
          }
        : { A: level(r, 1), B: level(r, 2), C: level(r, 3) }

    standards.push({
      code: parsed.code,
      text: parsed.text,
      scale_type: scale,
      area_no,
      levels,
    })
  }

  if (standards.length === 0) throw new Error(`'${subjectName}'에서 성취기준을 읽지 못했습니다`)

  const areaNos = [...new Set(standards.map((s) => s.area_no))].filter(Boolean).sort()
  const areas: Area[] = areaNos.map((no) => ({ no, name: areaMap.get(no) ?? `영역 ${no}` }))

  return {
    name: subjectName,
    code_prefix: codePrefix(standards[0].code),
    scale_type: scale,
    areas,
    standards,
  }
}

export async function readWorkbook(file: File): Promise<XLSX.WorkBook> {
  const buf = await file.arrayBuffer()
  return XLSX.read(buf, { type: 'array' })
}

/** 임포트 결과를 기존 과목에 덮어쓴다. 단원 매핑은 코드가 살아 있는 것만 남긴다. */
export function applyImport(subject: Subject, imported: ImportedSubject): Subject {
  const known = new Set(imported.standards.map((s) => s.code))
  return {
    ...subject,
    name: imported.name,
    code_prefix: imported.code_prefix,
    scale_type: imported.scale_type,
    areas: imported.areas,
    standards: imported.standards,
    units: subject.units.map((u) => ({
      ...u,
      standard_codes: u.standard_codes.filter((c) => known.has(c)),
    })),
    seed: false,
  }
}
