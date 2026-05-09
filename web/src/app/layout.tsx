import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Stock AI Dashboard",
  description: "한국 주식 AI 분석 시스템",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <footer style={{ borderTop: "1px solid var(--border)", background: "#fafafa", padding: "16px 24px", marginTop: "auto" }}>
          <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
            <span style={{ fontSize: 12, color: "#999" }}>KOREA STOCK AI — 본 서비스는 투자 참고용이며 투자 결정의 책임은 본인에게 있습니다</span>
            <Link href="/guide" style={{
              fontSize: 14, color: "#fff", textDecoration: "none", fontWeight: 700,
              background: "var(--blue)", padding: "8px 16px", borderRadius: 10,
              whiteSpace: "nowrap", flexShrink: 0,
            }}>
              📖 용어 & 방법론 가이드
            </Link>
          </div>
        </footer>
      </body>
    </html>
  );
}
