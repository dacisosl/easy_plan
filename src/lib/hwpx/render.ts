/**
 * 값 → hwpx. templates/plan_blank.hwpx를 채워 완성본을 만든다.
 *
 * 표는 번호가 아니라 '서명'(머리행 글자)으로 찾는다. 양식이 조금 바뀌어도 버틴다.
 * 문단은 구역 머리 표를 기준으로 그 뒤에 이어지는 최상위 문단을 통째로 갈아끼운다.
 * 가·나·다는 여기서 처음 붙는다 — 저장된 값에는 번호가 없다.
 */

import type { AiDraft, SchoolLayer, SemesterPlan, Subject } from '@/types'
import {
  achievementTableFor,
  areaRoman,
  classRange,
  essayTotal,
  examStandardCodes,
  koOrdinal,
  monthWeekLabel,
  noticeWeek,
  periodLabel,
  renderSection,
  rubricMax,
  scoreSumLabels,
  type SentenceContext,
} from '@/lib/derive'
import { HwpxDoc, childrenOf } from './doc'

export interface RenderReport {
  filled: string[]
  warnings: string[]
}

/** 교사가 직접 채울 칸의 배경색 (연노랑) */
const FILL_ME = '#FFF3C4'

const CHECK_ORDER = [
  '서술·논술',
  '구술·발표',
  '토의·토론',
  '프로젝트',
  '실험·실습',
  '포트폴리오',
] as const

