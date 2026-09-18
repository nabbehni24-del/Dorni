"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      aria-label="تبديل الوضع الفاتح والداكن"
      title="تبديل المظهر"
    >
      <span className="theme-toggle-icon" aria-hidden="true">
        <Moon className="theme-moon" />
        <Sun className="theme-sun" />
      </span>
      <span className="theme-mode-label theme-dark-label">داكن</span>
      <span className="theme-mode-label theme-light-label">فاتح</span>
    </button>
  );
}
