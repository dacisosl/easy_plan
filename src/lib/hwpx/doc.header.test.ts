/**
 * header.xml 조작 검증 — 빨강 charPr · 셀 배경 borderFill · 서식 상속.
 *
 * 실제 배포 양식(templates/form_2026.hwpx)을 열어 왕복한다.
 * id 값을 못 박지 않는다 — 양식이 바뀌면 번호도 바뀌므로 '동작'만 본다.
 */

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { HwpxDoc } from './doc'

const TEMPLATE = resolve('templates/form_2026.hwpx')

let doc: HwpxDoc

beforeEach(async () => {
  doc = await HwpxDoc.load(await readFile(TEMPLATE))
})

async function roundtrip(d: HwpxDoc): Promise<HwpxDoc> {
  return HwpxDoc.load(await d.save())
}

/** 테스트에서만 쓰는 header.xml 접근 — 공개 API를 늘리지 않기 위해서다 */
function headerInfo(d: HwpxDoc) {
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
  const charPrs = all('charPr')
  return {
    charList: all('charProperties')[0],
    charPrs,
    fillList: all('borderFills')[0],
    fills: all('borderFill'),
    colorOf: (id: string | null) =>
      charPrs.find((x) => x.getAttribute('id') === id)?.getAttribute('textColor') ?? null,
  }
}

const progressTable = (d: HwpxDoc) =>
  d.topTables().find((t) => d.cellText(t, 0, 0) === '주' && d.cellText(t, 0, 1) === '기간')!

/** 검정 charPr 하나를 고른다 — 빨강 변형이 새로 만들어져야 하는 대상 */
function someBlackCharPr(d: HwpxDoc): string {
  const { charPrs } = headerInfo(d)
  const hit = charPrs.find((x) => (x.getAttribute('textColor') ?? '#000000') === '#000000')
  return hit!.getAttribute('id')!
}

describe('ensureRedCharPr', () => {
  it('검정 charPr을 복제해 빨강으로 추가하고 itemCnt를 올린다', () => {
    const before = headerInfo(doc)
    const base = someBlackCharPr(doc)
    const baseHeight = before.charPrs.find((x) => x.getAttribute('id') === base)!.getAttribute('height')
    const beforeCnt = Number(before.charList.getAttribute('itemCnt'))

    const id = doc.ensureRedCharPr(base)
    const after = headerInfo(doc)

    expect(id).not.toBe(base)
    expect(Number(after.charList.getAttribute('itemCnt'))).toBe(beforeCnt + 1)
    expect(after.colorOf(id)).toBe('#FF0000')
    // 글꼴·크기는 원본 그대로여야 글씨체가 어긋나지 않는다
    expect(after.charPrs.find((x) => x.getAttribute('id') === id)!.getAttribute('height')).toBe(
      baseHeight,
    )
  })

  it('같은 baseId는 캐시로 재사용한다', () => {
    const base = someBlackCharPr(doc)
    const cnt = Number(headerInfo(doc).charList.getAttribute('itemCnt'))
    const a = doc.ensureRedCharPr(base)
    const b = doc.ensureRedCharPr(base)
    expect(a).toBe(b)
    expect(Number(headerInfo(doc).charList.getAttribute('itemCnt'))).toBe(cnt + 1)
  })

  it('이미 빨간 charPr은 그대로 돌려준다', () => {
    const { charPrs, charList } = headerInfo(doc)
    const red = charPrs.find((x) => x.getAttribute('textColor') === '#FF0000')!.getAttribute('id')!
    const cnt = charList.getAttribute('itemCnt')
    expect(doc.ensureRedCharPr(red)).toBe(red)
    expect(headerInfo(doc).charList.getAttribute('itemCnt')).toBe(cnt)
  })

  it('왕복 후에도 살아남는다', async () => {
    const base = someBlackCharPr(doc)
    const id = doc.ensureRedCharPr(base)
    const re = await roundtrip(doc)
    expect(headerInfo(re).colorOf(id)).toBe('#FF0000')
  })
})

describe('ensureShadedBorderFill', () => {
  it('borderFill을 복제해 fillBrush를 달고 itemCnt를 올린다', () => {
    const before = headerInfo(doc)
    const base = before.fills[0].getAttribute('id')!
    const cnt = Number(before.fillList.getAttribute('itemCnt'))

    const id = doc.ensureShadedBorderFill(base, '#FFF3C4')
    const after = headerInfo(doc)

    expect(id).not.toBe(base)
    expect(Number(after.fillList.getAttribute('itemCnt'))).toBe(cnt + 1)
    const added = after.fills.find((x) => x.getAttribute('id') === id)!.toString()
    expect(added).toContain('fillBrush')
    expect(added).toContain('#FFF3C4')
  })

  it('(baseId, color) 캐시로 중복 생성을 막는다', () => {
    const base = headerInfo(doc).fills[0].getAttribute('id')!
    const cnt = Number(headerInfo(doc).fillList.getAttribute('itemCnt'))
    const a = doc.ensureShadedBorderFill(base, '#FFF3C4')
    const b = doc.ensureShadedBorderFill(base, '#FFF3C4')
    const c = doc.ensureShadedBorderFill(base, '#EEF3F7') // 다른 색은 새로
    expect(a).toBe(b)
    expect(c).not.toBe(a)
    expect(Number(headerInfo(doc).fillList.getAttribute('itemCnt'))).toBe(cnt + 2)
  })
})

describe('setCellShade · setCellRed', () => {
  it('셀 배경을 칠하면 tc의 borderFillIDRef가 바뀌고 왕복해도 남는다', async () => {
    const t = progressTable(doc)
    const before = doc.cell(t, 1, 5)!.getAttribute('borderFillIDRef')
    doc.setCellShade(t, 1, 5, '#FFF3C4')
    const after = doc.cell(t, 1, 5)!.getAttribute('borderFillIDRef')
    expect(after).not.toBe(before)

    const re = await roundtrip(doc)
    expect(re.cell(progressTable(re), 1, 5)!.getAttribute('borderFillIDRef')).toBe(after)
  })

  it('setCellRed는 셀의 모든 run에 빨강 charPr을 적용한다', async () => {
    const t = progressTable(doc)
    doc.setCellRed(t, 1, 4, ['AI가 쓴 주안점'])

    const re = await roundtrip(doc)
    const t2 = progressTable(re)
    expect(re.cellText(t2, 1, 4)).toBe('AI가 쓴 주안점')

    const runs: Element[] = []
    const walk = (n: Node) => {
      for (const c of Array.from(n.childNodes)) {
        if (c.nodeType === 1) {
          if ((c as Element).localName === 'run') runs.push(c as Element)
          walk(c)
        }
      }
    }
    walk(re.cell(t2, 1, 4)!)
    const { colorOf } = headerInfo(re)
    expect(runs.length).toBeGreaterThan(0)
    expect(runs.every((r) => colorOf(r.getAttribute('charPrIDRef')) === '#FF0000')).toBe(true)
  })
})

describe('setPara 서식 상속 (글씨체 통일)', () => {
  it('run이 없는 빈 셀에 글자를 넣어도 기본 글꼴(0)로 떨어지지 않는다', () => {
    const t = progressTable(doc)
    // 양식의 진도표 뒷줄은 비어 있다 — 거기에 글자를 넣어 본다
    const lastRow = doc.rows(t).length - 1
    doc.setCell(t, lastRow, 6, '-')
    const tc = doc.cell(t, lastRow, 6)!
    const run = tc.getElementsByTagName('hp:run')[0]
    expect(run).toBeTruthy()
    expect(run.getAttribute('charPrIDRef')).not.toBe('0')
  })
})
