/**
 * 점검표 반영분 XML 확인 — 세 변형을 렌더해 section0.xml에서 흔적을 찾는다.
 *
 *   npx tsx scripts/verify-checklist.ts
 *
 *   1) 기본:   Ⅳ 시기 = 목요일 라벨('7월 1주'), Ⅲ-2 마 유지, 분할점수 문구
 *   2) 1단위:  Ⅲ-2 마 삭제 + 번호 당김 + 수행평가명 빨간 스팬 생존
 *   3) 이수:   Ⅲ-1 나 P/F 문장, 분할점수 문구 부재
 */
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import JSZip from 'jszip'
import { SCHOOL_SEED } from '../src/data/school'
import { PLAN_SEED, SUBJECT_SEED } from '../src/data/subject'
import { distributeStandards, weeksOf } from '../src/lib/derive'
import { renderForm } from '../src/lib/hwpx/renderForm'
import type { SemesterPlan, Subject } from '../src/types'

async function render(planOver: Partial<SemesterPlan>, subjectOver: Partial<Subject>) {
  const template = new Uint8Array(await readFile(resolve('templates/form_2026.hwpx')))
  const subject = { ...SUBJECT_SEED, ...subjectOver }
  const base = { ...PLAN_SEED, ...planOver }
  const plan = {
    ...base,
    distribution: distributeStandards(
      subject,
      weeksOf(SCHOOL_SEED, 1),
      base.exams,
      base.performances,
    ),
  }
  const { bytes, report } = await renderForm(template, plan, subject, SCHOOL_SEED, undefined)
  const zip = await JSZip.loadAsync(bytes)
  const xml = await zip.file('Contents/section0.xml')!.async('string')
  return { xml, report }
}

function check(name: string, ok: boolean) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) process.exitCode = 1
}

async function main() {
  {
    const { xml } = await render({}, {})
    check('기본: Ⅳ 시기에 7월 1주(목요일 라벨)', xml.includes('7월 1주'))
    check('기본: 옛 라벨 6월 5주 부재', !xml.includes('6월 5주'))
    // 가운뎃점이 U+FF65(･)라 글자 매칭이 어긋난다 — 마 문단에만 있는 구절로 찾는다
    check('기본: Ⅲ-2 마(서술형·논술형 30%) 유지', /반영 ?비율은 학기 단위 성적/.test(xml))
    check('기본: 추정분할점수 문구', xml.includes('추정분할점수'))
  }
  {
    const { xml, report } = await render({ credit: 1 }, {})
    check(
      '1단위: 마 삭제 리포트',
      report.filled.some((f) => f.includes('마 삭제')),
    )
    check('1단위: 서술형·논술형 30% 문단 부재', !/반영 ?비율은 학기 단위 성적/.test(xml))
    const names = PLAN_SEED.performances.map((p) => p.name)
    check(
      '1단위: 수행평가명 빨간 스팬 생존',
      names.every((n) => xml.includes(n)),
    )
  }
  {
    const { xml } = await render({}, { type: 'pass_fail' })
    check("이수: 나 항목에 이수 여부 'P' 문장", xml.includes("이수 여부에 'P'로 기록"))
    check('이수: Ⅲ-1 분할점수 산출 문구 부재', !xml.includes('분할점수로 설정하여 산출한다'))
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
