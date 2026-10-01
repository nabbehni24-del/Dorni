"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useRef, useState, type ReactNode } from "react";
import {
  Building2,
  Boxes,
  Headphones,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { DorniBrand } from "./dorni-brand";
import { ThemeToggle } from "./theme-toggle";
import "./workspace-shell.css";
const adminLinks = [
  { href: "/admin", title: "نظرة عامة", icon: LayoutDashboard },
  { href: "/admin/companies", title: "الشركات والشركاء", icon: Building2 },
  { href: "/admin/production", title: "الأكواد والإنتاج", icon: Boxes },
  { href: "/admin/institutions", title: "صلاحيات المؤسسات", icon: ShieldCheck },
  { href: "/admin/support", title: "فريق الدعم", icon: Users },
  { href: "/admin/inbox", title: "صندوق الدعم", icon: Headphones },
  { href: "/admin/activity", title: "سجل العمليات", icon: History },
  { href: "/admin/settings", title: "الإعدادات", icon: Settings },
];
const supportLinks = [
  { href: "/support", title: "صندوق الدعم", icon: Headphones },
  { href: "/support/settings", title: "الإعدادات", icon: Settings },
];
export function WorkspaceShell({
  children,
  kind = "admin",
}: {
  children: ReactNode;
  kind?: "admin" | "support";
}) {
  const pathname = usePathname();
  const router = useRouter();
  const links = kind === "admin" ? adminLinks : supportLinks;
  const current = links.find((item) => item.href === pathname);
  const dialog = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function logout() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error();
      router.replace("/login");
      router.refresh();
    } catch {
      setError("تعذر تسجيل الخروج. حاول مجدداً.");
      setBusy(false);
    }
  }
  const navigation = (
    <>
      <DorniBrand href={kind === "admin" ? "/admin" : "/support"} />
      <p className="ws-caption">
        {kind === "admin" ? "إدارة دورني" : "مساحة عمل الدعم"}
      </p>
      <nav aria-label="أقسام مساحة العمل">
        {links.map(({ href, title, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={pathname === href ? "page" : undefined}
            onClick={() => dialog.current?.close()}
          >
            <Icon />
            <span>{title}</span>
          </Link>
        ))}
      </nav>
      <div className="ws-sidebar-footer">
        <ShieldCheck />
        <p>
          وصول حسب الصلاحيات<small>كل مساحة لها أدواتها وحدودها.</small>
        </p>
      </div>
    </>
  );
  return (
    <div className="ws-shell" dir="rtl">
      <a className="ws-skip" href="#workspace-content">
        انتقل للمحتوى
      </a>
      <aside className="ws-sidebar">{navigation}</aside>
      <dialog
        className="ws-drawer"
        ref={dialog}
        aria-label="قائمة التنقل"
        onClick={(e) => {
          if (e.target === e.currentTarget) dialog.current?.close();
        }}
      >
        <button
          className="ws-close"
          onClick={() => dialog.current?.close()}
          aria-label="إغلاق القائمة"
        >
          <X />
        </button>
        {navigation}
      </dialog>
      <div className="ws-main">
        <header className="ws-topbar">
          <button
            className="ws-menu"
            onClick={() => dialog.current?.showModal()}
            aria-label="فتح قائمة التنقل"
          >
            <Menu />
          </button>
          <div>
            <small>{kind === "admin" ? "لوحة الإدارة" : "فريق الدعم"}</small>
            <h1>{current?.title ?? "مساحة العمل"}</h1>
          </div>
          <div className="ws-header-actions">
            <ThemeToggle placement="header" />
            <button
              disabled={busy}
              onClick={() => void logout()}
              aria-label="تسجيل الخروج"
              title="تسجيل الخروج"
            >
              <LogOut />
            </button>
          </div>
        </header>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div id="workspace-content" tabIndex={-1} className="ws-content">
          {children}
        </div>
      </div>
    </div>
  );
}
