/**
 * 저장된 '값'을 문서로 조립한다.
 *
 * 여기서만 문장이 완성되고, 여기서만 가·나·다가 붙는다.
 * 저장소에는 여전히 값만 남는다.
 */

import type { SchoolLayer, SemesterPlan, Subject } from '@/types'
import {
  achievementTableFor,
  classRange,
  essayTotal,
  examStandardCodes,
  monthWeekLabel,
  noticeWeek,
  periodLabel,
  ratioTotal,
  renderSection,
  weekHours,
  type SentenceContext,
} from './derive'

export interface DocTable {
  caption?: string
  head: string[]
  rows: string[][]
  note?: string
}

export interface DocSection {
  no: string
  title: string
  paragraphs?: { ordinal: string; text: string }[]
  tables?: DocTable[]
  body?: string
}

export interface PlanDocument {
  title: string
  cover: { label: string; value: string }[]
  sections: DocSection[]
  /** 표 개수 — 내려받기 화면 요약용 */
  tableCount: number
}

export function buildDocument(
  plan: SemesterPlan,
  subject: Subject,
  school: SchoolLayer,
): PlanDocument {
  const { calendar, rules } = school
  const hasRank = subject.type !== 'pass_fail' && subject.type !== 'arts_pe'
  const ctx: SentenceContext = { subject, plan, school, hasRank }

  const orderedUnits = [...subject.units].sort((a, b) => a.order - b.order)
  const unitById = new Map(orderedUnits.map((u) => [u.id, u]))
  const areaName = (no: string | null) => subject.areas.find((a) => a.no === no)?.name ?? ''
  const hours = weekHours(calendar.weeks, plan.credit)

  const sections: DocSection[] = []

  /* Ⅰ 교수학습 운영계획 — 지도교사 인원수만큼 분할 */
  sections.push({
    no: 'Ⅰ',
    title: '교수학습 운영계획',
    tables: [
      {
        head: ['지도교사', '운영 계획'],
        rows:
          plan.teachers.length > 0
            ? plan.teachers.map((t) => [t, subject.teaching_plan])
            : [['(미입력)', subject.teaching_plan]],
      },
    ],
  })

  /* Ⅱ 평가의 목적 */
  sections.push({ no: 'Ⅱ', title: '평가의 목적', body: subject.objectives })

  /* Ⅲ 평가의 방향 · 결과 처리 */
  sections.push({
    no: 'Ⅲ-1',
    title: '평가의 방향',
    paragraphs: renderSection('Ⅲ-1', ctx),
  })
  sections.push({
    no: 'Ⅲ-2',
    title: '평가 결과 처리',
    paragraphs: renderSection('Ⅲ-2', ctx),
  })

  /* Ⅳ 평가 계획 */
  const perfRows = plan.performances.map((p) => [
    '수행평가',
    p.name,
    p.method,
    `${p.ratio}%`,
    `${p.max_score}점`,
    `${p.week}주 · ${monthWeekLabel(school, p.week)}`,
    p.standard_codes.join(' '),
  ])
  const examRows = plan.exams.map((e) => [
    '정기시험',
    `${e.no}회`,
    e.parts.map((x) => x.kind).join('·'),
    `${rules.exam_ratio / Math.max(1, plan.exam_count)}%`,
    `${e.parts.reduce((s, x) => s + x.points, 0)}점`,
    `${e.week}주 · ${monthWeekLabel(school, e.week)}`,
    examStandardCodes(subject.units, plan.exams, e.no).join(' '),
  ])
  sections.push({
    no: 'Ⅳ',
    title: `평가 계획 (정기시험 ${rules.exam_ratio}% : 수행평가 ${rules.perf_ratio}%)`,
    tables: [
      {
        head: ['구분', '명칭', '방법', '반영 비율', '영역 만점', '평가 시기', '성취기준'],
        rows: [...examRows, ...perfRows],
        note: `반영 비율 합계 ${ratioTotal(plan, rules.exam_ratio)}% · 서술·논술 합계 ${essayTotal(
          plan,
          rules.exam_ratio,
        ).toFixed(1)}%`,
      },
      ...plan.performances.map((p) => ({
        caption: `${p.name} — 루브릭`,
        head: ['평가 영역', '평가 요소', ...p.rubric[0]?.levels.map((l) => `${l.score}점`) ?? []],
        rows: p.rubric.map((r) => [r.area, r.element, ...r.levels.map((l) => l.text)]),
        note: `기본점수 ${p.base_score}점 · 수행 활동: ${p.activity}`,
      })),
    ],
  })

  /* Ⅴ 성취도 기준표 */
  const table = achievementTableFor(school, subject.type)
  sections.push({
    no: 'Ⅴ',
    title: `성취도 기준 (${table?.target ?? ''})`,
    tables: [
      {
        head: ['성취도', '성취율'],
        rows: (table?.grades ?? []).map((g, i, arr) => [
          g,
          arr.length === 2
            ? g === 'P'
              ? '이수 기준 도달'
              : '이수 기준 미도달'
            : `${90 - i * 10}% 이상`,
        ]),
        note: table?.has_note ? table.note : undefined,
      },
    ],
  })

  /* Ⅵ 진도표 */
  const noticeByWeek = new Map<number, string[]>()
  const perfByWeek = new Map<number, string[]>()
  for (const p of plan.performances) {
    const nw = noticeWeek(p, rules.notice_lead_weeks)
    noticeByWeek.set(nw, [...(noticeByWeek.get(nw) ?? []), p.name])
    perfByWeek.set(p.week, [...(perfByWeek.get(p.week) ?? []), p.name])
  }
  sections.push({
    no: 'Ⅵ',
    title: '교과 진도 계획',
    tables: [
      {
        head: ['주', '기간', '영역', '단원', '예정시간', '실시누계', '행사', '평가'],
        rows: calendar.weeks.map((w) => {
          const ids = plan.distribution[w.no] ?? []
          const units = ids.map((id) => unitById.get(id)).filter(Boolean)
          const h = hours.find((x) => x.no === w.no)!
          const evals = [
            w.is_exam ? `${plan.exams.find((e) => e.week === w.no)?.no ?? ''}회 정기시험` : '',
            ...(perfByWeek.get(w.no)?.map((n) => `${n} 실시`) ?? []),
            ...(noticeByWeek.get(w.no)?.map((n) => `${n} 안내`) ?? []),
          ].filter(Boolean)
          return [
            `${w.no}`,
            periodLabel(w),
            [...new Set(units.map((u) => areaName(u!.area_no)))].join(' / '),
            units.map((u) => u!.name).join(' / '),
            `${h.planned}`,
            `${h.cumulative}`,
            w.events.join(', '),
            evals.join(', '),
          ]
        }),
      },
    ],
  })

  /* Ⅶ ~ Ⅹ */
  const rest: [DocSection['no'], string, 'Ⅶ' | 'Ⅷ' | 'Ⅸ' | 'Ⅹ'][] = [
    ['Ⅶ', '성적 산출', 'Ⅶ'],
    ['Ⅷ', '결시자 처리', 'Ⅷ'],
    ['Ⅸ', '이의신청', 'Ⅸ'],
    ['Ⅹ', '기타', 'Ⅹ'],
  ]
  for (const [no, title, key] of rest) {
    sections.push({ no, title, paragraphs: renderSection(key, ctx) })
  }

  /* Ⅺ 성취수준 — 3단계 과목은 D·E 행을 비운다. 공통과목만 최소성취수준 셀. */
  const grades: ('A' | 'B' | 'C' | 'D' | 'E')[] =
    subject.scale_type === 'LVL_3' ? ['A', 'B', 'C'] : ['A', 'B', 'C', 'D', 'E']
  const xiHead = ['성취수준', '학기단위 성취수준']
  if (subject.is_common) xiHead.push('최소 성취수준')
  sections.push({
    no: 'Ⅺ',
    title: '성취수준',
    tables: [
      {
        head: xiHead,
        rows: grades.map((g) => {
          const row = [g, subject.semester_levels[g] ?? '']
          if (subject.is_common) row.push(g === 'E' ? (subject.min_level ?? '') : '')
          return row
        }),
        note:
          subject.scale_type === 'LVL_3'
            ? '3단계(상~하) 과목이라 D·E 행을 두지 않는다.'
            : undefined,
      },
    ],
  })

  const cover = [
    { label: '학년도 · 학기', value: `${calendar.year}학년도 ${calendar.semester}학기` },
    { label: '과목', value: subject.name },
    { label: '학년 · 반', value: `${plan.grade}학년 ${classRange(school, plan.grade)}` },
    { label: '학점 · 주당 시수', value: `${plan.credit}학점 · 주 ${plan.credit}시간` },
    { label: '지도교사', value: plan.teachers.join(', ') },
    { label: '근거', value: rules.guideline_name },
  ]

  return {
    title: `${subject.name}_${calendar.semester}학기_계획서`,
    cover,
    sections,
    tableCount: sections.reduce((s, x) => s + (x.tables?.length ?? 0), 0),
  }
}