export async function renderPlan(
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

  const tables = doc.topTables()
  const head = (t: Element) => doc.headOf(t)
  const findTable = (pred: (h: string[], t: Element) => boolean) =>
    tables.find((t) => pred(head(t), t))

  const { calendar, rules } = school
  const hasRank = subject.type !== 'pass_fail' && subject.type !== 'arts_pe'
  const ctx: SentenceContext = { subject, plan, school, hasRank }

  const orderedUnits = [...subject.units].sort((a, b) => a.order - b.order)
  const unitById = new Map(orderedUnits.map((u) => [u.id, u]))
  const areaName = (no: string | null) => subject.areas.find((a) => a.no === no)?.name ?? ''
  const stdByCode = new Map(subject.standards.map((s) => [s.code, s]))

  /* ── 표지 · 대상 학년 ─────────────────────── */
  doc.setCell(tables[0], 1, 0, [
    `${calendar.year}학년도 ${plan.grade}학년 ${calendar.semester}학기 < ${subject.name} >`,
    '교수학습 및 평가 운영계획',
  ])
  const teachers = plan.teachers.length ? plan.teachers.map((t) => `${t} (인)`).join(', ') : '(인)'
  doc.setCell(
    tables[1],
    0,
    0,
    `◆ 대상 학년 : ${plan.grade}학년 (${classRange(school, plan.grade) || '1반 ~ ○반'})  ` +
      `◆ 학점 : ${plan.credit}학점  ◆ 지도 교사 : ${teachers}`,
  )
  did('표지 · 대상 학년')

  /* ── 진도표 ───────────────────────────────── */
  const progress = findTable((h) => h[0] === '주' && h[1] === '기간')
  if (!progress) warn('진도표를 찾지 못했습니다')
  else {
    doc.fitRows(progress, 1, calendar.weeks.length)
    const noticeAt = new Map<number, string[]>()
    const perfAt = new Map<number, string[]>()
    for (const p of plan.performances) {
      const nw = noticeWeek(p, rules.notice_lead_weeks)
      noticeAt.set(nw, [...(noticeAt.get(nw) ?? []), p.name])
      perfAt.set(p.week, [...(perfAt.get(p.week) ?? []), p.name])
    }

    calendar.weeks.forEach((w, i) => {
      const r = i + 1
      const ids = plan.distribution[w.no] ?? []
      const units = ids.map((id) => unitById.get(id)).filter(Boolean) as typeof orderedUnits

      // 단원명 칸은 두 줄이다 — 윗줄이 영역, 아랫줄이 단원명
      const areaLine = [...new Set(units.map((u) => u.area_no))]
        .map((no) => `${areaRoman(no)}. ${areaName(no)}`)
        .join(' / ')
      const unitLine = units.map((u) => u.name).join(' / ')

      const codes = units.flatMap((u) => u.standard_codes)
      const stdLines = codes.map((c) => {
        const s = stdByCode.get(c)
        return s?.text ? `${c} ${s.text}` : c
      })

      // 5열 = 수업 방법 및 수업·평가 연계의 주안점 (AI, 빨강) + 평가 표시(검정)
      const evals = [
        w.is_exam ? `${plan.exams.find((e) => e.week === w.no)?.no ?? ''}회 정기시험` : '',
        ...(perfAt.get(w.no)?.map((n) => `[수행평가 실시] ${n}`) ?? []),
        ...(noticeAt.get(w.no)?.map((n) => `[수행평가 안내] ${n}`) ?? []),
      ].filter(Boolean)
      const weekly = ai?.weekly[w.no] ?? []

      doc.setCell(progress, r, 0, String(w.no))
      doc.setCell(progress, r, 1, periodLabel(w).replace(/–/g, '~'))
      doc.setCell(progress, r, 2, [areaLine, unitLine].filter(Boolean))
      doc.setCell(progress, r, 3, stdLines.length ? stdLines : '')
      if (weekly.length > 0) {
        // AI 주안점(빨강)과 평가 표시(검정)를 같은 칸에 문단으로 나눠 넣는다.
        // 빨강을 쓰기 전에 원래(검정) 서식 참조를 확보해 둔다.
        const tc = doc.cell(progress, r, 4)!
        const sub = childrenOf(tc, 'subList')[0]
        const blackRef = doc.charPrOf(childrenOf(sub, 'p')[0])
        doc.setCellRed(progress, r, 4, weekly)
        for (const line of evals) {
          const np = childrenOf(sub, 'p')[0].cloneNode(true) as Element
          doc.setPara(np, line, { charPrIDRef: blackRef })
          sub.appendChild(np)
        }
      } else {
        doc.setCell(progress, r, 4, evals.length ? evals : '')
      }
      // 예정시간/실시누계는 채우지 않는다 — 교사가 직접. 배경색으로 표시만.
      doc.setCell(progress, r, 5, '')
      if (!w.is_exam) doc.setCellShade(progress, r, 5, FILL_ME)
      doc.setCell(progress, r, 6, w.events.join(', ') || '-')
    })
    did(`진도표 ${calendar.weeks.length}주`)
  }

  /* ── 구역 본문 문단 ───────────────────────── */
  const sectionTable = (roman: string) =>
    tables.find((t) => doc.cellText(t, 0, 0) === roman && doc.rows(t).length === 1)

  const paraOf = (tbl: Element): Element | null => {
    const tops = doc.topParas()
    let n: Node | null = tbl
    while (n && !tops.includes(n as Element)) n = n.parentNode
    return (n as Element) ?? null
  }

  const writeBody = (
    roman: string,
    nextRoman: string | null,
    lines: string[],
    label: string,
    opts?: { red?: boolean },
  ) => {
    const t = sectionTable(roman)
    if (!t) return warn(`${roman} 구역 머리 표를 찾지 못했습니다`)
    const anchor = paraOf(t)
    const nextT = nextRoman ? sectionTable(nextRoman) : null
    let stop = nextT ? paraOf(nextT) : null
    if (!anchor) return warn(`${roman} 구역의 문단 위치를 찾지 못했습니다`)
    if (lines.length === 0) return

    // 구간 안의 ※ 안내 문단(예: Ⅰ의 '※ 단, 학사일정…')은 남긴다 — 거기서 멈춘다
    {
      const tops = doc.topParas()
      const from = tops.indexOf(anchor) + 1
      const to = stop ? tops.indexOf(stop) : tops.length
      const note = tops.slice(from, to < 0 ? tops.length : to).find((p) =>
        doc.paraText(p).trim().startsWith('※'),
      )
      if (note) stop = note
    }

    doc.replaceParaRun(anchor, stop, lines, opts)
    did(`${label} 문단 ${lines.length}개${opts?.red ? ' (빨강)' : ''}`)
  }

  const numbered = (section: 'Ⅲ-1' | 'Ⅲ-2' | 'Ⅶ' | 'Ⅷ' | 'Ⅸ' | 'Ⅹ') =>
    renderSection(section, ctx).map((s) => `${s.ordinal}. ${s.text}`)

  /** 문단 배열에 가·나·다를 붙인다 — AI 초안 출력용 */
  const ordinated = (lines: string[]) => lines.map((s, i) => `${koOrdinal(i)}. ${s}`)

  // Ⅰ 교수학습 운영계획 — AI 초안(빨강). 없으면 과목 레이어 값(검정).
  if (ai?.sections.I.length) {
    writeBody('Ⅰ', 'Ⅱ', ai.sections.I, 'Ⅰ 교수학습 운영계획', { red: true })
  } else {
    writeBody(
      'Ⅰ',
      'Ⅱ',
      subject.teaching_plan.split(/\n+/).map((s) => s.trim()).filter(Boolean),
      'Ⅰ 교수학습 운영계획',
    )
  }

  // Ⅱ 평가의 목적 — 줄마다 가·나·다
  if (ai?.sections.II.length) {
    writeBody('Ⅱ', 'Ⅲ', ordinated(ai.sections.II), 'Ⅱ 평가의 목적', { red: true })
  } else {
    writeBody(
      'Ⅱ',
      'Ⅲ',
      ordinated(subject.objectives.split(/\n+/).map((s) => s.trim()).filter(Boolean)),
      'Ⅱ 평가의 목적',
    )
  }

  // Ⅲ은 '1. 평가의 기본 방향'과 '2. 평가의 방침' 두 묶음이다
  {
    const t = sectionTable('Ⅲ')
    const anchor = t ? paraOf(t) : null
    const nextT = sectionTable('Ⅳ')
    const stop = nextT ? paraOf(nextT) : null
    if (!anchor) warn('Ⅲ 구역을 찾지 못했습니다')
    else {
      doc.replaceParaRun(anchor, stop, [
        '1. 평가의 기본 방향',
        ...numbered('Ⅲ-1'),
        '2. 평가의 방침',
        ...numbered('Ⅲ-2'),
      ])
      did('Ⅲ 평가의 기본 방향과 방침')
    }
  }

  writeBody('Ⅶ', 'Ⅷ', numbered('Ⅶ'), 'Ⅶ 수행평가 시 유의 사항')

  // Ⅸ · Ⅹ — AI 초안(빨강). 없으면 문장 은행(검정).
  if (ai?.sections.IX.length) {
    writeBody('Ⅸ', 'Ⅹ', ordinated(ai.sections.IX), 'Ⅸ 평가 결과의 활용 방안', { red: true })
  } else {
    writeBody('Ⅸ', 'Ⅹ', numbered('Ⅸ'), 'Ⅸ 평가 결과의 활용 방안')
  }
  if (ai?.sections.X.length) {
    writeBody('Ⅹ', 'Ⅺ', ordinated(ai.sections.X), 'Ⅹ 원격수업 운영 시 평가 계획', { red: true })
  } else {
    writeBody('Ⅹ', 'Ⅺ', numbered('Ⅹ'), 'Ⅹ 원격수업 운영 시 평가 계획')
  }

  // Ⅷ은 문단 사이에 결시생 표가 끼어 있다. 표 앞뒤로 나눠 쓴다.
  {
    const t = sectionTable('Ⅷ')
    const absentTbl = findTable((h) => h[0] === '구분' && h[1] === '성적 처리')
    const anchor = t ? paraOf(t) : null
    if (!anchor || !absentTbl) warn('Ⅷ 구역 또는 결시생 표를 찾지 못했습니다')
    else {
      const lines = numbered('Ⅷ')
      const tblPara = paraOf(absentTbl)
      doc.replaceParaRun(anchor, tblPara, lines.slice(0, 2))
      if (lines.length > 2) {
        const nextT = sectionTable('Ⅸ')
        doc.replaceParaRun(tblPara!, nextT ? paraOf(nextT) : null, lines.slice(2))
      }
      did(`Ⅷ 결시생의 성적 처리 문단 ${lines.length}개`)
    }
  }

  /* ── Ⅳ 평가 계획 ──────────────────────────── */
  const evalTbl = findTable((h) => h[0] === '구분' && h.some((x) => x.includes('평가영역')))
  if (!evalTbl) warn('Ⅳ 평가 계획 표를 찾지 못했습니다')
  else {
    const perExam = plan.exam_count > 0 ? rules.exam_ratio / plan.exam_count : 0
    // 값 열: 정기시험 회차마다 하나, 수행평가마다 하나
    const cols = [
      ...plan.exams.map((e) => ({
        title: `${e.no}회 정기시험`,
        method: e.parts.map((p) => p.kind).join('·'),
        max: `${e.parts.reduce((s, p) => s + p.points, 0)}점`,
        ratio: `${perExam}%`,
        essay: (() => {
          const total = e.parts.reduce((s, p) => s + p.points, 0)
          const es = e.parts.filter((p) => p.kind === '서술형').reduce((s, p) => s + p.points, 0)
          return total > 0 ? `서술형 ${((es / total) * perExam).toFixed(0)}%` : '0%'
        })(),
        std: (() => {
          const codes = examStandardCodes(subject.units, plan.exams, e.no)
          return codes.length ? `${codes[0]}~${codes[codes.length - 1]}` : ''
        })(),
        when: monthWeekLabel(school, e.week),
      })),
      ...plan.performances.map((p) => ({
        title: p.name,
        method: p.method,
        max: `${p.max_score}점`,
        ratio: `${p.ratio}%`,
        essay: p.method_checks.includes('서술·논술') ? `논술형 ${p.ratio}%` : '0%',
        std: p.standard_codes.join(', '),
        when: monthWeekLabel(school, p.week),
      })),
    ]

    const rowByLabel = (label: string) =>
      doc.rows(evalTbl).findIndex((_, ri) =>
        childrenOf(doc.rows(evalTbl)[ri], 'tc').some(
          (_c, ci) => (doc.cellText(evalTbl, ri, ci) ?? '').trim() === label,
        ),
      )

    /** 라벨 뒤에 남은 빈 값 칸에 순서대로 넣는다 */
    const fillRow = (label: string, values: string[]) => {
      const ri = rowByLabel(label)
      if (ri < 0) return warn(`Ⅳ '${label}' 행을 찾지 못했습니다`)
      const cells = childrenOf(doc.rows(evalTbl)[ri], 'tc')
      const start = cells.findIndex(
        (_c, ci) => (doc.cellText(evalTbl, ri, ci) ?? '').trim() === label,
      )
      const slots = cells.length - start - 1
      if (slots < values.length) {
        warn(`Ⅳ '${label}' 행의 칸이 ${slots}개인데 값은 ${values.length}개입니다 — 앞에서부터 채웁니다`)
      }
      values.slice(0, slots).forEach((v, k) => doc.setCell(evalTbl, ri, start + 1 + k, v))
    }

    // 0행 — 정기시험(60%) / 수행평가(40%) 묶음 머리
    const groupCells = childrenOf(doc.rows(evalTbl)[0], 'tc')
    if (groupCells.length >= 4) {
      doc.setCell(evalTbl, 0, 2, plan.exam_count > 0 ? `정기시험(${rules.exam_ratio}%)` : '—')
      doc.setCell(evalTbl, 0, 3, `수행평가(${rules.perf_ratio}%)`)
    }

    // 1행 — 회차명 · 수행평가명
    const titleRow = 1
    const titleCells = childrenOf(doc.rows(evalTbl)[titleRow], 'tc')
    cols.slice(0, titleCells.length).forEach((c, k) => doc.setCell(evalTbl, titleRow, k, c.title))

    // 평가 방법 · 영역 만점은 정기시험을 문항 구분(선택형·서술형)까지 쪼개 적는다
    const examParts = plan.exams.flatMap((e) => e.parts)
    fillRow('평가 방법', [
      ...examParts.map((p) => p.kind),
      ...plan.performances.map((p) => p.method),
    ])
    fillRow('영역 만점', [
      ...examParts.map((p) => `${p.points}점`),
      ...plan.performances.map((p) => `${p.max_score}점`),
    ])
    fillRow('반영 비율', [...cols.map((c) => c.ratio), '100%'])
    fillRow('서술형･논술형', [
      ...cols.map((c) => c.essay),
      `${essayTotal(plan, rules.exam_ratio).toFixed(0)}%`,
    ])
    fillRow('성취 기준', cols.map((c) => c.std))
    fillRow('평가 시기', cols.map((c) => c.when))
    did(`Ⅳ 평가 계획 (값 열 ${cols.length}개)`)
  }

  /* ── Ⅴ 성취도 기준표 ──────────────────────── */
  const gradeTbl = findTable((h) => h[0] === '성취율' && h[1] === '성취도')
  const at = achievementTableFor(school, subject.type)
  if (gradeTbl && at) {
    doc.fitRows(gradeTbl, 1, at.grades.length)
    at.grades.forEach((g, i) => {
      const band =
        at.grades.length === 2
          ? g === 'P'
            ? '이수 기준 도달'
            : '이수 기준 미도달'
          : i === 0
            ? '90% 이상'
            : i === at.grades.length - 1
              ? `${90 - i * 10}% 미만`
              : `${80 - (i - 1) * 10}% 이상~${90 - (i - 1) * 10}% 미만`
      doc.setCell(gradeTbl, i + 1, 0, band)
      doc.setCell(gradeTbl, i + 1, 1, g)
    })

    // 부기 문단 가지치기 — 양식에는 조건별 ※ 문단이 전부 들어 있다.
    // 과목 유형에 맞는 것만 남긴다. 이것이 'Ⅴ가 지저분한' 문제의 실체다.
    {
      const vHead = sectionTable('Ⅴ')
      const viHead = sectionTable('Ⅵ')
      const tops = doc.topParas()
      const from = vHead ? tops.indexOf(paraOf(vHead)!) + 1 : -1
      const to = viHead ? tops.indexOf(paraOf(viHead)!) : tops.length
      if (from > 0) {
        let pruned = 0
        // 따옴표가 둥근따옴표(’E’)일 수 있어 종류를 가리지 않는다
        const mark = (s: string, g: string) => new RegExp(`[''‘’]${g}[''‘’]`).test(s)
        for (const p of tops.slice(from, to)) {
          const s = doc.paraText(p).trim()
          if (s === '') continue
          const keep =
            s.startsWith(':') || // 분할점수 문구 — 아래에서 재작성
            (mark(s, 'E') && subject.type === 'common') ||
            (mark(s, 'C') && (subject.type === 'sci_lab' || subject.type === 'arts_pe')) ||
            (mark(s, 'P') && subject.type === 'pass_fail')
          if (!keep && (s.startsWith('※') || s.startsWith('<'))) {
            doc.remove(p)
            pruned++
          } else if (s.startsWith(':')) {
            doc.setPara(
              p,
              `: 성취수준별 ${plan.split_score_type === '추정' ? '추정' : '고정'} 분할점수를 사용한다.`,
            )
          }
        }
        did(`Ⅴ 성취도 기준표 (${at.target}) · 부기 ${pruned}개 정리`)
      } else {
        did(`Ⅴ 성취도 기준표 (${at.target})`)
      }
    }
  } else warn('Ⅴ 성취도 기준표를 찾지 못했습니다')

  /* ── Ⅵ 수행평가 세부기준 ──────────────────── */
  const perfProto = tables.find(
    (t) => doc.cellText(t, 0, 0) === '성취기준' && doc.cellText(t, 1, 0) === '수행 활동 과정',
  )
  if (!perfProto) warn('수행평가 세부기준 표를 찾지 못했습니다')
  else if (plan.performances.length === 0) {
    doc.removeTable(perfProto)
    warn('수행평가가 없어 Ⅵ 표를 제거했습니다')
  } else {
    const protoPara = paraOf(perfProto)!
    const parent = protoPara.parentNode!
    // 첫 벌은 템플릿을 그대로 쓰고, 나머지는 문단째로 복제한다
    const titlePara = previousTextPara(doc, protoPara)
    const clones: { tbl: Element; title: Element | null }[] = [
      { tbl: perfProto, title: titlePara },
    ]
    let after: Node = protoPara
    for (let i = 1; i < plan.performances.length; i++) {
      const t2 = titlePara ? (titlePara.cloneNode(true) as Element) : null
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
      clones.push({ tbl: inner, title: t2 })
    }

    plan.performances.forEach((p, i) => {
      const { tbl, title } = clones[i]
      if (title) doc.setPara(title, `${i + 1}. ${p.name}`)
      // AI 초안이 있으면 활동 과정·루브릭을 그것으로 (빨강)
      const draft = ai?.perfs[p.id]
      const effective = draft ? { ...p, activity: draft.activity, rubric: draft.rubric } : p
      fillPerfTable(doc, tbl, effective, i, warn, { red: !!draft })
    })
    did(`Ⅵ 수행평가 세부기준 ${plan.performances.length}벌${ai ? ' (문안 빨강)' : ''}`)
  }

  /* ── Ⅺ 성취기준별 성취수준 ────────────────── */
  const stdProto = tables.find(
    (t) =>
      doc.cellText(t, 0, 0) === '성취기준' && (doc.cellText(t, 0, 1) ?? '').includes('성취기준별'),
  )
  const areasWithStd = subject.areas.filter((a) =>
    subject.standards.some((s) => s.area_no === a.no),
  )
  if (!stdProto) warn('Ⅺ 성취수준 표를 찾지 못했습니다')
  else if (areasWithStd.length === 0) {
    doc.removeTable(stdProto)
    warn('성취기준이 없어 Ⅺ 표를 제거했습니다')
  } else {
    const protoPara = paraOf(stdProto)!
    const parent = protoPara.parentNode!
    const titlePara = previousTextPara(doc, protoPara)
    const grades: ('A' | 'B' | 'C' | 'D' | 'E')[] =
      subject.scale_type === 'LVL_3' ? ['A', 'B', 'C'] : ['A', 'B', 'C', 'D', 'E']

    const clones: { tbl: Element; title: Element | null }[] = [{ tbl: stdProto, title: titlePara }]
    let after: Node = protoPara
    for (let i = 1; i < areasWithStd.length; i++) {
      const t2 = titlePara ? (titlePara.cloneNode(true) as Element) : null
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
      clones.push({ tbl: inner, title: t2 })
    }

    areasWithStd.forEach((area, ai) => {
      const { tbl, title } = clones[ai]
      if (title) doc.setPara(title, `(${ai + 1}) ${area.name}`)
      const items = subject.standards.filter((s) => s.area_no === area.no)
      // 성취기준 하나가 A~E 5행(3단계면 3행)을 차지한다
      doc.repeatRowBlock(tbl, 1, 5, items.length)
      items.forEach((it, i) => {
        const base = 1 + i * 5
        doc.setCell(tbl, base, 0, it.text ? `${it.code} ${it.text}` : it.code)
        grades.forEach((g, k) => {
          const r = base + k
          // 첫 행은 성취기준 셀이 앞에 온다 — 그만큼 열이 밀린다
          const off = k === 0 ? 1 : 0
          doc.setCell(tbl, r, off, g)
          doc.setCell(tbl, r, off + 1, it.levels[g] ?? '')
        })
        // 3단계 과목은 D·E 행을 비운다
        for (let k = grades.length; k < 5; k++) {
          doc.setCell(tbl, base + k, 0, '')
          doc.setCell(tbl, base + k, 1, '')
        }
      })
    })
    did(`Ⅺ 성취수준 ${areasWithStd.length}개 영역 · 성취기준 ${subject.standards.length}개`)
  }

  /* ── 학기단위 성취수준 ────────────────────── */
  const semTbl = findTable((h) => h[0] === '성취수준' && h[1] === '학기단위 성취수준')
  if (semTbl) {
    const grades: ('A' | 'B' | 'C' | 'D' | 'E')[] =
      subject.scale_type === 'LVL_3' ? ['A', 'B', 'C'] : ['A', 'B', 'C', 'D', 'E']
    doc.fitRows(semTbl, 1, grades.length)
    grades.forEach((g, i) => {
      doc.setCell(semTbl, i + 1, 0, g)
      doc.setCell(semTbl, i + 1, 1, subject.semester_levels[g] ?? '')
    })
    did('학기단위 성취수준')
  } else warn('학기단위 성취수준 표를 찾지 못했습니다')

  return { bytes: await doc.save(), report }
}

