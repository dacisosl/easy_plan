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
 *  ⑦ 메모(<hp:ctrl> 안 fieldBegin type="MEMO") 안에도 <hp:t>가 있다 —
 *     본문을 읽고 쓸 때 들어가면 안내문을 본문으로 오인하고 덮어쓴다.
 *     양식의 안내문이 전부 메모라서 이걸 놓치면 조용히 문서가 망가진다.
 *
 * 서버에서만 돈다. @xmldom/xmldom과 jszip은 노드 전용으로 잡아 두었다.
 */

import JSZip from 'jszip'
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'

export const HP_NS = 'http://www.hancom.co.kr/hwpml/2011/paragraph'
export const HH_NS = 'http://www.hancom.co.kr/hwpml/2011/head'
export const HC_NS = 'http://www.hancom.co.kr/hwpml/2011/core'

const SECTION = 'Contents/section0.xml'
const HEADER = 'Contents/header.xml'
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

/**
 * 메모(`<hp:ctrl>` 안의 `fieldBegin type="MEMO"`) 안으로는 들어가지 않는 run 수집.
 *
 * ★ 양식에는 안내문이 메모로 달려 있다. 그 안에도 `<hp:t>`가 있어서
 * 그냥 후손을 훑으면 안내문을 본문으로 오인해 읽고, 더 나쁘게는 덮어쓴다.
 * 본문을 읽거나 쓸 때는 반드시 이 함수를 거칠 것.
 */
export function runsOutsideCtrl(node: Node): El[] {
  const out: El[] = []
  const walk = (n: Node) => {
    for (const c of Array.from(n.childNodes)) {
      if (!isEl(c) || c.localName === 'ctrl') continue
      if (c.localName === 'run') {
        out.push(c)
        walk(c)
      } else walk(c)
    }
  }
  walk(node)
  return out
}

/** run의 직계 `<hp:t>` 글자 (ctrl 안은 애초에 직계가 아니다) */
function runText(r: El): string {
  return childrenOf(r, 't')
    .map((t) => t.textContent ?? '')
    .join('')
}

export class HwpxDoc {
  /** 빨강 charPr 캐시 — baseId → 새(또는 재사용) id */
  private redCharPrCache = new Map<string, string>()
  /** 배경 borderFill 캐시 — `${baseId}:${color}` → 새 id */
  private shadeFillCache = new Map<string, string>()

  private constructor(
    private files: Map<string, Uint8Array>,
    private order: string[],
    private doc: Document,
    public sec: El,
    /** Contents/header.xml — 서식(charPr·borderFill) 정의가 여기 있다 */
    private headerDoc: Document,
    /** 지금 들고 있는 구역 파일 이름 — save()가 여기로 되쓴다 */
    private sectionName: string = SECTION,
  ) {}

  /**
   * @param section 몇 번째 구역을 열지. 기본 0.
   *
   * ★ 한글은 '구역 나누기'마다 `Contents/sectionN.xml`을 따로 만든다.
   * 학교가 배포하는 학년 전체 계획서는 **과목마다 구역이 갈려 있어**
   * section0만 읽으면 첫 과목만 보인다. 여러 과목을 훑을 때는
   * `sectionCount()`로 세고 번호를 돌려 가며 열 것.
   */
  static async load(bytes: Uint8Array | ArrayBuffer, section = 0): Promise<HwpxDoc> {
    const zip = await JSZip.loadAsync(bytes)
    const order: string[] = []
    const files = new Map<string, Uint8Array>()
    for (const name of Object.keys(zip.files)) {
      if (zip.files[name].dir) continue
      order.push(name)
      files.set(name, await zip.files[name].async('uint8array'))
    }
    // TextDecoder — Buffer는 노드 전용이라 브라우저에서 조립할 수 없다
    const parse = (name: string) =>
      new DOMParser().parseFromString(
        new TextDecoder().decode(files.get(name)!),
        'text/xml',
      ) as unknown as Document
    const name = `Contents/section${section}.xml`
    if (!files.has(name)) throw new Error(`${name} 이 없습니다`)
    const doc = parse(name)
    return new HwpxDoc(files, order, doc, doc.documentElement as unknown as El, parse(HEADER), name)
  }

