/**
 * 값 → hwpx. 배포된 양식(`templates/form_2026.hwpx`)을 채운다.
 *
 * ★ 핵심 원칙: 양식의 **검은 글씨는 건드리지 않는다.**
 * 양식은 교사가 바꿀 곳을 이미 **빨간 글씨**로 표시해 두었다. 그 스팬만 갈아끼운다.
 * 그래서 Ⅶ·Ⅸ처럼 빨간 글씨가 없는 구역은 통째로 그대로 나간다 — 분량도 문체도 유지된다.
 *
 * 안내문은 전부 **메모**로 달려 있다. 마지막에 통째로 지운다.
 * 채워 넣은 값은 빨간 글씨 그대로 둔다 — 교사가 한글에서 읽고 검정으로 바꾸며 검토한다.
 */

import type { AiDraft, Performance, SchoolLayer, SemesterPlan, Subject } from '@/types'
import {
  areaRoman,
  calendarOf,
  classRange,
  essayExempt,
  essayTotal,
  examEssayShare,
  examRatioOf,
  examStandardCodes,
  isContinued,
  josa,
  monthWeekLabel,
  noticeWeek,
  periodLabel,
  rubricMax,
  scheduledHours,
  scoreSumLabels,
  tiebreakOrder,
} from '@/lib/derive'
import { perfNoteLine } from '@/lib/aiDraft'
import { HwpxDoc, childrenOf } from './doc'

export interface RenderReport {
  filled: string[]
  warnings: string[]
}

const CHECK_ORDER = [
  '서술·논술',
  '구술·발표',
  '토의·토론',
  '프로젝트',
  '실험·실습',
  '포트폴리오',
] as const

/**
 * Ⅺ 성취수준 표의 데이터 행 높이 (HWPUNIT).
 * 양식은 글자 분량대로 제각각(1466~6317)이라 표가 들쭉날쭉하다.
 * 두 줄이 들어가는 높이로 통일한다 — 넘치면 한글이 알아서 늘린다.
 */
const STD_ROW_HEIGHT = 2400

/** Ⅴ 성취도 기준표 — 양식에 다섯 벌이 있고 과목 유형에 맞는 하나만 남긴다 */
const GRADE_TABLE_FOR: Record<string, number> = {
  common: 0, // 공통과목 (공국·공수·공영·한국사·통사·통과)
  sci_lab: 1, // 공통과목 중 과탐실
  elective: 2, // 선택과목
  arts_pe: 3, // 음악·미술·체육
  pass_fail: 4, // 진로와 직업 (이수/미이수)
}