/* ── 도우미 ─────────────────────────────────── */

/** 표 문단 바로 앞의 글자 있는 최상위 문단 (소제목) */
function previousTextPara(doc: HwpxDoc, para: Element): Element | null {
  const tops = doc.topParas()
  const i = tops.indexOf(para)
  for (let k = i - 1; k >= 0 && k >= i - 3; k--) {
    if (doc.paraText(tops[k]).trim() !== '') return tops[k]
  }
  return null
}

/** 수행평가 세부기준 표 한 벌을 채운다. red = AI 문안(활동 과정·기준 서술)을 빨강으로. */
function fillPerfTable(
  doc: HwpxDoc,
  tbl: Element,
  perf: Parameters<typeof rubricMax>[0],
  index: number,
  warn: (s: string) => void,
  opts?: { red?: boolean },
): void {
  const HEAD = 4 // 0 성취기준 · 1 수행 활동 과정 · 2 평가 방법 · 3 열 머리
  const rows = doc.rows(tbl)
  const elements = perf.rubric.length
  if (elements === 0) {
    warn(`${index + 1}번 수행평가에 루브릭이 없습니다 — 표를 비워 둡니다`)
  }

  doc.setCell(tbl, 0, 1, perf.standard_codes.join(', ') || '')
  doc.setCell(tbl, 1, 1, perf.activity || '', { red: opts?.red })
  doc.setCell(
    tbl,
    2,
    1,
    CHECK_ORDER.map((c) => `${perf.method_checks.includes(c) ? '■' : '□'}${c}`).join(' ') +
      ` ${perf.method_checks.includes('기타') ? '■' : '□'}기타(          )`,
  )

  // 요소 블록은 2행씩. 첫 블록(4·5행)은 병합 셀을 품고 있어 원본을 그대로 쓰고,
  // 두 번째 블록(6·7행)을 복제 원형으로 삼는다.
  const remark = rows[rows.length - 1]
  const proto = [rows[HEAD + 2], rows[HEAD + 3]]
  if (!proto[0] || !proto[1]) {
    warn('수행평가 표에 복제할 요소 블록이 없습니다')
    return
  }
  const protoClone = proto.map((r) => r.cloneNode(true) as Element)

  // 기존 요소 블록과 비고 행을 모두 걷어내고 필요한 만큼 다시 붙인다
  for (const tr of doc.rows(tbl).slice(HEAD)) tbl.removeChild(tr)
  const firstBlock = [rows[HEAD], rows[HEAD + 1]]
  tbl.appendChild(firstBlock[0])
  tbl.appendChild(firstBlock[1])
  for (let i = 1; i < Math.max(1, elements); i++) {
    for (const r of protoClone) tbl.appendChild(r.cloneNode(true) as Element)
  }
  tbl.appendChild(remark)
  doc.renumber(tbl)

  // 병합 높이 갱신 — 요소 블록 2N행 + 비고 1행
  const span = Math.max(1, elements) * 2 + 1
  const firstRowCells = childrenOf(doc.rows(tbl)[HEAD], 'tc')
  for (const tc of [firstRowCells[0], firstRowCells[firstRowCells.length - 1]]) {
    const cs = childrenOf(tc, 'cellSpan')[0]
    if (cs && cs.getAttribute('rowSpan') !== '1') cs.setAttribute('rowSpan', String(span))
  }

  // 영역명(만점) · 배점 합 목록
  doc.setCell(tbl, HEAD, 0, `${perf.name}(${perf.max_score}점)`)
  const lastCol = firstRowCells.length - 1
  doc.setCell(tbl, HEAD, lastCol, scoreSumLabels(perf))

  perf.rubric.forEach((row, i) => {
    const scoreRow = HEAD + i * 2
    const textRow = scoreRow + 1
    // 첫 블록은 앞에 병합 셀이 하나 더 있다
    const off = i === 0 ? 1 : 0
    // 요소명·배점은 코드가 정한 값 — 검정. 기준 서술 문장만 AI — 빨강.
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
