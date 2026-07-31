import type { Metadata, Viewport } from 'next'
import './globals.css'

/**
 * 링크를 공유했을 때 보이는 얼굴.
 *
 * 제목은 문서 이름이 아니라 도구 이름으로 — '교수학습 및 평가 운영계획서'는
 * 만들어지는 문서지 이 앱이 아니다. metadataBase가 있어야 og:image가 절대 주소가
 * 된다 — 카카오톡·메신저는 상대 경로 이미지를 못 읽는다.
 */
export const metadata: Metadata = {
  metadataBase: new URL('https://edit-help.web.app'),
  title: '평가계획 편집기',
  description: '선생님, 편집은 제가 합니다 — 입력은 한 번, 20쪽 계획서는 자동 완성.',
  icons: { icon: '/school-logo.png' },
  openGraph: {
    title: '평가계획 편집기',
    description: '선생님, 편집은 제가 합니다 — 입력은 한 번, 20쪽 계획서는 자동 완성.',
    type: 'website',
    locale: 'ko_KR',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: '평가계획 편집기' }],
  },
  twitter: { card: 'summary_large_image' },
}

/**
 * ★ 이게 없으면 휴대폰이 980px짜리 화면인 척 그린 뒤 통째로 축소해 보여 준다.
 * 글씨가 개미만 해지고 두 손가락으로 확대해야 읽힌다. 반응형의 출발점이다.
 *
 * 확대는 막지 않는다(maximumScale 지정 안 함) — 눈이 불편한 분이 키워 볼 권리를 뺏으면 안 된다.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard-dynamic-subset.css"
        />
        {/* 제목용 — 본문(Pretendard)보다 획이 곧고 글자 폭이 넓어 이름표에 어울린다 */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/sun-typeface/SUIT/fonts/variable/woff2/SUIT-Variable.css"
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
