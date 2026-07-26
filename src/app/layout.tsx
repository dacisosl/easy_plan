import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '교수학습 및 평가 운영계획서',
  description: '값을 한 번만 입력해 계획서 전체를 만드는 도구',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard-dynamic-subset.css"
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
