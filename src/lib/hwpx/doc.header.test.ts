/**
 * Phase 1 검증 — header.xml 조작(빨강 charPr · 배경 borderFill)과 서식 상속.
 *
 * 실제 templates/plan_blank.hwpx를 열어 왕복한다.
 * 전제(탐색으로 확인): charProperties itemCnt=120 (id 0~119), borderFills itemCnt=83 (id 1~83).
 */

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { HwpxDoc } from './doc'

const TEMPLATE = resolve('templates/plan_blank.hwpx')

let doc: HwpxDoc

beforeEach(async () => {
  doc = await HwpxDoc.load(await readFile(TEMPLATE))
})

/** 저장 → 재로드 왕복 */
async function roundtrip(d: HwpxDoc): Promise<HwpxDoc> {
  return HwpxDoc.load(await d.save())
}

/** header.xml에서 charPr/borderFill 목록을 뽑는 검사용 접근자 */
function headerInfo(d: HwpxDoc) {
  // 테스트에서만 쓰는 내부 접근 — 공개 API를 늘리지 않기 위해서다
  const header = (d as unknown as { headerDoc: Document }).headerDoc
  const all = (local: string): Element[] => {
    const out: Element[] = []
    const walk = (n: Node) => {
      for (const c of Array.from(n.childNodes)) {
        if (c.nodeType === 1) {
          if ((c as Element).localName === local) out.push(c as Element)
          walk(c)
        }
      }
    }
    walk(header.documentElement as unknown as Node)
    return out
  }
  return {
    charList: all('charProperties')[0],
    charPrs: all('charPr'),
    fillList: all('borderFills')[0],
    fills: all('borderFill'),
  }
}

describe('ensureRedCharPr', () => {
  it('8pt(charPr 31)를 복제해 id=120·itemCnt=121로 추가한다', () => {
    const id = doc.ensureRedCharPr('31')
    expect(id).toBe('120')

    const { charList, charPrs } = headerInfo(doc)
    expect(charList.getAttribute('itemCnt')).toBe('121')
    const added = charPrs.find((x) => x.getAttribute('id') === '120')!
    expect(added.getAttribute('textColor')).toBe('#FF0000')
    // 원본 서식(높이·글꼴)은 그대로
    const base = charPrs.find((x) => x.getAttribute('id') === '31')!
    expect(added.getAttribute('height')).toBe(base.getAttribute('height'))
  })

  it('같은 baseId는 캐시로 재사용한다', () => {
    const a = doc.ensureRedCharPr('31')
    const b = doc.ensureRedCharPr('31')
    expect(a).toBe(b)
    expect(headerInfo(doc).charList.getAttribute('itemCnt')).toBe('121')
  })

  it('이미 빨간 charPr(87)은 그대로 돌려준다', () => {
    expect(doc.ensureRedCharPr('87')).toBe('87')
    expect(headerInfo(doc).charList.getAttribute('itemCnt')).toBe('120')
  })

  it('왕복 후에도 살아남는다', async () => {
    doc.ensureRedCharPr('31')
    const re = await roundtrip(doc)
    const { charList, charPrs } = headerInfo(re)
    expect(charList.getAttribute('itemCnt')).toBe('121')
    expect(charPrs.some((x) => x.getAttribute('id') === '120')).toBe(true)
  })
})

describe('ensureShadedBorderFill', () => {
  it('borderFill을 복제해 id=84·itemCnt=84로 추가하고 fillBrush를 단다', () => {
    const id = doc.ensureShadedBorderFill('12', '#FFF3C4')
    expect(id).toBe('84')

    const { fillList, fills } = headerInfo(doc)
    expect(fillList.getAttribute('itemCnt')).toBe('84')
    const added = fills.find((x) => x.getAttribute('id') === '84')!
    const xml = added.toString()
    expect(xml).toContain('fillBrush')
    expect(xml).toContain('#FFF3C4')
    // 테두리는 원본 그대로 복제됐는지 (leftBorder 존재)
    expect(xml).toContain('leftBorder')
  })

  it('(baseId, color) 캐시로 중복 생성을 막는다', () => {
    const a = doc.ensureShadedBorderFill('12', '#FFF3C4')
    const b = doc.ensureShadedBorderFill('12', '#FFF3C4')
    const c = doc.ensureShadedBorderFill('12', '#EEF3F7') // 다른 색은 새로
    expect(a).toBe(b)
    expect(c).not.toBe(a)
    expect(headerInfo(doc).fillList.getAttribute('itemCnt')).toBe('85')
  })
})

describe('setCellShade · setCellRed', () => {
  it('진도표 셀에 배경을 칠하면 tc의 borderFillIDRef가 바뀐다', async () => {
    const progress = doc.topTables().find((t) => doc.headOf(t)[0] === '주')!
    const before = doc.cell(progress, 1, 5)!.getAttribute('borderFillIDRef')
    doc.setCellShade(progress, 1, 5, '#FFF3C4')
    const after = doc.cell(progress, 1, 5)!.getAttribute('borderFillIDRef')
    expect(after).not.toBe(before)

    const re = await roundtrip(doc)
    const t2 = re.topTables().find((t) => re.headOf(t)[0] === '주')!
    expect(re.cell(t2, 1, 5)!.getAttribute('borderFillIDRef')).toBe(after)
  })

  it('setCellRed는 셀 run에 빨강 charPr을 적용한다', async () => {
    const progress = doc.topTables().find((t) => doc.headOf(t)[0] === '주')!
    doc.setCellRed(progress, 1, 4, ['AI가 쓴 주안점'])

    const re = await roundtrip(doc)
    const t2 = re.topTables().find((t) => re.headOf(t)[0] === '주')!
    expect(re.cellText(t2, 1, 4)).toBe('AI가 쓴 주안점')

    const tc = re.cell(t2, 1, 4)!
    const runs: Element[] = []
    const walk = (n: Node) => {
      for (const c of Array.from(n.childNodes)) {
        if (c.nodeType === 1) {
          if ((c as Element).localName === 'run') runs.push(c as Element)
          walk(c)
        }
      }
    }
    walk(tc)
    const refs = runs.map((r) => r.getAttribute('charPrIDRef'))
    // 재로드한 문서의 header에서 그 id가 빨강인지 확인
    const { charPrs } = headerInfo(re)
    const isRed = (id: string | null) =>
      charPrs.find((x) => x.getAttribute('id') === id)?.getAttribute('textColor') === '#FF0000'
    expect(refs.length).toBeGreaterThan(0)
    expect(refs.every(isRed)).toBe(true)
  })
})

describe('setPara 서식 상속 (글씨체 통일)', () => {
  it('run이 없는 빈 문단에 글자를 넣으면 이웃 run의 charPr을 상속한다', () => {
    // 진도표의 빈 셀 하나에 글자를 넣고 charPrIDRef가 '0'이 아닌지 본다
    const progress = doc.topTables().find((t) => doc.headOf(t)[0] === '주')!
    doc.setCell(progress, 2, 6, '-')
    const tc = doc.cell(progress, 2, 6)!
    const run = tc.getElementsByTagName('hp:run')[0]
    // 이웃(머리행 등)이 맑은 고딕 계열이므로 '0'(함초롬바탕)이면 실패
    expect(run.getAttribute('charPrIDRef')).not.toBe('0')
  })
})