/* ── HTML 내보내기 ────────────────────────────
   한글(HWP)은 HTML 문서를 열 수 있다. .hwpx(OWPML) 직접 생성은 아직 없다. */

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function tableHtml(t: DocTable): string {
  return `${t.caption ? `<p class="cap">${esc(t.caption)}</p>` : ''}
<table>
<thead><tr>${t.head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
<tbody>${t.rows
    .map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`)
    .join('')}</tbody>
</table>${t.note ? `<p class="note">${esc(t.note)}</p>` : ''}`
}

export function documentToHtml(doc: PlanDocument): string {
  const body = doc.sections
    .map(
      (s) => `<h2>${esc(s.no)}. ${esc(s.title)}</h2>
${s.body ? `<p>${esc(s.body)}</p>` : ''}
${
  s.paragraphs
    ?.map((p) => `<p class="para"><span class="ord">${esc(p.ordinal)}.</span> ${esc(p.text)}</p>`)
    .join('\n') ?? ''
}
${s.tables?.map(tableHtml).join('\n') ?? ''}`,
    )
    .join('\n')

  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><title>${esc(doc.title)}</title>
<style>
body{font-family:"맑은 고딕","Malgun Gothic",serif;font-size:10.5pt;line-height:1.7;margin:24mm 18mm;color:#000}
h1{font-size:18pt;text-align:center;margin:0 0 24px}
h2{font-size:12pt;margin:28px 0 10px;border-bottom:1px solid #000;padding-bottom:4px}
table{border-collapse:collapse;width:100%;margin:8px 0 4px;font-size:9.5pt}
th,td{border:1px solid #000;padding:5px 7px;vertical-align:top;text-align:left}
th{background:#f2f2f2;font-weight:600;white-space:nowrap}
.cap{margin:14px 0 4px;font-weight:600}
.note{margin:2px 0 12px;font-size:9pt;color:#333}
.para{margin:4px 0}
.ord{font-weight:600;margin-right:6px}
.cover{margin:0 auto 32px;width:70%}
.cover td{border:0;padding:4px 8px}
.cover td:first-child{width:130px;color:#333}
</style></head><body>
<h1>${esc(doc.title.replace(/_/g, ' '))}</h1>
<table class="cover"><tbody>${doc.cover
    .map((c) => `<tr><td>${esc(c.label)}</td><td>${esc(c.value)}</td></tr>`)
    .join('')}</tbody></table>
${body}
</body></html>`
}

export function downloadHtml(doc: PlanDocument) {
  const blob = new Blob(['﻿', documentToHtml(doc)], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${doc.title}.html`
  a.click()
  URL.revokeObjectURL(url)
}
