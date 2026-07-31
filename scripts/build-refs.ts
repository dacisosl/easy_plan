/**
 * public/refs/ 폴더를 훑어 목록(index.json)을 만든다.
 *
 *   npx tsx scripts/build-refs.ts     (npm run build·dev가 자동으로 부른다)
 *
 * 서버가 없어 폴더를 실시간으로 읽을 수 없다. 그래서 빌드 때 한 번 훑어
 * 목록을 파일로 굽고, 화면은 그 목록만 읽는다.
 *
 * 자료를 늘리려면 파일을 public/refs/ 에 넣고 다시 빌드하면 된다 — 코드는 안 고쳐도 된다.
 */

import { mkdir, readdir, stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const DIR = resolve('public', 'refs')
const INDEX = 'index.json'

export interface RefFile {
  /** 화면에 보일 이름 (확장자 뗀 파일명) */
  name: string
  /** public 기준 주소 */
  href: string
  /** 내려받을 때 쓸 파일명 */
  file: string
  /** 바이트 */
  size: number
}

async function main() {
  await mkdir(DIR, { recursive: true })
  const entries = await readdir(DIR)

  const files: RefFile[] = []
  for (const name of entries.sort()) {
    if (name === INDEX || name.startsWith('.') || name.endsWith('.md')) continue
    const s = await stat(join(DIR, name))
    if (!s.isFile()) continue
    files.push({
      name: name.replace(/\.[^.]+$/, ''),
      href: `/refs/${encodeURIComponent(name)}`,
      file: name,
      size: s.size,
    })
  }

  await writeFile(join(DIR, INDEX), JSON.stringify({ files }))
  console.log(`참고 파일 ${files.length}개 → public/refs/${INDEX}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
