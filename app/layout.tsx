import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";

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
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider>
          {children}
          <ThemeToggle />
        </ThemeProvider>
      </body>
    </html>
  );
}
