import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '保養品比價雷達',
  description: 'momo、品牌官網、蝦皮、酷澎 每日價格與活動追蹤',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant-TW">
      <body>{children}</body>
    </html>
  );
}
