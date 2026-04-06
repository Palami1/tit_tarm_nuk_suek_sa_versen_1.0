import type { Metadata } from "next";
import { Noto_Sans_Lao } from "next/font/google";
import "./globals.css";

const notoLao = Noto_Sans_Lao({
  subsets: ["lao", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-noto-lao",
});

export const metadata: Metadata = {
  title: "Intern Tracking System - Lao Telecom",
  description: "Online Intern Tracking and Evaluation System for Lao Telecom",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="lo" className={notoLao.variable}>
      <body className="min-h-screen bg-gray-50 flex flex-col font-lao">
        {children}
      </body>
    </html>
  );
}
