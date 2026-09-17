import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "دورني | تواصل آمن مع صاحب السيارة",
  description: "دورني يوصل تنبيهك لصاحب السيارة من غير كشف رقم الهاتف أو أي بيانات شخصية.",
  icons: {
    icon: "/dorni-logo.svg",
    shortcut: "/dorni-logo.svg",
    apple: "/dorni-logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl">
      <body className="antialiased">{children}</body>
    </html>
  );
}
