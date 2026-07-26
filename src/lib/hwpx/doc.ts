/**
 * hwpx 문서 조작 — `hwpx_참조구현.py`의 TypeScript 포팅.
 *
 * 실제로 실패를 겪고 알아낸 여섯 가지를 그대로 옮겼다. 하나도 빼지 말 것.
 *
 *  ① mimetype은 zip 첫 항목, 무압축(STORED)
 *  ② 문자열 치환 금지 — 한글은 한 줄을 여러 <hp:t> 조각으로 쪼갠다
 *  ③ 빈 셀에는 <hp:t>가 없다 — 만들어 넣어야 한다 (안 하면 조용히 비어 나온다)
 *  ④ 여러 줄 셀은 <hp:p>를 깊은 복사해서 서식을 유지한다
 *  ⑤ 행 복제 후 cellAddr/rowAddr 재부여 + tbl/rowCnt 갱신
 *  ⑥ 글자를 바꾼 문단의 <hp:linesegarray>를 지운다 — 줄바꿈 위치 캐시라서
 *     그냥 두면 새 글자를 옛 줄 폭에 욱여넣어 자간이 뭉개진다
 *
 * 서버에서만 돈다. @xmldom/xmldom과 jszip은 노드 전용으로 잡아 두었다.
 */

import JSZip from 'jszip'
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'

export const HP_NS = 'http://www.hancom.co.kr/hwpml/2011/paragraph'

const SECTION = 'Contents/section0.xml'
const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'

/** 원본에서 무압축으로 들어 있던 항목 — 그대로 무압축으로 돌려놓는다 */
const STORED = new Set(['mimetype', 'Preview/PrvImage.png'])

type El = Element

const isEl = (n: Node | null | undefined): n is El => !!n && n.nodeType === 1

/** 직계 자식 중 태그 이름이 맞는 것만. (findall과 같은 의미) */
export function childrenOf(node: Node, local: string): El[] {
  return Array.from(node.childNodes).filter((c) => isEl(c) && c.localName === local) as El[]
}

function descendants(node: Node, local: string): El[] {
  const out: El[] = []
  const walk = (n: Node) => {
    for (const c of Array.from(n.childNodes)) {
      if (isEl(c)) {
        if (c.localName === local) out.push(c)
        walk(c)
      }
    }
  }
  walk(node)
  return out
}

export class HwpxDoc {
  private constructor(
    private files: Map<string, Uint8Array>,
    private order: string[],
    private doc: Document,
    public sec: El,
  ) {}

  static async load(bytes: Uint8Array | ArrayBuffer): Promise<HwpxDoc> {
    const zip = await JSZip.loadAsync(bytes)
    const order: string[] = []
    const files = new Map<string, Uint8Array>()
    for (const name of Object.keys(zip.files)) {
      if (zip.files[name].dir) continue
      order.push(name)
      files.set(name, await zip.files[name].async('uint8array'))
    }
    const xml = Buffer.from(files.get(SECTION)!).toString('utf8')
    const doc = new DOMParser().parseFromString(xml, 'text/xml') as unknown as Document
    return new HwpxDoc(files, order, doc, doc.documentElement as unknown as El)
  }

  /* ── 조회 ────────────────────────────────── */

  /** 섹션 최상위 문단들 (표를 품은 것 포함) */
  topParas(): El[] {
    return childrenOf(this.sec, 'p')
  }

  /** 중첩되지 않은 최상위 표만 문서 순서대로 */
  topTables(): El[] {
    return descendants(this.sec, 'tbl').filter((t) => {
      let n: Node | null = t.parentNode
      while (n && n !== (this.sec as unknown as Node)) {
        if (isEl(n) && n.localName === 'tbl') return false
        n = n.parentNode
      }
      return true
    })
  }

  /** 문단의 모든 <hp:t>를 이어 붙인 글자. 조각 단위로 찾으면 안 걸린다(②). */
  paraText(p: El): string {
    return descendants(p, 't')
      .map((t) => t.textContent ?? '')
      .join('')
  }

