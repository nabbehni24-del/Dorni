import type { Metadata, Viewport } from "next";
import { Cairo } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { PwaProvider } from "@/components/pwa-provider";

const cairo = Cairo({
  subsets: ["arabic", "latin"],
  display: "swap",
  variable: "--font-cairo",
});

export const metadata: Metadata = {
  title: "دورني | تواصل آمن مع صاحب السيارة",
  description: "دورني يوصل تنبيهك لصاحب السيارة من غير كشف رقم الهاتف أو أي بيانات شخصية.",
  applicationName: "دورني",
  appleWebApp: { capable: true, title: "دورني", statusBarStyle: "default" },
  icons: {
    icon: "/dorni-logo.svg",
    shortcut: "/dorni-logo.svg",
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#071421" };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" className={cairo.variable} suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider>
          <PwaProvider>
          {children}
          <ThemeToggle />
          </PwaProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