export async function renderForm(
  template: Uint8Array,
  plan: SemesterPlan,
  subject: Subject,
  school: SchoolLayer,
  ai?: AiDraft,
): Promise<{ bytes: Uint8Array; report: RenderReport }> {
  const doc = await HwpxDoc.load(template)
  const report: RenderReport = { filled: [], warnings: [] }
  const did = (s: string) => report.filled.push(s)
  const warn = (s: string) => report.warnings.push(s)

  const { rules } = school
  const calendar = calendarOf(school, plan.semester)
  const weeks = calendar.weeks
  const hours = scheduledHours(school, plan.semester, plan.credit)
  const tables = doc.topTables()
  const tops = () => doc.topParas()

  const areaName = (no: string | null) => subject.areas.find((a) => a.no === no)?.name ?? ''
  const stdByCode = new Map(subject.standards.map((s) => [s.code, s]))
  /** 진도표 단원명 칸은 그 주 성취기준의 소속 단원에서 파생한다 */
  const unitOfCode = (code: string) =>
    subject.units.find((u) => u.standard_codes.includes(code)) ?? null

  /** 구역 머리 표(Ⅰ·Ⅱ…)를 로마자로 찾는다 */
  const sectionTable = (roman: string) =>
    tables.find((t) => doc.cellText(t, 0, 0) === roman && doc.rows(t).length === 1)
  const paraOf = (node: Element): Element | null => {
    const list = tops()
    let n: Node | null = node
    while (n && !list.includes(n as Element)) n = n.parentNode
    return (n as Element) ?? null
  }
  /** 구역 사이의 최상위 문단들 */
  const between = (fromRoman: string, toRoman: string): Element[] => {
    const a = sectionTable(fromRoman)
    const b = sectionTable(toRoman)
    if (!a) return []
    const list = tops()
    const i = list.indexOf(paraOf(a)!)
    const j = b ? list.indexOf(paraOf(b)!) : list.length
    return list.slice(i + 1, j < 0 ? list.length : j)
  }
  /** 문단 앞머리로 찾기 (가. 나. 다. …) */
  const paraStartingWith = (scope: Element[], prefix: string) =>
    scope.find((p) => doc.paraText(p).trim().startsWith(prefix))

  /**
   * Ⅲ은 '1. 평가의 기본 방향'과 '2. 평가의 방침' 두 묶음이고 둘 다 가~차를 쓴다.
   * 나누지 않으면 Ⅲ-2의 '다.'가 Ⅲ-1의 '다.'를 덮어쓴다.
   */
  const splitIII = (): { one: Element[]; two: Element[] } => {
    const scope = between('Ⅲ', 'Ⅳ')
    const at = scope.findIndex((p) => /^2\.\s*평가의 방침/.test(doc.paraText(p).trim()))
    return at < 0 ? { one: scope, two: [] } : { one: scope.slice(0, at), two: scope.slice(at) }
  }

  /* ── 표지 · 대상 학년 (3줄) ─────────────────── */
  {
    doc.setCell(tables[0], 1, 0, [
      `${calendar.year}학년도 ${plan.grade}학년 ${calendar.semester}학기 < ${subject.name} >`,
      '교수학습 및 평가 운영계획',
    ])
    const teachers =
      plan.teachers.length > 0 ? plan.teachers.map((t) => `${t} (인)`).join(', ') : '(인)'
    // 양식대로 세 줄로 나눈다
    doc.setCell(tables[1], 0, 0, [
      `◆ 대상 학년 : ${plan.grade}학년 (${classRange(school, plan.grade) || '1반 ~ ○반'})`,
      `◆ 학점 : ${plan.credit}학점`,
      `◆ 지도 교사 : ${teachers}`,
    ])
    did('표지 · 대상 학년(3줄)')
  }

  /* ── 진도표 ───────────────────────────────── */
  const progress = tables.find(
    (t) => doc.cellText(t, 0, 0) === '주' && doc.cellText(t, 0, 1) === '기간',
  )
  if (!progress) warn('진도표를 찾지 못했습니다')
  else {
    // 양식은 앞쪽 몇 주가 4행 블록, 뒤쪽이 1행이라 섞여 있다. 1행/주로 정규화한다.
    const rows = doc.rows(progress)
    const proto = rows[rows.length - 1] // 마지막 주 = 7칸 단일 행
    if (childrenOf(proto, 'tc').length !== 7) {
      warn(`진도표 프로토타입 행의 칸이 7개가 아닙니다 (${childrenOf(proto, 'tc').length}개)`)
    }
    const protoClone = proto.cloneNode(true) as Element
    for (const tr of rows.slice(1)) progress.removeChild(tr)
    for (let i = 0; i < weeks.length; i++) {
      progress.appendChild(protoClone.cloneNode(true) as Element)
    }
    doc.renumber(progress)

    const noticeAt = new Map<number, Performance[]>()
    const perfAt = new Map<number, Performance[]>()
    for (const p of plan.performances) {
      const nw = noticeWeek(p, rules.notice_lead_weeks)
      noticeAt.set(nw, [...(noticeAt.get(nw) ?? []), p])
      perfAt.set(p.week, [...(perfAt.get(p.week) ?? []), p])
    }

    weeks.forEach((w, i) => {
      const r = i + 1
      // 그 주에 배정된 성취기준만 — 단원을 통째로 펼치지 않는다
      const codes = plan.distribution[w.no] ?? []
      const units = [...new Set(codes.map(unitOfCode).filter(Boolean))] as NonNullable<
        ReturnType<typeof unitOfCode>
      >[]

      /*
       * 단원명 칸 — 윗줄 영역, 아랫줄 단원명.
       *
       * 소단원을 따로 나누지 않은 과목은 영역이 그대로 단원이 된다(unitsFromAreas).
       * 그때 두 줄을 다 쓰면 같은 이름이 두 번 찍힌다:
       *   Ⅰ. 지수함수와 로그함수 / 01. 지수함수와 로그함수
       * 앞 번호만 다를 뿐 같은 말이면 아랫줄을 접는다.
       */
      const areaLine = [...new Set(units.map((u) => u.area_no))]
        .map((no) => `${areaRoman(no)}. ${areaName(no)}`)
        .join(' / ')
      const bare = (s: string) => s.replace(/^\s*[0-9]+\s*[.．]\s*/, '').trim()
      const sameAsArea =
        units.length > 0 && units.every((u) => bare(u.name) === bare(areaName(u.area_no)))
      const unitLine = sameAsArea ? '' : units.map((u) => u.name).join(' / ')

      // 두 주에 걸친 성취기준은 뒷주에 (계속)을 붙여 반복이 아님을 드러낸다
      const stdLines = codes.map((c) => {
        const s = stdByCode.get(c)
        const cont = isContinued(plan.distribution, w.no, c) ? ' (계속)' : ''
        return (s?.text ? `${c} ${s.text}` : c) + cont
      })

      // 주안점 = AI 4줄 + 수행평가 문구 (양식 메모가 요구하는 형식)
      const lines: string[] = []
      if (w.is_exam) {
        lines.push(`${plan.exams.find((e) => e.week === w.no)?.no ?? ''}회 정기시험`)
      } else {
        lines.push(...(ai?.weekly[w.no] ?? []))
      }
      for (const p of perfAt.get(w.no) ?? [])
        lines.push(perfNoteLine(p, '실시', plan.split_score_type))
      for (const p of noticeAt.get(w.no) ?? [])
        lines.push(perfNoteLine(p, '안내', plan.split_score_type))

      const h = hours.find((x) => x.no === w.no)

      doc.setCell(progress, r, 0, String(w.no))
      doc.setCell(progress, r, 1, periodLabel(w).replace(/–/g, '~'))
      /*
       * 단원명·성취기준도 빨간 글씨로 낸다.
       *
       * 코드가 계산한 값이라 틀릴 일이 없어 보이지만, 배분은 '어느 주에 무엇을'이라는
       * 판단이고 그건 교사가 확인해야 한다 — 앵커를 어디로 잡았는지에 따라 얼마든지
       * 달라진다. 읽고 검정으로 바꾸는 것이 곧 검토 절차다.
       */
      doc.setCell(progress, r, 2, w.is_exam ? '' : [areaLine, unitLine].filter(Boolean), {
        red: !w.is_exam,
      })
      doc.setCell(progress, r, 3, w.is_exam ? '' : stdLines.length ? stdLines : '', {
        red: !w.is_exam,
      })
      doc.setCell(progress, r, 4, lines.length ? lines : '', { red: !w.is_exam && !!ai })
      /*
       * 예정시간 / 실시누계 — 배포표가 있으면 그 값, 없으면 수업일수로 계산.
       * 머리 칸이 `예정시간` · 빈 줄 · `실시누계` 세 문단이라 데이터도 같은 모양으로
       * 맞춘다. 위아래로도 한 줄씩 띄워 숫자가 칸 가운데에 오게 한다.
       */
      doc.setCell(progress, r, 5, h ? ['', String(h.planned), '', String(h.cumulative), ''] : '', {
        red: true,
      })
      doc.setCell(progress, r, 6, w.events.join(', ') || '-')
    })
    did(`진도표 ${weeks.length}주 (1행/주로 정규화)`)
  }

  /*
   * Ⅰ 교수학습 운영계획은 글을 쓰지 않는다.
   *
   * 양식에도 실물 계획서(1·2·3학년 전부)에도 이 구역은 진도표 하나로 끝나고
   * 뒤에 '※ 단, 학사일정 …' 단서만 붙는다. 서술을 넣을 자리가 없다.
   * 진도표는 위에서 이미 채웠다.
   */

  /**
   * "가. 본문" 꼴 항목 문단을 갈아끼운다.
   *
   * 양식은 항목 하나가 빨간 run 여러 조각으로 쪼개져 있다 (예: «가. »«본문»«…»).
   * 머리글자(가.)까지 빨강 안에 들어 있으므로 첫 조각에 "머리글자 + 새 본문"을
   * 통째로 넣고 나머지 조각은 비운다. 검은 글씨는 손대지 않는다.
   */
  const fillItem = (p: Element | undefined, head: string, line: string): boolean => {
    if (!p || !line) return false
    const reds = doc.redRuns(p)
    if (reds.length === 0) return false
    doc.fillRed(
      p,
      reds.map((_, k) => (k === 0 ? `${head}${line}` : '')),
    )
    return true
  }

  /* ── Ⅱ 평가의 목적 — 가·나·다만 교체, 라·마는 양식 유지 ── */
  {
    const scope = between('Ⅱ', 'Ⅲ')
    const lines = ai?.sections.II ?? []
    const n = ['가. ', '나. ', '다. '].filter((h, i) =>
      fillItem(paraStartingWith(scope, h.trim()), h, lines[i]),
    ).length
    if (n > 0) did(`Ⅱ 평가의 목적 가·나·다 ${n}개 (라·마는 양식 유지)`)
    else warn('Ⅱ 평가의 목적에서 바꿀 빨간 스팬을 찾지 못했습니다')
  }

  /* ── Ⅲ-1 평가의 기본 방향 — 가·다·라는 AI, 나는 계산값 ── */
  {
    const scope = splitIII().one
    const lines = ai?.sections.III1 ?? []
    const n = ['가. ', '다. ', '라. '].filter((h, i) =>
      fillItem(paraStartingWith(scope, h.trim()), h, lines[i]),
    ).length
    if (n > 0) did(`Ⅲ-1 평가의 기본 방향 가·다·라 ${n}개 (마~차는 양식 유지)`)

    /*
     * 나 = 분할점수 방식. 양식에는 '추정분할점수'로 박혀 있어서, 고정분할을
     * 고른 계획서도 문서에는 추정이라고 쓰여 나갔다. 교사가 고른 값을 따른다.
     * AI 초안이 아니라 계산값이므로 검정 글씨 그대로 둔다.
     *
     * 진로와직업 같은 이수(P/F) 과목은 분할점수 자체가 없다 — 양식 메모가
     * "나 삭제 + P/F 문구 삽입"을 요구하는데, 삭제하면 다~차 재배열과 AI 문장
     * 앵커(가·다·라)가 전부 어긋난다. 같은 자리에 P/F 문장을 쓰는 것으로 갈음한다.
     */
    const b = paraStartingWith(scope, '나.')
    if (!b) warn("Ⅲ-1 '나.' 문단을 찾지 못했습니다")
    else if (subject.type === 'pass_fail') {
      doc.setPara(
        b,
        `나. 평가 결과는 점수가 아닌 이수 여부에 'P'로 기록하며, 미이수한 경우 'F'로 입력한다.`,
      )
      did('Ⅲ-1 나 · 이수 여부(P/F) 과목 문구')
    } else {
      doc.setPara(
        b,
        `나. 성취도는 기준 성취율에 따른 ${plan.split_score_type}분할점수로 설정하여 산출한다.`,
      )
      did(`Ⅲ-1 나 · ${plan.split_score_type}분할점수`)
    }
  }

  /* ── Ⅲ-2 평가의 방침 — 값 스팬만 ── */
  {
    const scope = splitIII().two
    // 조사는 앞말 끝소리를 따른다 — ‘…제시’와 ‘…토론’으로
    const perfNames = plan.performances
      .map((p, i) =>
        i === plan.performances.length - 1 ? `‘${p.name}’` : `‘${p.name}’${josa(p.name, '와')} `,
      )
      .join('')
    const put = (prefix: string, value: string, label: string) => {
      const p = paraStartingWith(scope, prefix)
      if (!p) return warn(`Ⅲ-2 '${prefix}' 문단을 찾지 못했습니다`)
      if (doc.fillRed(p, [value]) === 0) warn(`Ⅲ-2 '${prefix}'에 빨간 스팬이 없습니다`)
      else did(label)
    }
    put(
      '다.',
      plan.exam_count > 0
        ? `정기시험 횟수는 학기당 ${plan.exam_count}회`
        : '수행평가만으로 성적을 산출',
      'Ⅲ-2 다 · 정기시험 횟수',
    )
    put(
      '라.',
      plan.exam_count > 0
        ? `정기시험 ${plan.exam_ratio}%, 수행평가 ${plan.perf_ratio}%`
        : '수행평가 100%',
      'Ⅲ-2 라 · 반영 비율',
    )
    if (plan.performances.length > 0) {
      // 뒤에 오는 검은 글씨가 "로 구분하여…"라서, 받침이 있으면 '으'를 빨간 스팬 끝에 붙인다
      const last = plan.performances[plan.performances.length - 1].name
      const tail = josa(last, '로') === '으로' ? '으' : ''
      put('바.', `${perfNames}${tail}`, 'Ⅲ-2 바 · 수행평가명')
    }
    put('사.', `‘${tiebreakOrder(plan).join(' → ')}’`, 'Ⅲ-2 사 · 동점자 순서')

    /*
     * 마(서·논술형 30%)는 1단위 과목·수행 80% 이상이면 삭제한다 — 양식 메모의 지시.
     * 반드시 위의 put()들이 끝난 **뒤**여야 한다: 재배열은 바~차의 선두 글자를
     * 바꾸는데, setPara로 하면 방금 채운 빨간 스팬(수행평가명)이 뭉개진다.
     * 그래서 replaceParaLead(선두만 교체, run 구조 보존)를 쓴다.
     */
    if (essayExempt(plan)) {
      const ma = paraStartingWith(scope, '마.')
      if (!ma) warn("Ⅲ-2 '마.' 문단을 찾지 못했습니다")
      else {
        doc.remove(ma)
        const heads = ['바.', '사.', '아.', '자.', '차.']
        const to = ['마.', '바.', '사.', '아.', '자.']
        let moved = 0
        heads.forEach((h, i) => {
          const p = paraStartingWith(scope, h)
          if (p && doc.replaceParaLead(p, h, to[i])) moved++
        })
        did(`Ⅲ-2 마 삭제(서·논술 면제 — 1단위 또는 수행 80%↑) · ${moved}개 항목 번호 당김`)
      }
    }
  }

  /* ── Ⅳ 평가 계획 ──────────────────────────── */
  const evalTbl = tables.find((t) => doc.cellText(t, 0, 0) === '구분' && doc.rows(t).length >= 6)
  if (!evalTbl) warn('Ⅳ 평가 계획 표를 찾지 못했습니다')
  else {
    const examParts = plan.exams.flatMap((e) => e.parts)
    const cols = [
      ...plan.exams.map((e) => {
        const codes = examStandardCodes(subject, plan.exams, e.no)
        const es = e.parts.filter((p) => p.kind === '서술형').reduce((s, p) => s + p.points, 0)
        // 회차마다 반영 비율이 다를 수 있다 — 등분값을 쓰지 않는다
        const perExam = examRatioOf(plan, e.no)
        return {
          title: `${e.no}회 정기시험`,
          ratio: `${perExam}%`,
          // 소수점은 버린다 — 올려 적으면 30% 규칙을 넘긴 것처럼 보인다
          essay: es > 0 ? `서술형 ${examEssayShare(plan, e.no)}%` : '0%',
          std: codes.length ? `${codes[0]}~${codes[codes.length - 1]}` : '',
          when: monthWeekLabel(school, plan.semester, e.week),
        }
      }),
      ...plan.performances.map((p) => ({
        title: p.name,
        ratio: `${p.ratio}%`,
        essay: p.method_checks.includes('서술·논술') ? `논술형 ${p.ratio}%` : '0%',
        // 낮은 코드부터 — 정렬 전에 저장된 옛 계획서도 문서에서는 가지런히
        std: [...p.standard_codes].sort().join(', '),
        when: monthWeekLabel(school, plan.semester, p.week),
      })),
    ]

    /*
     * 열 수를 실제 항목 수에 맞춘다.
     *
     * 양식은 '정기시험 2회 + 수행평가 2개'로 열이 박혀 있다. 그대로 두면 항목이
     * 다를 때 값이 엉뚱한 열로 밀려 수행평가가 '정기시험' 머리 아래 앉는다.
     * 1회 정기시험만 문항 구분(선택형·서술형)까지 쪼개므로 그 회차는 두 열을 쓴다.
     */
    const HEAD_COLS = 2 // 구분 · 평가영역
    const TAIL_COLS = 1 // 비고
    /*
     * 정기시험은 회차마다 '문항 유형 수'만큼 열을 쓴다.
     * 실물 57개 과목을 세어 보니 국어·한국사는 회차당 1열(합계 2), 과학·영어는
     * 2열(합계 4), 수학은 3열(합계 6)이었다. 첫 회차만 쪼개진다고 보면 어긋난다.
     */
    const examCols = plan.exams.reduce((s, e) => s + Math.max(1, e.parts.length), 0)
    const wantCols = examCols + plan.performances.length

    if (wantCols > 0) {
      // 항목들이 쓰던 가로 폭 — 열을 건드리기 전에 재 둔다. 표 전체 폭은 종이가 정한다
      const band = doc.itemBandWidth(evalTbl, HEAD_COLS, TAIL_COLS)

      if (examCols === 0) {
        // 시험이 없으면 1회 정기시험이 쓰던 가로 병합까지 걷어내야 한다
        doc.normalizeItemCols(evalTbl, HEAD_COLS, TAIL_COLS, wantCols)
      } else {
        doc.fitItemCols(evalTbl, HEAD_COLS, TAIL_COLS, wantCols)
      }

      // 0행 묶음 머리 — 남은 항목 열을 정기시험·수행평가가 나눠 덮는다
      const head = childrenOf(doc.rows(evalTbl)[0], 'tc')
      const groups = head.filter((tc) => {
        const at = Number(childrenOf(tc, 'cellAddr')[0]?.getAttribute('colAddr') ?? '0')
        return at >= HEAD_COLS && at < HEAD_COLS + wantCols
      })
      const after = head.find((tc) => {
        const at = Number(childrenOf(tc, 'cellAddr')[0]?.getAttribute('colAddr') ?? '0')
        return at >= HEAD_COLS + wantCols
      })
      const want = [
        ...(examCols > 0 ? [{ span: examCols, text: `정기시험(${plan.exam_ratio}%)` }] : []),
        ...(plan.performances.length > 0
          ? [{ span: plan.performances.length, text: `수행평가(${plan.perf_ratio}%)` }]
          : []),
      ]
      const proto = groups[0]
      const row0 = doc.rows(evalTbl)[0]
      if (proto) {
        for (const tc of groups) row0.removeChild(tc)
        for (const g of want) {
          const clone = proto.cloneNode(true) as Element
          doc.setColSpan(clone, g.span)
          if (after) row0.insertBefore(clone, after)
          else row0.appendChild(clone)
          // 머리글은 '정기시험(' 은 검정, 비율만 빨강인 구조다 — 통째로 다시 쓴다
          const para = clone.getElementsByTagName('hp:p')[0]
          if (para) doc.setPara(para, g.text)
        }
        doc.renumberCols(evalTbl, HEAD_COLS + wantCols + TAIL_COLS)
      }

      /*
       * 행마다 병합을 다시 잡는다.
       * '평가 방법'·'영역 만점'은 문항 유형별로 쪼개지고, 나머지 값 행은
       * 회차 하나가 그 유형들을 통째로 덮는다.
       */
      const perfOnes = plan.performances.map(() => 1)
      const splitSpans = [...plan.exams.flatMap((e) => e.parts.map(() => 1)), ...perfOnes]
      const mergedSpans = [...plan.exams.map((e) => Math.max(1, e.parts.length)), ...perfOnes]
      const rowsOf = doc.rows(evalTbl)
      const labelAt = (label: string) =>
        rowsOf.findIndex((_, r) =>
          childrenOf(rowsOf[r], 'tc').some(
            (_c, ci) => (doc.cellText(evalTbl, r, ci) ?? '').trim() === label,
          ),
        )
      doc.setItemSpans(evalTbl, 1, HEAD_COLS, TAIL_COLS, mergedSpans) // 회차·수행평가명
      for (const [label, spans] of [
        ['평가 방법', splitSpans],
        ['영역 만점', splitSpans],
        ['반영 비율', mergedSpans],
        ['서술형･논술형', mergedSpans],
        ['성취 기준', mergedSpans],
        ['평가 시기', mergedSpans],
      ] as const) {
        const at = labelAt(label)
        if (at >= 0) doc.setItemSpans(evalTbl, at, HEAD_COLS, TAIL_COLS, spans)
      }

      // ★ 맨 마지막에 폭을 나눈다 — 중간에 하면 뒤 작업이 옛 폭을 물려받아 표가 넘친다
      doc.fitItemWidths(evalTbl, HEAD_COLS, TAIL_COLS, band)

      did(`Ⅳ 열 ${wantCols}개 (정기시험 ${examCols} · 수행평가 ${plan.performances.length})`)
    }

    // 회차·수행평가명 행 — 값이 없는 칸은 비운다 (양식의 '수행평가명1' 예시가 남지 않게)
    const titleCells = childrenOf(doc.rows(evalTbl)[1], 'tc')
    titleCells.forEach((_c, k) => doc.setCell(evalTbl, 1, k, cols[k]?.title ?? ''))

    /**
     * 라벨 행을 찾아 빨간 스팬을 앞에서부터 채운다.
     *
     * 양식의 빨간 칸은 '정기시험 2회 + 수행평가 2개' 기준으로 잡혀 있다.
     * 값이 그보다 적으면 남는 칸에 양식 예시(수행평가명1 · 49% 같은 것)가
     * 그대로 남아 문서로 새어 나간다 — 남는 칸은 반드시 비운다.
     * `tail`(비고 합계)은 위치가 아니라 **마지막 칸**에 넣는다.
     */
    const fillRow = (label: string, values: string[], what: string, tail?: string) => {
      const ri = doc
        .rows(evalTbl)
        .findIndex((_, r) =>
          childrenOf(doc.rows(evalTbl)[r], 'tc').some(
            (_c, ci) => (doc.cellText(evalTbl, r, ci) ?? '').trim() === label,
          ),
        )
      if (ri < 0) return warn(`Ⅳ '${label}' 행을 찾지 못했습니다`)

      const cells = childrenOf(doc.rows(evalTbl)[ri], 'tc')
      const labelAt = cells.findIndex(
        (_c, ci) => (doc.cellText(evalTbl, ri, ci) ?? '').trim() === label,
      )
      const start = labelAt + 1
      const last = cells.length - 1
      // 비고 칸은 합계 자리다 — 값 칸에서 뺀다
      const valueCells = tail != null ? last - start : last - start + 1
      if (valueCells < values.length) {
        warn(`Ⅳ '${label}' 행의 값 칸이 ${valueCells}개인데 값은 ${values.length}개입니다`)
      }

      /*
       * 한 칸에 빨간 조각이 여럿일 수 있다 (예: 성취기준 범위 "시작 ~ 끝").
       * 첫 조각에만 값을 넣고 나머지는 비운다.
       * 빨간 조각이 아예 없는 칸은 양식이 검은 예시를 박아 둔 자리다
       * (평가 시기의 정기시험 칸이 그렇다) — 그 칸은 통째로 덮어쓴다.
       * 어느 쪽이든 남겨 두면 양식 예시가 문서로 새어 나간다.
       */
      for (let k = 0; k < valueCells; k++) {
        const ci = start + k
        const reds = doc.redRuns(cells[ci]).length
        if (reds > 0) {
          doc.fillCellRed(evalTbl, ri, ci, [values[k] ?? '', ...Array(reds - 1).fill('')])
        } else {
          doc.setCell(evalTbl, ri, ci, values[k] ?? '')
        }
      }
      if (tail != null) {
        if (doc.redRuns(cells[last]).length > 0) doc.fillCellRed(evalTbl, ri, last, [tail])
        else doc.setCell(evalTbl, ri, last, tail)
      }
      did(what)
    }

    // 양식의 '평가 방법'·'영역 만점' 행은 1회 정기시험만 문항 구분(선택형·서술형)까지
    // 쪼개고 2회부터는 합계로 적는다. 빨간 칸 수가 그렇게 잡혀 있다.
    // 회차마다 문항 유형별로 한 칸씩 — 열을 그렇게 잡아 두었다
    const methodVals = [
      ...plan.exams.flatMap((e) => e.parts.map((p) => p.kind)),
      ...plan.performances.map((p) => p.method),
    ]
    const maxVals = [
      ...plan.exams.flatMap((e) => e.parts.map((p) => `${p.points}점`)),
      ...plan.performances.map((p) => `${p.max_score}점`),
    ]
    void examParts

    fillRow('평가 방법', methodVals, 'Ⅳ 평가 방법')
    fillRow('영역 만점', maxVals, 'Ⅳ 영역 만점')
    fillRow(
      '반영 비율',
      cols.map((c) => c.ratio),
      'Ⅳ 반영 비율',
      '100%',
    )
    fillRow(
      '서술형･논술형',
      cols.map((c) => c.essay),
      'Ⅳ 서술·논술',
      `${essayTotal(plan, plan.exam_ratio)}%`,
    )
    fillRow(
      '성취 기준',
      cols.map((c) => c.std),
      'Ⅳ 성취기준 범위',
    )
    fillRow(
      '평가 시기',
      cols.map((c) => c.when),
      'Ⅳ 평가 시기',
    )
  }

  /* ── Ⅴ 성취도 기준표 — 다섯 벌 중 하나만 남긴다 ── */
  {
    // 다섯 벌: 공통 · 과탐실 · 선택 · 음미체 는 머리가 '성취도',
    // 진로와 직업(P/F)만 '이수(P) | 이수한 경우 …' 로 다르다.
    const gradeTables = tables.filter(
      (t) =>
        doc.cellText(t, 0, 1) === '성취도' ||
        ((doc.cellText(t, 0, 0) ?? '').includes('이수(P)') && doc.rows(t).length === 2),
    )
    const keep = GRADE_TABLE_FOR[subject.type] ?? 2
    if (gradeTables.length < 5) {
      warn(`Ⅴ 성취도 표가 ${gradeTables.length}벌입니다 (5벌 기대)`)
    }
    gradeTables.forEach((t, i) => {
      if (i !== keep) doc.removeTable(t)
    })
    // 남긴 표 주변의 조건부 ※ 문단도 정리한다
    const scope = between('Ⅴ', 'Ⅵ')
    const mark = (s: string, g: string) => new RegExp(`[''‘’]${g}[''‘’]`).test(s)
    for (const p of scope) {
      const s = doc.paraText(p).trim()
      if (s === '') continue
      if (s.startsWith(':')) {
        /*
         * 양식은 '추정/고정' 중 고르라고 형광펜을 칠해 두었다. 글자만 갈면
         * 형광펜이 남아 노랗게 인쇄된다 — 고른 뒤에는 표시를 걷어야 한다.
         */
        doc.fillRed(p, [plan.split_score_type === '추정' ? '추정' : '고정'])
        const base = doc.charPrOf(p)
        for (const run of doc.redRuns(p)) run.setAttribute('charPrIDRef', base)
        did(`Ⅴ ${plan.split_score_type}분할점수 (표시 제거)`)
        continue
      }
      const keepNote =
        (mark(s, 'E') && subject.type === 'common') ||
        (mark(s, 'C') && subject.type === 'sci_lab') ||
        (mark(s, 'P') && subject.type === 'pass_fail')
      if (!keepNote && (s.startsWith('※') || s.startsWith('<'))) doc.remove(p)
    }

    /*
     * 표 넉 벌과 부기를 걷어내면 빈 문단만 줄줄이 남는다. 한글에서 열면
     * 그만큼 허옇게 비어 보인다 — 표 바로 앞 한 줄만 여백으로 두고 지운다.
     */
    const rest = between('Ⅴ', 'Ⅵ')
    const hasTbl = (p: Element) => p.getElementsByTagName('hp:tbl').length > 0
    const tableAt = rest.findIndex(hasTbl)
    let dropped = 0
    rest.forEach((p, i) => {
      if (hasTbl(p) || doc.paraText(p).trim() !== '') return
      if (i === tableAt - 1) return
      if (doc.remove(p)) dropped++
    })
    if (dropped > 0) did(`Ⅴ 빈 문단 ${dropped}개 정리`)
    did(`Ⅴ 성취도 기준표 (${['공통', '과탐실', '선택', '음미체', 'P/F'][keep]}만 유지)`)
  }

  /* ── Ⅵ 수행평가 세부기준 ──────────────────── */
  {
    // 양식에는 빈 표 2벌 + '예시' 표 1벌이 있다. 예시는 지운다.
    const perfTables = tables.filter(
      (t) => doc.rows(t).length >= 10 && (doc.cellText(t, 1, 0) ?? '').includes('수행 활동 과정'),
    )
    const exampleTbl = tables.find(
      (t) => (doc.cellText(t, 0, 0) ?? '') === '성취기준' && doc.rows(t).length === 12,
    )
    const examplePara = tops().find((p) => doc.paraText(p).trim() === '예시')
    if (exampleTbl) doc.removeTable(exampleTbl)
    if (examplePara) doc.remove(examplePara)

    if (perfTables.length === 0) warn('수행평가 세부기준 표를 찾지 못했습니다')
    else {
      const n = plan.performances.length
      // 표가 남으면 지우고, 모자라면 첫 벌을 문단째 복제한다
      const protoPara = paraOf(perfTables[0])!
      const parent = protoPara.parentNode!
      const titleOf = (t: Element) => {
        const list = tops()
        const i = list.indexOf(paraOf(t)!)
        for (let k = i - 1; k >= 0 && k >= i - 3; k--) {
          if (/^\d+\.\s/.test(doc.paraText(list[k]).trim())) return list[k]
        }
        return null
      }
      const slots: { tbl: Element; title: Element | null }[] = perfTables.map((t) => ({
        tbl: t,
        title: titleOf(t),
      }))
      for (let i = n; i < slots.length; i++) {
        doc.removeTable(slots[i].tbl)
        if (slots[i].title) doc.remove(slots[i].title!)
      }
      let after: Node = paraOf(perfTables[perfTables.length - 1])!
      for (let i = slots.length; i < n; i++) {
        const t2 = slots[0].title ? (slots[0].title.cloneNode(true) as Element) : null
        const p2 = protoPara.cloneNode(true) as Element
        if (t2) {
          parent.insertBefore(t2, after.nextSibling)
          after = t2
        }
        parent.insertBefore(p2, after.nextSibling)
        after = p2
        const inner = Array.from(p2.getElementsByTagName('*')).find(
          (e) => (e as Element).localName === 'tbl',
        ) as Element
        slots.push({ tbl: inner, title: t2 })
      }

      plan.performances.forEach((p, i) => {
        const slot = slots[i]
        if (!slot) return
        if (slot.title) doc.setPara(slot.title, `${i + 1}. ${p.name}`)
        const draft = ai?.perfs[p.id]
        const eff = draft ? { ...p, activity: draft.activity, rubric: draft.rubric } : p
        fillPerfTable(doc, slot.tbl, eff, i, warn, { red: !!draft })
      })
      did(`Ⅵ 수행평가 세부기준 ${n}벌 (예시 표 제거)`)
    }
  }

  /* ── Ⅷ 결시생 — 정기시험 없으면 가. 삭제, 표 분기 정리 ── */
  {
    const scope = between('Ⅷ', 'Ⅸ')
    if (plan.exam_count === 0) {
      const ga = paraStartingWith(scope, '가.')
      if (ga) {
        doc.remove(ga)
        // 나·다·라 → 가·나·다로 당긴다
        const order = ['나.', '다.', '라.', '마.']
        const to = ['가.', '나.', '다.', '라.']
        order.forEach((k, i) => {
          const p = paraStartingWith(between('Ⅷ', 'Ⅸ'), k)
          if (p) doc.setPara(p, doc.paraText(p).replace(new RegExp(`^${k}`), to[i]))
        })
        did('Ⅷ 정기시험 없음 — 가. 삭제 후 번호 당김')
      }
    }
    /*
     * 결시생 표의 '수행평가가 불가능한 신체장애 학생' 칸에는 산출식 블록이 둘 있다.
     * 양식 메모: "정기시험을 보는 과목은 '수행평가 100%인 경우'를 삭제,
     *            수행평가만 보는 과목은 '기본점수가 있는 영역의 경우'를 삭제"
     * 행을 지우면 신체장애 조항 자체가 사라진다 — 셀 안 블록만 걷어낸다.
     */
    const absent = tables.find(
      (t) => doc.cellText(t, 0, 0) === '구분' && doc.cellText(t, 0, 1) === '성적 처리',
    )
    if (!absent) warn('Ⅷ 결시생 표를 찾지 못했습니다')
    else {
      const drop = plan.exam_count > 0 ? '수행평가 100%인 경우' : '기본점수가 있는 영역의 경우'
      const rows = doc.rows(absent)
      const at = rows.findIndex((_, r) => (doc.cellText(absent, r, 1) ?? '').includes('기본점수'))
      const tc = at >= 0 ? doc.cell(absent, at, 1) : null
      if (!tc) warn("Ⅷ 결시생 표에서 '신체장애 학생' 칸을 찾지 못했습니다")
      else if (doc.removeCellBlock(tc, drop)) did(`Ⅷ 결시생 · '${drop}' 산출식 제거 (행은 유지)`)
      else warn(`Ⅷ 결시생 · '${drop}' 블록을 찾지 못했습니다`)
    }
  }

  /* ── Ⅹ 원격수업 — 학년·과목명만 ─────────────── */
  {
    const scope = between('Ⅹ', 'Ⅺ')
    const p = scope.find((x) => doc.paraText(x).includes('학습 플랫폼'))
    if (p) {
      const reds = doc.redRuns(p)
      // «O»학년 «과목명» … «O»학년 «과목명» 순서
      doc.fillRed(
        p,
        reds.map((_, i) => (i % 2 === 0 ? String(plan.grade) : subject.name)),
      )
      did('Ⅹ 원격수업 · 학년·과목명')
    } else warn('Ⅹ 학습 플랫폼 문단을 찾지 못했습니다')
  }

  /* ── Ⅺ 성취기준별 성취수준 ────────────────── */
  {
    const stdTables = tables.filter(
      (t) =>
        doc.cellText(t, 0, 0) === '성취기준' &&
        (doc.cellText(t, 0, 1) ?? '').includes('성취기준별'),
    )
    const areasWithStd = subject.areas.filter((a) =>
      subject.standards.some((s) => s.area_no === a.no),
    )
    if (stdTables.length === 0) warn('Ⅺ 성취수준 표를 찾지 못했습니다')
    else {
      const grades: ('A' | 'B' | 'C' | 'D' | 'E')[] =
        subject.scale_type === 'LVL_3' ? ['A', 'B', 'C'] : ['A', 'B', 'C', 'D', 'E']
      const titleOf = (t: Element) => {
        const list = tops()
        const i = list.indexOf(paraOf(t)!)
        for (let k = i - 1; k >= 0 && k >= i - 3; k--) {
          const s = doc.paraText(list[k]).trim()
          if (/^\(\d+\)/.test(s)) return list[k]
        }
        return null
      }
      const slots = stdTables.map((t) => ({ tbl: t, title: titleOf(t) }))
      // 남는 벌은 제거
      for (let i = areasWithStd.length; i < slots.length; i++) {
        doc.removeTable(slots[i].tbl)
        if (slots[i].title) doc.remove(slots[i].title!)
      }
      // 모자라면 복제
      const protoPara = paraOf(stdTables[0])!
      const parent = protoPara.parentNode!
      let after: Node = paraOf(stdTables[stdTables.length - 1])!
      for (let i = slots.length; i < areasWithStd.length; i++) {
        const t2 = slots[0].title ? (slots[0].title.cloneNode(true) as Element) : null
        const p2 = protoPara.cloneNode(true) as Element
        if (t2) {
          parent.insertBefore(t2, after.nextSibling)
          after = t2
        }
        parent.insertBefore(p2, after.nextSibling)
        after = p2
        const inner = Array.from(p2.getElementsByTagName('*')).find(
          (e) => (e as Element).localName === 'tbl',
        ) as Element
        slots.push({ tbl: inner, title: t2 })
      }

      areasWithStd.forEach((area, ai2) => {
        const { tbl, title } = slots[ai2]
        if (title) doc.setPara(title, `(${ai2 + 1}) ${area.name}`)
        const items = subject.standards.filter((s) => s.area_no === area.no)
        doc.repeatRowBlock(tbl, 1, 5, items.length)
        items.forEach((it, i) => {
          const base = 1 + i * 5
          doc.setCell(tbl, base, 0, it.text ? `${it.code} ${it.text}` : it.code)
          grades.forEach((g, k) => {
            const r = base + k
            const off = k === 0 ? 1 : 0 // 첫 행은 성취기준 셀이 앞에 온다
            doc.setCell(tbl, r, off, g)
            doc.setCell(tbl, r, off + 1, it.levels[g] ?? '')
          })
          for (let k = grades.length; k < 5; k++) {
            doc.setCell(tbl, base + k, 0, '')
            doc.setCell(tbl, base + k, 1, '')
          }
        })
        // 양식은 글자 분량에 따라 행 높이가 제각각이다 — 데이터 행을 같은 높이로 맞춘다
        doc.setRowHeights(tbl, 1, STD_ROW_HEIGHT)
      })
      did(
        `Ⅺ 성취수준 ${areasWithStd.length}개 영역 · 성취기준 ${subject.standards.length}개 (행 높이 균일)`,
      )
    }
  }

  /* ── 학기단위 성취수준 (+ 최소 성취수준) ────── */
  {
    const semTbl = tables.find((t) => doc.cellText(t, 0, 1) === '학기단위 성취수준')
    if (!semTbl) warn('학기단위 성취수준 표를 찾지 못했습니다')
    else {
      const grades: ('A' | 'B' | 'C' | 'D' | 'E')[] =
        subject.scale_type === 'LVL_3' ? ['A', 'B', 'C'] : ['A', 'B', 'C', 'D', 'E']
      // 교사가 직접 쓴 문장이 있으면 AI보다 우선하고, 검토 표시(빨강)도 안 붙인다
      const manualLv = subject.semester_levels_manual === true
      const levels = manualLv
        ? subject.semester_levels
        : (ai?.sections.semesterLevels ?? subject.semester_levels)
      const rows = doc.rows(semTbl)
      const minRow = rows.findIndex((_, r) =>
        (doc.cellText(semTbl, r, 0) ?? '').includes('최소 성취수준'),
      )

      for (const g of grades) {
        const r = rows.findIndex((_, k) => (doc.cellText(semTbl, k, 0) ?? '').trim() === g)
        if (r > 0) doc.setCell(semTbl, r, 1, levels[g] ?? '', { red: !!ai && !manualLv })
      }
      // 3단계 과목은 D·E 행을 비운다
      for (const g of ['D', 'E'] as const) {
        if (grades.includes(g)) continue
        const r = rows.findIndex((_, k) => (doc.cellText(semTbl, k, 0) ?? '').trim() === g)
        if (r > 0) doc.setCell(semTbl, r, 1, '')
      }

      if (minRow > 0) {
        if (subject.is_common) {
          doc.setCell(semTbl, minRow, 1, ai?.sections.minLevel ?? subject.min_level ?? '', {
            red: !!ai,
          })
        } else {
          // 공통과목이 아니면 이 행만 삭제
          semTbl.removeChild(doc.rows(semTbl)[minRow])
          doc.renumber(semTbl)
        }
      }
      did(`학기단위 성취수준${subject.is_common ? ' + 최소 성취수준' : ' (최소 성취수준 행 제거)'}`)
    }
  }

  /* ── 안내 메모 제거 ───────────────────────── */
  const memos = doc.removeMemos()
  did(`안내 메모 ${memos}개 제거`)

  return { bytes: await doc.save(), report }
}

