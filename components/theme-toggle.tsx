"use client";
import {useLocale} from "@/components/locale-provider";

import { Moon, Sun } from "lucide-react";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";

export function ThemeToggle() {
 const {t}=useLocale();
  const { resolvedTheme, setTheme } = useTheme();

  const pathname = usePathname();
  if(pathname === "/app") return null;
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      aria-label={t("تبديل الوضع الفاتح والداكن")}
      title={t("تبديل المظهر")}
    >
      <span className="theme-toggle-icon" aria-hidden="true">
        <Moon className="theme-moon" />
        <Sun className="theme-sun" />
      </span>
      <span className="theme-mode-label theme-dark-label">{t("داكن")}</span>
      <span className="theme-mode-label theme-light-label">{t("فاتح")}</span>
    </button>
  );
}
