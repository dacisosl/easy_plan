/**
 * 구버전 한글 `.hwp`(OLE2 복합문서)에서 문단 글자만 뽑는다.
 *
 *   npx tsx scripts/read-hwp.ts "경로.hwp"        # 문단 미리보기
 *
 * 왜 이런 게 필요한가: 참고용으로 받은 계획서 중 일부가 확장자만 .hwpx이고
 * 속은 구버전 .hwp다. 우리가 쓰는 파서는 .hwpx(zip) 전용이라 못 연다.
 *
 * ★ 표 구조는 복원하지 않는다. 목적이 '문장 수집'이라 문단 글자면 충분하고,
 *   레코드 트리를 전부 해석하는 값은 여기서 치를 이유가 없다.
 *   표 배치가 필요하면 한글에서 HWPX로 다시 저장받는 편이 싸다.
 *
 * 구조:
 *   FileHeader          앞 32바이트가 "HWP Document File", 36바이트째 플래그의 0번 비트가 압축 여부
 *   BodyText/Section*   압축돼 있으면 raw deflate
 *     레코드 = 4바이트 머리 (tagID 10비트 · level 10비트 · size 12비트)
 *     size가 0xFFF면 뒤 4바이트가 진짜 크기
 *     HWPTAG_PARA_TEXT(67) 안이 UTF-16LE 본문
 */

import { readFileSync } from 'node:fs'
import { inflateRawSync, inflateSync } from 'node:zlib'
import * as CFB from 'cfb'

const HWPTAG_PARA_TEXT = 67

/** 제어 문자가 몇 워드를 먹는지 — 잘못 세면 그 뒤 글자가 전부 깨진다 */
function ctrlWords(code: number): number {
  // 한 워드짜리: 문단/줄 끝, 하이픈, 묶음 빈칸 따위
  if (code === 0 || code === 10 || code === 13 || (code >= 24 && code <= 31)) return 1
  // 나머지 제어(표·그림·각주 …)는 앞뒤 표식까지 여덟 워드를 차지한다
  return 8
}

function paraTextOf(payload: Buffer): string {
  let out = ''
  for (let i = 0; i + 1 < payload.length; ) {
    const code = payload.readUInt16LE(i)
    if (code < 32) {
      i += ctrlWords(code) * 2
      continue
    }
    out += String.fromCharCode(code)
    i += 2
  }
  return out
}

/** 레코드를 훑어 PARA_TEXT만 골라낸다 */
function paragraphsFromSection(buf: Buffer): string[] {
  const out: string[] = []
  let i = 0
  while (i + 4 <= buf.length) {
    const header = buf.readUInt32LE(i)
    const tag = header & 0x3ff
    let size = (header >> 20) & 0xfff
    i += 4
    if (size === 0xfff) {
      if (i + 4 > buf.length) break
      size = buf.readUInt32LE(i)
      i += 4
    }
    if (i + size > buf.length) break
    if (tag === HWPTAG_PARA_TEXT) {
      const t = paraTextOf(buf.subarray(i, i + size)).trim()
      if (t) out.push(t)
    }
    i += size
  }
  return out
}

function unpack(raw: Buffer, compressed: boolean): Buffer {
  if (!compressed) return raw
  try {
    return inflateRawSync(raw)
  } catch {
    // 일부 파일은 zlib 머리를 달고 있다
    return inflateSync(raw)
  }
}

/** `.hwp`인지 (OLE2 복합문서인지) */
export function isHwp(bytes: Buffer): boolean {
  return bytes.length > 8 && bytes.readUInt32BE(0) === 0xd0cf11e0
}

export function readHwpParagraphs(path: string): string[] {
  const cfb = CFB.read(readFileSync(path), { type: 'buffer' })
  const find = (name: string) => CFB.find(cfb, name)

  const header = find('FileHeader')
  if (!header?.content) throw new Error('FileHeader가 없습니다 — HWP 5.0 파일이 아닙니다')
  const hb = Buffer.from(header.content as Uint8Array)
  const compressed = (hb.readUInt32LE(36) & 1) === 1

  const paras: string[] = []
  for (let n = 0; ; n++) {
    const sec = find(`/BodyText/Section${n}`) ?? find(`BodyText/Section${n}`)
    if (!sec?.content) break
    paras.push(...paragraphsFromSection(unpack(Buffer.from(sec.content as Uint8Array), compressed)))
  }
  if (paras.length === 0) throw new Error('BodyText에서 글자를 찾지 못했습니다')
  return paras
}

if (process.argv[2]) {
  const paras = readHwpParagraphs(process.argv[2])
  console.log(`문단 ${paras.length}개\n`)
  for (const p of paras.slice(0, 60)) console.log(' ', p.slice(0, 100))
}