  /** 표·셀 전체 글자 */
  textOf(node: El): string {
    return descendants(node, 't')
      .map((t) => t.textContent ?? '')
      .join('')
      .replace(/\s+/g, ' ')
      .trim()
  }

  rows(tbl: El): El[] {
    return childrenOf(tbl, 'tr')
  }

  cell(tbl: El, r: number, c: number): El | null {
    const rows = this.rows(tbl)
    if (r >= rows.length) return null
    const cells = childrenOf(rows[r], 'tc')
    return c < cells.length ? cells[c] : null
  }

  cellText(tbl: El, r: number, c: number): string | null {
    const tc = this.cell(tbl, r, c)
    return tc ? this.textOf(tc) : null
  }

  /** 표의 머리행 글자 배열 — 표를 서명으로 찾을 때 쓴다 */
  headOf(tbl: El): string[] {
    const rows = this.rows(tbl)
    if (rows.length === 0) return []
    return childrenOf(rows[0], 'tc').map((c) => this.textOf(c))
  }

  /* ── 쓰기 ────────────────────────────────── */

  /**
   * 문단의 글자를 갈아끼운다.
   *  - linesegarray를 지운다 (⑥)
   *  - <hp:t>가 있으면 첫 조각에만 넣고 나머지는 비운다 (②)
   *  - <hp:t>가 없으면 만들어 넣는다 (③)
   */
  setPara(p: El, text: string): void {
    for (const lsa of childrenOf(p, 'linesegarray')) p.removeChild(lsa)

    const ts = descendants(p, 't')
    if (ts.length > 0) {
      ts[0].textContent = text
      for (const t of ts.slice(1)) t.textContent = ''
      return
    }

    let run = childrenOf(p, 'run')[0]
    if (!run) {
      run = this.doc.createElementNS(HP_NS, 'hp:run')
      run.setAttribute('charPrIDRef', '0')
      p.insertBefore(run, p.firstChild)
    }
    const t = this.doc.createElementNS(HP_NS, 'hp:t')
    t.textContent = text
    run.insertBefore(t, run.firstChild)
  }

  /** 셀에 글자를 넣는다. 여러 줄이면 첫 문단을 깊은 복사해 서식을 유지한다 (④). */
  setCell(tbl: El, r: number, c: number, lines: string | string[]): boolean {
    const tc = this.cell(tbl, r, c)
    if (!tc) return false
    const list = typeof lines === 'string' ? [lines] : lines
    if (list.length === 0) return this.setCell(tbl, r, c, '')

    const subs = childrenOf(tc, 'subList')
    const paras = subs.flatMap((s) => childrenOf(s, 'p'))
    if (paras.length === 0) return false

    const base = paras[0]
    const sub = subs[0]
    for (const p of paras.slice(1)) p.parentNode?.removeChild(p)

    this.setPara(base, list[0])
    for (const extra of list.slice(1)) {
      const np = base.cloneNode(true) as El
      this.setPara(np, extra)
      sub.appendChild(np)
    }
    return true
  }

  remove(el: El): boolean {
    const par = el.parentNode
    if (!par) return false
    par.removeChild(el)
    return true
  }

  /** 표를 감싼 최상위 문단째로 지운다 */
  removeTable(tbl: El): boolean {
    let el: Node = tbl
    while (el.parentNode && el.parentNode !== (this.sec as unknown as Node)) {
      el = el.parentNode
    }
    return isEl(el) ? this.remove(el) : this.remove(tbl)
  }

  /* ── 행 복제 (⑤) ─────────────────────────── */

  /**
   * 머리행 `headRows`개는 남기고, 그 뒤 `blockSize`행을 블록 템플릿으로 삼아
   * `count`개만큼 복제한다. 복제 후 rowAddr 재부여와 rowCnt 갱신까지 한다.
   */
  repeatRowBlock(tbl: El, headRows: number, blockSize: number, count: number): void {
    const trs = this.rows(tbl)
    const block = trs
      .slice(headRows, headRows + blockSize)
      .map((tr) => tr.cloneNode(true) as El)
    if (block.length === 0) return

    for (const tr of trs.slice(headRows)) tbl.removeChild(tr)
    for (let i = 0; i < count; i++) {
      for (const tr of block) tbl.appendChild(tr.cloneNode(true) as El)
    }
    this.renumber(tbl)
  }

