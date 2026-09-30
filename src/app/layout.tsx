import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '上海 4 日游 · 行程地图',
  description: '把想去的地方，连成一段旅程。多日行程路线地图。',
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
