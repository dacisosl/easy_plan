/**
 * 메모(안내문) 안전성 — 양식 form_2026.hwpx로 검증.
 *
 * 안내문이 메모로 달려 있어서, 본문을 읽고 쓸 때 메모를 침범하면
 * 조용히 문서가 망가진다. 그 경계를 지키는지 확인한다.
 */

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { HwpxDoc } from './doc'

const FORM = resolve('templates/form_2026.hwpx')
let doc: HwpxDoc

beforeEach(async () => {
  doc = await HwpxDoc.load(await readFile(FORM))
})

describe('메모 경계', () => {
  it('본문 글자에 안내문이 섞이지 않는다', () => {
    // p32: 본문은 "다. 평가는 정기시험과 수행평가로 실시하되, …"
    // 메모는 "교과의 특성에 맞게 기재해주세요." — 섞이면 안 된다
    const p = doc.topParas()[32]
    const text = doc.paraText(p)
    expect(text).toContain('다. 평가는 정기시험과 수행평가로 실시하되')
    expect(text).not.toContain('교과의 특성에 맞게')
    expect(text).not.toContain('수행평가만 실시하는 경우')
  })

  it('setPara가 메모가 아니라 본문을 바꾼다', async () => {
    const p = doc.topParas()[32]
    doc.setPara(p, '바뀐 본문')
    expect(doc.paraText(p)).toBe('바뀐 본문')

    const re = await HwpxDoc.load(await doc.save())
    expect(re.paraText(re.topParas()[32])).toBe('바뀐 본문')
    // 메모는 살아 있어야 한다 (지우는 건 removeMemos의 일)
    const xml = re.topParas()[32].toString()
    expect(xml).toContain('교과의 특성에 맞게')
  })

  it('removeMemos가 메모를 전부 지우고 본문은 남긴다', async () => {
    const before = doc.paraText(doc.topParas()[32])
    const n = doc.removeMemos()
    expect(n).toBeGreaterThan(40) // 양식에 메모 50개

    const re = await HwpxDoc.load(await doc.save())
    expect(re.paraText(re.topParas()[32])).toBe(before)
    const whole = re.topParas().map((p) => p.toString()).join('')
    expect(whole).not.toContain('type="MEMO"')
    expect(whole).not.toContain('교과의 특성에 맞게')
  })
})

describe('빨간 스팬', () => {
  it('p32의 빨간 스팬은 정기시험 횟수 하나뿐이다', () => {
    const runs = doc.redRuns(doc.topParas()[32])
    expect(runs.length).toBe(1)
    expect(runs[0].textContent).toContain('정기시험 횟수는 학기당 2회')
  })

  it('fillRed는 빨강만 바꾸고 검은 글씨는 그대로 둔다', async () => {
    const p = doc.topParas()[33]
    doc.fillRed(p, ['정기시험 70%, 수행평가 30%'])

    const re = await HwpxDoc.load(await doc.save())
    const text = re.paraText(re.topParas()[33])
    expect(text).toContain('라. 학기 단위 성적의 반영 비율은')
    expect(text).toContain('정기시험 70%, 수행평가 30%')
    expect(text).toContain('로 구분하여 실시한다')
    expect(text).not.toContain('60%')
    // 바뀐 스팬은 여전히 빨강이어야 한다
    const red = re.redRuns(re.topParas()[33])
    expect(red.map((r) => r.textContent).join('')).toContain('70%')
  })

  it('Ⅶ·Ⅸ 구역에는 빨간 스팬이 없다 — 통째로 유지 대상', () => {
    const tops = doc.topParas()
    const at = (roman: string) =>
      doc.topTables().findIndex((t) => doc.cellText(t, 0, 0) === roman && doc.rows(t).length === 1)
    expect(at('Ⅶ')).toBeGreaterThan(0)
    // Ⅶ 머리표 문단 ~ Ⅷ 머리표 문단 사이에 빨강이 없어야 한다
    const paraOf = (tbl: Element) => {
      let n: Node | null = tbl
      while (n && !tops.includes(n as Element)) n = n.parentNode
      return tops.indexOf(n as Element)
    }
    const tbls = doc.topTables()
    const from = paraOf(tbls[at('Ⅶ')])
    const to = paraOf(tbls[at('Ⅷ')])
    const reds = tops.slice(from + 1, to).flatMap((p) => doc.redRuns(p))
    expect(reds.length).toBe(0)
  })
})
