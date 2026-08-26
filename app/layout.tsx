import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://zhangyu-knowledge-agent.maomengen888.chatgpt.site"),
  title: "章鱼时代智库 Agent",
  description: "章鱼时代科技内部知识管理与流程协作智能体。",
  openGraph: {
    title: "章鱼时代智库 Agent",
    description: "企业内部知识管理与流程协作。",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "章鱼时代智库 Agent",
    description: "企业内部知识管理与流程协作。",
    images: ["/og.png"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