  /** 행 수를 `want`에 맞춘다. 모자라면 마지막 행을 복제하고, 남으면 지운다. */
  fitRows(tbl: El, headRows: number, want: number): void {
    const trs = this.rows(tbl)
    const have = trs.length - headRows
    if (have === want) return
    if (have < want) {
      const proto = trs[trs.length - 1]
      for (let i = have; i < want; i++) tbl.appendChild(proto.cloneNode(true) as El)
    } else {
      for (const tr of trs.slice(headRows + want)) tbl.removeChild(tr)
    }
    this.renumber(tbl)
  }

  /** ★ 빠뜨리면 한글에서 표가 깨진다 */
  renumber(tbl: El): void {
    const trs = this.rows(tbl)
    trs.forEach((tr, ri) => {
      for (const tc of childrenOf(tr, 'tc')) {
        const ca = childrenOf(tc, 'cellAddr')[0]
        if (ca) ca.setAttribute('rowAddr', String(ri))
      }
    })
    tbl.setAttribute('rowCnt', String(trs.length))
  }

  /* ── 문단 목록 갈아끼우기 ─────────────────── */

  /**
   * `anchor` 문단 바로 뒤에 이어지는 최상위 문단들을 `lines`로 교체한다.
   * `stopAt`에 닿으면 멈춘다. 서식은 첫 문단을 깊은 복사해 유지한다.
   * 비어 있는 문단은 건드리지 않고 그대로 둔다 — 문서의 여백이라서다.
   */
  replaceParaRun(anchor: El, stopAt: El | null, lines: string[]): void {
    const tops = this.topParas()
    const start = tops.indexOf(anchor) + 1
    const end = stopAt ? tops.indexOf(stopAt) : tops.length
    if (start <= 0) return

    const slice = tops.slice(start, end < 0 ? tops.length : end)
    const filled = slice.filter((p) => this.paraText(p).trim() !== '')
    if (filled.length === 0) return

    const proto = filled[0].cloneNode(true) as El
    const parent = filled[0].parentNode!
    const marker = filled[0]

    // 첫 문단 자리에 새 문단들을 순서대로 끼워 넣고, 원래 글자 문단은 전부 지운다
    for (const text of lines) {
      const np = proto.cloneNode(true) as El
      this.setPara(np, text)
      parent.insertBefore(np, marker)
    }
    for (const p of filled) parent.removeChild(p)
  }

  /** 표만 지운다. 한 문단에 표가 둘 이상 있을 때 쓴다. */
  removeTableOnly(tbl: El): boolean {
    return this.remove(tbl)
  }

  /* ── 저장 (①) ────────────────────────────── */

  async save(): Promise<Uint8Array> {
    // xmldom은 원본에 선언이 있으면 직렬화 결과에 그대로 담아 준다. 없을 때만 붙인다.
    const serialized = new XMLSerializer().serializeToString(this.doc as never)
    const xml = serialized.trimStart().startsWith('<?xml') ? serialized : XML_DECL + serialized
    this.files.set(SECTION, new Uint8Array(Buffer.from(xml, 'utf8')))

    const out = new JSZip()
    // mimetype이 맨 앞, 무압축이어야 한글이 연다
    out.file('mimetype', this.files.get('mimetype')!, { compression: 'STORE' })
    for (const name of this.order) {
      if (name === 'mimetype') continue
      out.file(name, this.files.get(name)!, {
        compression: STORED.has(name) ? 'STORE' : 'DEFLATE',
      })
    }
    return out.generateAsync({ type: 'uint8array', streamFiles: false })
  }

  /** 원본 zip 핸들 — 테스트에서 항목 순서를 확인할 때 쓴다 */
  get entryOrder(): string[] {
    return [...this.order]
  }
}