  /** 이 파일에 구역이 몇 개인지 (학년 전체 계획서는 과목 수만큼 나뉜다) */
  static async sectionCount(bytes: Uint8Array | ArrayBuffer): Promise<number> {
    const zip = await JSZip.loadAsync(bytes)
    return Object.keys(zip.files).filter((n) => /^Contents\/section\d+\.xml$/.test(n)).length
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

  /** 문단 본문 글자. 조각 단위로 찾으면 안 걸린다(②). 메모는 제외한다(⑦). */
  paraText(p: El): string {
    return runsOutsideCtrl(p).map(runText).join('')
  }

  /** 표·셀 본문 글자 (메모 제외) */
  textOf(node: El): string {
    return runsOutsideCtrl(node).map(runText).join('').replace(/\s+/g, ' ').trim()
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
   * 문단이 실제로 쓰는 charPrIDRef.
   * 문단에 run이 없으면 이웃 문단에서 상속한다 — '0'(함초롬바탕)을 박으면
   * 그 칸만 글씨체가 어긋난다. 글씨체 통일의 핵심.
   */
  private inheritCharPr(p: El): string {
    const own = runsOutsideCtrl(p)[0]?.getAttribute('charPrIDRef')
    if (own) return own
    const parent = p.parentNode
    if (parent) {
      for (const sib of childrenOf(parent, 'p')) {
        const ref = runsOutsideCtrl(sib)[0]?.getAttribute('charPrIDRef')
        if (ref) return ref
      }
    }
    return '0'
  }

  /**
   * 문단의 글자를 갈아끼운다.
   *  - linesegarray를 지운다 (⑥)
   *  - <hp:t>가 있으면 첫 조각에만 넣고 나머지는 비운다 (②)
   *  - <hp:t>가 없으면 만들어 넣는다 (③) — 서식은 이웃 run에서 상속
   */
  setPara(p: El, text: string, opts?: { charPrIDRef?: string }): void {
    for (const lsa of childrenOf(p, 'linesegarray')) p.removeChild(lsa)

    // 메모 안의 <hp:t>는 건드리지 않는다 (⑦)
    const runs = runsOutsideCtrl(p)
    const ts = runs.flatMap((r) => childrenOf(r, 't'))
    if (ts.length > 0) {
      ts[0].textContent = text
      for (const t of ts.slice(1)) t.textContent = ''
      if (opts?.charPrIDRef) {
        for (const run of runs) run.setAttribute('charPrIDRef', opts.charPrIDRef)
      }
      return
    }

    let run = runs[0]
    if (!run) {
      run = this.doc.createElementNS(HP_NS, 'hp:run')
      run.setAttribute('charPrIDRef', opts?.charPrIDRef ?? this.inheritCharPr(p))
      p.insertBefore(run, p.firstChild)
    } else if (opts?.charPrIDRef) {
      run.setAttribute('charPrIDRef', opts.charPrIDRef)
    }
    const t = this.doc.createElementNS(HP_NS, 'hp:t')
    t.textContent = text
    run.appendChild(t)
  }

  /** 문단 글자를 빨간 글씨(같은 글꼴·크기)로 넣는다 — AI 초안 표시용 */
  setParaRed(p: El, text: string): void {
    const base = this.inheritCharPr(p)
    this.setPara(p, text, { charPrIDRef: this.ensureRedCharPr(base) })
  }

  /**
   * 문단의 **선두 글자만** 바꾼다 — '바.'를 '마.'로 당기는 항목 재배열용.
   *
   * setPara는 문단 전체를 첫 <hp:t> 하나로 뭉개므로, 이미 채워 둔 빨간 스팬
   * (수행평가명 등)이 있는 문단에는 못 쓴다. 여기서는 첫 번째 비어 있지 않은
   * <hp:t>의 앞머리만 갈아끼워 run 구조와 서식을 그대로 남긴다.
   */
  replaceParaLead(p: El, from: string, to: string): boolean {
    const ts = runsOutsideCtrl(p).flatMap((r) => childrenOf(r, 't'))
    const first = ts.find((t) => (t.textContent ?? '') !== '')
    if (!first || !(first.textContent ?? '').startsWith(from)) return false
    first.textContent = to + (first.textContent ?? '').slice(from.length)
    for (const lsa of childrenOf(p, 'linesegarray')) p.removeChild(lsa)
    return true
  }

  /** 문단이 쓰는(또는 상속받을) charPrIDRef — 렌더러가 검정 참조를 미리 확보할 때 쓴다 */
  charPrOf(p: El): string {
    return this.inheritCharPr(p)
  }

  /** 셀에 글자를 넣는다. 여러 줄이면 첫 문단을 깊은 복사해 서식을 유지한다 (④). */
  setCell(
    tbl: El,
    r: number,
    c: number,
    lines: string | string[],
    opts?: { red?: boolean },
  ): boolean {
    const tc = this.cell(tbl, r, c)
    if (!tc) return false
    const list = typeof lines === 'string' ? [lines] : lines
    if (list.length === 0) return this.setCell(tbl, r, c, '', opts)

    const subs = childrenOf(tc, 'subList')
    const paras = subs.flatMap((s) => childrenOf(s, 'p'))
    if (paras.length === 0) return false

    const base = paras[0]
    const sub = subs[0]
    for (const p of paras.slice(1)) p.parentNode?.removeChild(p)

    const write = (p: El, text: string) =>
      opts?.red ? this.setParaRed(p, text) : this.setPara(p, text)

    write(base, list[0])
    for (const extra of list.slice(1)) {
      const np = base.cloneNode(true) as El
      write(np, extra)
      sub.appendChild(np)
    }
    return true
  }

  /** 셀에 빨간 글씨로 넣는다 */
  setCellRed(tbl: El, r: number, c: number, lines: string | string[]): boolean {
    return this.setCell(tbl, r, c, lines, { red: true })
  }

  /**
   * 셀 안의 조건부 블록 하나만 지운다.
   *
   * 결시생 표(Ⅷ)의 '신체장애 학생' 칸처럼 한 셀에 블록이 둘 들어 있고
   * 과목 유형에 따라 하나만 남겨야 할 때 쓴다. 행을 지우면 조항 자체가
   * 사라지므로 **행이 아니라 셀 안의 문단만** 걷어내야 한다.
   *
   * 블록 경계는 `-`로 시작하는 문단이다. 시작 문단부터 다음 경계 직전까지
   * (사이에 낀 중첩 표 문단을 포함해) 지운다.
   */
  removeCellBlock(tc: El, startText: string): boolean {
    const squash = (s: string) => s.replace(/\s/g, '')
    const want = squash(startText)
    const subs = childrenOf(tc, 'subList')
    const paras = subs.flatMap((s) => childrenOf(s, 'p'))

    const at = paras.findIndex((p) => squash(this.paraText(p)).includes(want))
    if (at < 0) return false

    let end = paras.length
    for (let i = at + 1; i < paras.length; i++) {
      if (/^\s*[-‐-―]/.test(this.paraText(paras[i]))) {
        end = i
        break
      }
    }
    for (const p of paras.slice(at, end)) p.parentNode?.removeChild(p)
    return true
  }

  /**
   * 표의 데이터 행 높이를 같은 값으로 맞춘다 (⑤ 뒤에 부르면 안전).
   * 세로 병합된 칸은 병합 수만큼 곱해 준다 — 안 그러면 표가 어긋난다.
   */
  setRowHeights(tbl: El, fromRow: number, height: number): void {
    const trs = this.rows(tbl)
    for (let ri = fromRow; ri < trs.length; ri++) {
      for (const tc of childrenOf(trs[ri], 'tc')) {
        const span = Number(childrenOf(tc, 'cellSpan')[0]?.getAttribute('rowSpan') ?? '1') || 1
        const sz = childrenOf(tc, 'cellSz')[0]
        if (sz) sz.setAttribute('height', String(height * span))
      }
    }
  }

  /** 셀 배경을 칠한다 — 교사가 직접 채울 칸 표시. 테두리는 그대로 유지된다. */
  setCellShade(tbl: El, r: number, c: number, faceColor: string): boolean {
    const tc = this.cell(tbl, r, c)
    if (!tc) return false
    const base = tc.getAttribute('borderFillIDRef') ?? '1'
    tc.setAttribute('borderFillIDRef', this.ensureShadedBorderFill(base, faceColor))
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
    const block = trs.slice(headRows, headRows + blockSize).map((tr) => tr.cloneNode(true) as El)
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

  /**
   * 가운데 '항목 열'의 개수를 want에 맞춘다.
   *
   * Ⅳ 평가 계획 표는 [구분][평가영역][항목…][비고] 꼴인데, 양식은 항목 열이
   * '정기시험 2회 + 수행평가 2개' 기준으로 박혀 있다. 실제 항목 수가 다르면
   * 값이 엉뚱한 열로 밀려 들어가므로(수행평가가 정기시험 머리 아래 앉는다)
   * 열 자체를 늘리고 줄인다.
   *
   * 행마다 앞쪽 고정 칸 수가 다르다(rowSpan으로 없는 행이 있다). 그래서 위치가
   * 아니라 **오른쪽 끝에서부터** 센다: 마지막 칸이 비고, 그 앞이 항목 열이다.
   *
   * @param headCols  왼쪽 고정 열 수 (구분·평가영역 = 2)
   * @param tailCols  오른쪽 고정 열 수 (비고 = 1)
   */
  fitItemCols(tbl: El, headCols: number, tailCols: number, want: number): void {
    const colOf = (tc: El) => Number(childrenOf(tc, 'cellAddr')[0]?.getAttribute('colAddr') ?? '0')
    const spanOf = (tc: El) => Number(childrenOf(tc, 'cellSpan')[0]?.getAttribute('colSpan') ?? '1')

    const total = Number(tbl.getAttribute('colCnt') ?? '0')
    const itemEnd = total - tailCols
    const have = itemEnd - headCols
    if (have <= 0 || have === want) return

    for (const tr of this.rows(tbl)) {
      const cells = childrenOf(tr, 'tc')
      // 항목 구간에 걸친 칸들. rowSpan에 먹혀 앞 칸이 없는 행도 colAddr로 정확히 걸러진다.
      const items = cells.filter((tc) => colOf(tc) >= headCols && colOf(tc) < itemEnd)
      if (items.length === 0) continue
      const after = cells.find((tc) => colOf(tc) >= itemEnd) ?? null

      if (have < want) {
        /*
         * 모자라면 마지막 항목 칸을 복제해 비고 앞에 끼워 넣는다.
         * ★ 복제본의 가로 병합은 반드시 1로 되돌린다. 본이 병합된 칸이면
         *   한 번 끼울 때마다 열이 여러 칸씩 늘어 표가 넘친다.
         */
        const proto = items[items.length - 1]
        for (let k = have; k < want; k++) {
          const clone = proto.cloneNode(true) as El
          this.setColSpan(clone, 1)
          if (after) tr.insertBefore(clone, after)
          else tr.appendChild(clone)
        }
      } else {
        /*
         * 남으면 오른쪽부터 덜어낸다. 가로로 병합된 칸(그룹 머리)은 지우지 않고
         * 폭만 줄인다 — 지우면 그 행만 열이 모자라 표가 어긋난다.
         */
        let drop = have - want
        for (let i = items.length - 1; i >= 0 && drop > 0; i--) {
          const tc = items[i]
          const span = spanOf(tc)
          if (span > 1) {
            const cut = Math.min(drop, span - 1)
            childrenOf(tc, 'cellSpan')[0]?.setAttribute('colSpan', String(span - cut))
            drop -= cut
          } else if (items.length > 1) {
            tr.removeChild(tc)
            drop -= 1
          } else break // 마지막 하나는 남긴다
        }
      }
    }

    this.renumberCols(tbl, headCols + want + tailCols)
  }

  /**
   * 행마다 colAddr를 colSpan 누적으로 다시 매기고 표의 colCnt를 맞춘다.
   * ★ 열을 건드린 뒤 빠뜨리면 한글에서 표가 깨진다.
   *
   * rowSpan에 먹혀 앞 칸이 없는 행이 있으므로 0이 아니라 **그 행 첫 칸의
   * 원래 자리**에서 세기 시작한다.
   */
  renumberCols(tbl: El, colCnt: number): void {
    for (const tr of this.rows(tbl)) {
      const cells = childrenOf(tr, 'tc')
      if (cells.length === 0) continue
      let at = Number(childrenOf(cells[0], 'cellAddr')[0]?.getAttribute('colAddr') ?? '0')
      for (const tc of cells) {
        childrenOf(tc, 'cellAddr')[0]?.setAttribute('colAddr', String(at))
        at += Number(childrenOf(tc, 'cellSpan')[0]?.getAttribute('colSpan') ?? '1')
      }
    }
    tbl.setAttribute('colCnt', String(colCnt))
  }

  /**
   * 항목 열을 want개의 홑칸으로 갈아엎는다.
   *
   * fitItemCols는 병합된 칸을 살려 두는데, 정기시험이 아예 없어지면 그 병합
   * (1회 정기시험이 선택형·서술형 두 열을 쓰던 자국)이 그대로 남아 수행평가가
   * 두 열짜리 칸에 앉는다. 그럴 때는 구간을 통째로 다시 만드는 편이 안전하다.
   *
   * 본은 **마지막 항목 칸**을 쓴다 — 거기가 수행평가 칸이라 서식이 맞다.
   */
  normalizeItemCols(tbl: El, headCols: number, tailCols: number, want: number): void {
    const colOf = (tc: El) => Number(childrenOf(tc, 'cellAddr')[0]?.getAttribute('colAddr') ?? '0')
    const total = Number(tbl.getAttribute('colCnt') ?? '0')
    const itemEnd = total - tailCols
    if (want < 1 || itemEnd <= headCols) return

    for (const tr of this.rows(tbl)) {
      const cells = childrenOf(tr, 'tc')
      const items = cells.filter((tc) => colOf(tc) >= headCols && colOf(tc) < itemEnd)
      if (items.length === 0) continue
      /*
       * 이 행이 몇 번 열에서 시작하는지 먼저 붙잡아 둔다.
       * rowSpan에 먹혀 앞 칸이 없는 행은 항목 칸을 다 걷어내면 텅 비는데,
       * 그러면 복제본이 물려받은 옛 주소가 그대로 남아 열이 어긋난다.
       */
      const base = colOf(cells[0])
      const after = cells.find((tc) => colOf(tc) >= itemEnd) ?? null
      const proto = items[items.length - 1]

      for (const tc of items) tr.removeChild(tc)
      for (let k = 0; k < want; k++) {
        const clone = proto.cloneNode(true) as El
        this.setColSpan(clone, 1)
        if (after) tr.insertBefore(clone, after)
        else tr.appendChild(clone)
      }
      const head = childrenOf(tr, 'tc')[0]
      if (head) childrenOf(head, 'cellAddr')[0]?.setAttribute('colAddr', String(base))
    }
    this.renumberCols(tbl, headCols + want + tailCols)
  }

  /**
   * 항목 열들이 쓸 수 있는 가로 폭. 열을 건드리기 **전에** 재 둔다.
   *
   * 표 전체 폭은 종이가 정한 것이라 늘리면 안 된다. 그래서 원래 항목들이
   * 쓰던 폭을 먼저 기억해 두고, 열을 다 고친 뒤 그 안에서 다시 나눈다.
   */
  itemBandWidth(tbl: El, headCols: number, tailCols: number): number {
    const colOf = (tc: El) => Number(childrenOf(tc, 'cellAddr')[0]?.getAttribute('colAddr') ?? '0')
    const itemEnd = Number(tbl.getAttribute('colCnt') ?? '0') - tailCols
    let band = 0
    for (const tr of this.rows(tbl)) {
      const sum = childrenOf(tr, 'tc')
        .filter((tc) => colOf(tc) >= headCols && colOf(tc) < itemEnd)
        .reduce((s, tc) => s + Number(childrenOf(tc, 'cellSz')[0]?.getAttribute('width') ?? '0'), 0)
      if (sum > band) band = sum
    }
    return band
  }

  /**
   * 항목 칸 폭을 band 안에서 병합 폭에 비례하게 다시 나눈다.
   *
   * ★ 열·병합을 전부 고친 **뒤 마지막에** 부른다. 중간에 부르면 그 뒤 작업이
   *   칸을 복제하면서 옛 폭을 물려받아 표가 종이를 넘어간다.
   */
  fitItemWidths(tbl: El, headCols: number, tailCols: number, band: number): void {
    const colOf = (tc: El) => Number(childrenOf(tc, 'cellAddr')[0]?.getAttribute('colAddr') ?? '0')
    const total = Number(tbl.getAttribute('colCnt') ?? '0')
    const itemEnd = total - tailCols
    const cols = itemEnd - headCols
    if (band <= 0 || cols <= 0) return

    for (const tr of this.rows(tbl)) {
      const items = childrenOf(tr, 'tc').filter(
        (tc) => colOf(tc) >= headCols && colOf(tc) < itemEnd,
      )
      if (items.length === 0) continue
      // 마지막 칸이 나머지를 받아 합이 정확히 band가 되게 한다
      let used = 0
      items.forEach((tc, i) => {
        const span = Number(childrenOf(tc, 'cellSpan')[0]?.getAttribute('colSpan') ?? '1')
        const w = i === items.length - 1 ? band - used : Math.round((band * span) / cols)
        used += w
        childrenOf(tc, 'cellSz')[0]?.setAttribute('width', String(Math.max(1, w)))
      })
    }
  }

  /**
   * 한 행의 항목 구간을 주어진 폭들로 다시 만든다.
   *
   * Ⅳ 표는 행마다 병합이 다르다. '평가 방법'·'영역 만점'은 문항 유형별로
   * 쪼개져 있고, '반영 비율'·'성취 기준'·'평가 시기'는 회차 하나가 그 유형들을
   * 통째로 덮는다. 열 수만 맞추면 이 병합이 어긋나 값이 밀린다.
   *
   * @param spans 항목 칸들의 가로 폭. 합이 항목 열 수와 같아야 한다.
   */
  setItemSpans(tbl: El, rowIdx: number, headCols: number, tailCols: number, spans: number[]): void {
    const colOf = (tc: El) => Number(childrenOf(tc, 'cellAddr')[0]?.getAttribute('colAddr') ?? '0')
    const total = Number(tbl.getAttribute('colCnt') ?? '0')
    const itemEnd = total - tailCols
    const tr = this.rows(tbl)[rowIdx]
    if (!tr || spans.length === 0) return

    const cells = childrenOf(tr, 'tc')
    const items = cells.filter((tc) => colOf(tc) >= headCols && colOf(tc) < itemEnd)
    if (items.length === 0) return
    if (items.length === spans.length) {
      // 개수가 맞으면 폭만 고친다 — 칸 내용(빨간 조각 등)을 지키는 편이 낫다
      items.forEach((tc, i) => this.setColSpan(tc, spans[i]))
    } else {
      const base = colOf(cells[0])
      const after = cells.find((tc) => colOf(tc) >= itemEnd) ?? null
      const proto = items[items.length - 1]
      for (const tc of items) tr.removeChild(tc)
      for (const span of spans) {
        const clone = proto.cloneNode(true) as El
        this.setColSpan(clone, span)
        if (after) tr.insertBefore(clone, after)
        else tr.appendChild(clone)
      }
      const head = childrenOf(tr, 'tc')[0]
      if (head) childrenOf(head, 'cellAddr')[0]?.setAttribute('colAddr', String(base))
    }
    this.renumberCols(tbl, total)
  }

  /** 한 칸의 가로 병합 폭. 그룹 머리(정기시험·수행평가)를 다시 씌울 때 쓴다. */
  setColSpan(tc: El, span: number): void {
    childrenOf(tc, 'cellSpan')[0]?.setAttribute('colSpan', String(Math.max(1, span)))
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
  replaceParaRun(anchor: El, stopAt: El | null, lines: string[], opts?: { red?: boolean }): void {
    const tops = this.topParas()
    const start = tops.indexOf(anchor) + 1
    const end = stopAt ? tops.indexOf(stopAt) : tops.length
    if (start <= 0) return

    const slice = tops.slice(start, end < 0 ? tops.length : end)
    if (slice.length === 0) return
    const filled = slice.filter((p) => this.paraText(p).trim() !== '')
    // 템플릿이 문단을 ''로 비워 뒀으면 글자 있는 문단이 없다.
    // 그 경우 구간의 첫 문단을 원형 삼아 그 앞에 끼워 넣는다.
    const marker = filled[0] ?? slice[0]
    const proto = marker.cloneNode(true) as El
    const parent = marker.parentNode!

    // 첫 문단 자리에 새 문단들을 순서대로 끼워 넣고, 원래 글자 문단은 전부 지운다
    for (const text of lines) {
      const np = proto.cloneNode(true) as El
      if (opts?.red) this.setParaRed(np, text)
      else this.setPara(np, text)
      parent.insertBefore(np, marker)
    }
    for (const p of filled) parent.removeChild(p)
  }

  /* ── 메모(안내문) ─────────────────────────── */

  /**
   * 양식의 안내 메모를 전부 지운다.
   * `<hp:ctrl>`에 `fieldBegin type="MEMO"` 또는 `fieldEnd`가 들어 있는 것을 통째로 없앤다.
   * 반환값 = 지운 개수.
   */
  removeMemos(): number {
    let n = 0
    for (const ctrl of descendants(this.sec, 'ctrl')) {
      const isMemo = childrenOf(ctrl, 'fieldBegin').some((f) => f.getAttribute('type') === 'MEMO')
      const isEnd = childrenOf(ctrl, 'fieldEnd').length > 0
      if (isMemo || isEnd) {
        ctrl.parentNode?.removeChild(ctrl)
        n++
      }
    }
    return n
  }

  /* ── 빨간 스팬 (양식이 표시한 '교사가 채울 곳') ── */

  /** charPr이 빨강인지 — header.xml을 한 번만 훑고 캐시한다 */
  private redIdsCache: Set<string> | null = null
  private redIds(): Set<string> {
    if (this.redIdsCache) return this.redIdsCache
    const set = new Set<string>()
    const { items } = this.headerList('charProperties', 'charPr')
    for (const c of items) {
      if (c.getAttribute('textColor') === '#FF0000') {
        const id = c.getAttribute('id')
        if (id) set.add(id)
      }
    }
    this.redIdsCache = set
    return set
  }

  isRedRun(run: El): boolean {
    const ref = run.getAttribute('charPrIDRef')
    return !!ref && this.redIds().has(ref)
  }

  /** 노드(문단·셀·표) 안의 빨간 run들을 문서 순서대로. 글자가 없는 run은 뺀다. */
  redRuns(node: El): El[] {
    return runsOutsideCtrl(node).filter((r) => this.isRedRun(r) && runText(r) !== '')
  }

  /** run 하나의 글자를 갈아끼운다 (첫 `<hp:t>`에 넣고 나머지는 비운다) */
  setRunText(run: El, text: string): void {
    const ts = childrenOf(run, 't')
    if (ts.length === 0) {
      const t = this.doc.createElementNS(HP_NS, 'hp:t')
      t.textContent = text
      run.appendChild(t)
      return
    }
    ts[0].textContent = text
    for (const t of ts.slice(1)) t.textContent = ''
  }

  /**
   * 노드 안의 빨간 스팬을 앞에서부터 `values`로 채운다.
   * value가 `null`이면 그 스팬은 그대로 둔다. 값이 모자라면 남은 스팬은 손대지 않는다.
   * 글자를 바꿨으니 그 문단의 줄바꿈 캐시는 지운다(⑥).
   * 반환값 = 실제로 바꾼 개수.
   */
  fillRed(node: El, values: (string | null)[]): number {
    const runs = this.redRuns(node)
    let n = 0
    runs.forEach((r, i) => {
      const v = values[i]
      if (v == null) return
      this.setRunText(r, v)
      n++
      // 이 run이 속한 문단의 줄바꿈 캐시 제거
      let p: Node | null = r.parentNode
      while (p && !(isEl(p) && p.localName === 'p')) p = p.parentNode
      if (isEl(p)) for (const lsa of childrenOf(p, 'linesegarray')) p.removeChild(lsa)
    })
    return n
  }

  /** 셀 안의 빨간 스팬 채우기 */
  fillCellRed(tbl: El, r: number, c: number, values: (string | null)[]): number {
    const tc = this.cell(tbl, r, c)
    return tc ? this.fillRed(tc, values) : 0
  }

  /* ── header.xml 서식 (빨강 · 배경색) ───────── */

  private headerList(container: string, item: string): { list: El; items: El[] } {
    const list = descendants(this.headerDoc.documentElement as unknown as El, container)[0]
    if (!list) throw new Error(`header.xml에 <${container}>가 없습니다`)
    return { list, items: childrenOf(list, item) }
  }

  /**
   * baseId charPr의 빨간 변형 id를 돌려준다.
   * 이미 같은 서식의 빨강이 있으면 재사용하고, 없으면 복제해 목록 끝에 추가한다.
   * itemCnt 갱신까지 여기서 한다. (charPr id는 0-based 연속 정수)
   */
  ensureRedCharPr(baseId: string): string {
    const hit = this.redCharPrCache.get(baseId)
    if (hit) return hit

    const { list, items } = this.headerList('charProperties', 'charPr')
    const base = items.find((x) => x.getAttribute('id') === baseId)
    if (!base) return baseId // 모르는 id면 색 없이 원본 유지

    if (base.getAttribute('textColor') === '#FF0000') {
      this.redCharPrCache.set(baseId, baseId)
      return baseId
    }

    const nextId = String(
      items.reduce((m, x) => Math.max(m, Number(x.getAttribute('id') ?? -1)), -1) + 1,
    )
    const clone = base.cloneNode(true) as El
    clone.setAttribute('id', nextId)
    clone.setAttribute('textColor', '#FF0000')
    list.appendChild(clone)
    list.setAttribute('itemCnt', String(items.length + 1))

    this.redCharPrCache.set(baseId, nextId)
    return nextId
  }

  /**
   * baseId borderFill에 배경색을 더한 변형 id를 돌려준다.
   * 테두리 조합은 그대로 복제하고 fillBrush만 추가/교체한다.
   * (borderFill id는 1-based)
   */
  ensureShadedBorderFill(baseId: string, faceColor: string): string {
    const key = `${baseId}:${faceColor}`
    const hit = this.shadeFillCache.get(key)
    if (hit) return hit

    const { list, items } = this.headerList('borderFills', 'borderFill')
    const base = items.find((x) => x.getAttribute('id') === baseId)
    if (!base) return baseId

    const nextId = String(
      items.reduce((m, x) => Math.max(m, Number(x.getAttribute('id') ?? 0)), 0) + 1,
    )
    const clone = base.cloneNode(true) as El
    clone.setAttribute('id', nextId)

    // 기존 fillBrush가 있으면 색만 바꾸고, 없으면 마지막 자식으로 만들어 붙인다
    const existing = descendants(clone, 'fillBrush')[0]
    if (existing) {
      const win = descendants(existing, 'winBrush')[0]
      if (win) win.setAttribute('faceColor', faceColor)
    } else {
      const brush = this.headerDoc.createElementNS(HC_NS, 'hc:fillBrush')
      const win = this.headerDoc.createElementNS(HC_NS, 'hc:winBrush')
      win.setAttribute('faceColor', faceColor)
      win.setAttribute('hatchColor', '#999999')
      win.setAttribute('alpha', '0')
      brush.appendChild(win)
      clone.appendChild(brush)
    }
    list.appendChild(clone)
    list.setAttribute('itemCnt', String(items.length + 1))

    this.shadeFillCache.set(key, nextId)
    return nextId
  }

  /** 표만 지운다. 한 문단에 표가 둘 이상 있을 때 쓴다. */
  removeTableOnly(tbl: El): boolean {
    return this.remove(tbl)
  }

  /* ── 저장 (①) ────────────────────────────── */

  async save(): Promise<Uint8Array> {
    // xmldom은 원본에 선언이 있으면 직렬화 결과에 그대로 담아 준다. 없을 때만 붙인다.
    const write = (name: string, document: Document) => {
      const serialized = new XMLSerializer().serializeToString(document as never)
      const xml = serialized.trimStart().startsWith('<?xml') ? serialized : XML_DECL + serialized
      this.files.set(name, new TextEncoder().encode(xml))
    }
    write(this.sectionName, this.doc)
    write(HEADER, this.headerDoc)

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
