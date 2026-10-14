import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '保養品比價雷達',
  description: 'momo、蝦皮商城、酷澎每日價格、活動與趨勢；品牌官網正式品名與授權通路',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant-TW">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=Noto+Sans+TC:wght@400;500;700&family=Noto+Serif+TC:wght@500;700&display=swap"
        />
      </head>
      <body>
        <header className="site-head">
          <div className="site-head-in">
            <a href="/" className="logo">保養品比價雷達</a>
            <form action="/search" className="search" role="search">
              <input name="q" type="search" placeholder="搜尋任何商品，例如：理膚寶水 B5 修復霜" aria-label="搜尋商品" />
              <button type="submit">搜尋</button>
            </form>
            <nav className="nav">
              <a href="/">追蹤產品</a>
              <a href="/new">新增產品</a>
              <a href="/history">歷史查詢</a>
              <a href="/admin">管理</a>
            </nav>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