/* ── 수행평가 세부기준 표 채우기 ──────────────── */

function fillPerfTable(
  doc: HwpxDoc,
  tbl: Element,
  perf: Parameters<typeof rubricMax>[0],
  index: number,
  warn: (s: string) => void,
  opts?: { red?: boolean },
): void {
  const rows = doc.rows(tbl)
  const HEAD = rows.findIndex((_, r) => (doc.cellText(tbl, r, 0) ?? '').includes('평가 영역')) + 1
  if (HEAD <= 0) {
    warn(`${index + 1}번 수행평가 표에서 '평가 영역' 머리행을 찾지 못했습니다`)
    return
  }
  const elements = perf.rubric.length
  if (elements === 0) warn(`${index + 1}번 수행평가에 루브릭이 없습니다`)

  doc.setCell(tbl, 0, 1, [...perf.standard_codes].sort().join(', ') || '')
  doc.setCell(tbl, 1, 1, perf.activity || '', { red: opts?.red })
  doc.setCell(
    tbl,
    2,
    1,
    CHECK_ORDER.map((c) => `${perf.method_checks.includes(c) ? '■' : '□'}${c}`).join(' ') +
      ` ${perf.method_checks.includes('기타') ? '■' : '□'}기타(방법명 기재)`,
  )

  const remark = rows[rows.length - 1]
  const proto = [rows[HEAD + 2], rows[HEAD + 3]]
  if (!proto[0] || !proto[1]) {
    warn(`${index + 1}번 수행평가 표에 복제할 요소 블록이 없습니다`)
    return
  }
  const protoClone = proto.map((r) => r.cloneNode(true) as Element)
  const firstBlock = [rows[HEAD], rows[HEAD + 1]]

  for (const tr of doc.rows(tbl).slice(HEAD)) tbl.removeChild(tr)
  tbl.appendChild(firstBlock[0])
  tbl.appendChild(firstBlock[1])
  for (let i = 1; i < Math.max(1, elements); i++) {
    for (const r of protoClone) tbl.appendChild(r.cloneNode(true) as Element)
  }
  tbl.appendChild(remark)
  doc.renumber(tbl)

  const span = Math.max(1, elements) * 2 + 1
  const firstRowCells = childrenOf(doc.rows(tbl)[HEAD], 'tc')
  for (const tc of [firstRowCells[0], firstRowCells[firstRowCells.length - 1]]) {
    const cs = childrenOf(tc, 'cellSpan')[0]
    if (cs && cs.getAttribute('rowSpan') !== '1') cs.setAttribute('rowSpan', String(span))
  }

  doc.setCell(tbl, HEAD, 0, `${perf.name}(${perf.max_score}점)`)
  doc.setCell(tbl, HEAD, firstRowCells.length - 1, scoreSumLabels(perf))

  perf.rubric.forEach((row, i) => {
    const scoreRow = HEAD + i * 2
    const textRow = scoreRow + 1
    const off = i === 0 ? 1 : 0
    doc.setCell(tbl, scoreRow, off, row.element)
    row.levels.forEach((lv, k) => doc.setCell(tbl, scoreRow, off + 1 + k, String(lv.score)))
    row.levels.forEach((lv, k) => doc.setCell(tbl, textRow, k, lv.text, { red: opts?.red }))
  })

  const remarkRow = doc.rows(tbl).length - 1
  doc.setCell(
    tbl,
    remarkRow,
    1,
    `기본 점수(미응시, 미제출, 백지 제출, 불응, 추가 평가 불응, 표절) : ${perf.base_score}점`,
  )
}
