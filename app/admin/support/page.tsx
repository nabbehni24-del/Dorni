"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Headphones, ShieldCheck, Users } from "lucide-react";
import { permissionLabels, supportPermissions, type SupportPermission, type SupportStaff } from "@/lib/support";
import s from "@/components/support-workspace.module.css";
import { ThemeToggle } from "@/components/theme-toggle";

export default function SupportTeamPage() {
  const [staff, setStaff] = useState<SupportStaff[] | null>(null);
  const [editing, setEditing] = useState<SupportStaff | null>(null);
  const [email, setEmail] = useState("");
  const [permissions, setPermissions] = useState<SupportPermission[]>(["view", "reply"]);
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/support-staff", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) { setStaff(null); throw new Error(result.error); }
      setStaff(result);
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر تحميل الفريق."); }
  }, []);
  // State is populated by the asynchronous response, not derived in the effect.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);
  function reset() { setEditing(null); setEmail(""); setActive(true); setPermissions(["view", "reply"]); }
  async function save() {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/support-staff", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...(editing ? { id: editing.id } : { email }), active, permissions }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      reset(); await load(); setNotice("تم حفظ الموظف وصلاحياته. تُطبّق الصلاحيات الجديدة على الطلبات التالية مباشرة.");
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر الحفظ. حاول مجددًا."); } finally { setBusy(false); }
  }
  return <main className={s.workspace} dir="rtl"><header className={s.header}><div className={s.brand}><ShieldCheck /><div><b>إدارة فريق الدعم</b><small>صلاحيات محددة، ومسؤوليات واضحة</small></div></div><nav><Link href="/admin"><ArrowRight />الإدارة</Link><Link href="/support"><Headphones />صندوق الدعم</Link><ThemeToggle placement="header" /></nav></header>
    <div className={s.content}><div className={s.title}><div><p className={s.eyebrow}>إدارة الوصول</p><h1>الفريق المناسب. بالصلاحيات المناسبة.</h1><p>دور الدعم مستقل عن الأدمن؛ لا يمنح إدارة الحسابات أو الشركاء أو الأكواد.</p></div></div>
      {error && <div className={s.error} role="alert">{error}<button onClick={() => void load()}>إعادة المحاولة</button></div>}{notice && <p className={s.notice} role="status">{notice}</p>}
      {staff && <div className={s.staffGrid}><section className={s.panel}><h2>{editing ? `تعديل ${editing.name}` : "إضافة موظف دعم"}</h2><p>يجب أن يسجّل الموظف حسابًا في دورني ويؤكد بريده أولًا. أضفه هنا بالبريد نفسه، ثم يدخل للوحة الدعم من تسجيل الدخول المعتاد.</p>
        <form onSubmit={e => { e.preventDefault(); void save(); }}><label>البريد الإلكتروني<input dir="ltr" type="email" required maxLength={254} value={editing?.email ?? email} disabled={Boolean(editing) || busy} onChange={e => setEmail(e.target.value)} placeholder="support@example.com" /></label>
          <fieldset disabled={busy}><legend>صلاحيات الموظف</legend>{supportPermissions.map(permission => <label className={s.check} key={permission}><input type="checkbox" checked={permissions.includes(permission)} disabled={permission === "view"} onChange={e => setPermissions(current => e.target.checked ? [...current, permission] : current.filter(p => p !== permission))} /><span>{permissionLabels[permission]}</span></label>)}</fieldset>
          <label className={s.check}><input type="checkbox" checked={active} disabled={busy} onChange={e => setActive(e.target.checked)} /><span>الوصول للدعم مفعّل</span></label>
          {!active && <p>إيقاف الوصول لا يحذف الحساب أو الرسائل، ويعيد تذاكره المفتوحة إلى الطابور غير المسند.</p>}
          <button className={s.primary} disabled={busy}>{busy ? "جاري الحفظ…" : editing ? "حفظ الصلاحيات" : "إضافة موظف الدعم"}</button>{editing && <button disabled={busy} type="button" onClick={reset}>إلغاء التعديل</button>}
        </form></section><section className={s.staffList} aria-label="موظفو الدعم">{staff.length === 0 ? <div className={`${s.panel} ${s.empty}`}><Users /><h2>فريقك يبدأ من هنا</h2><p>لم تُضف موظفي دعم بعد. الأدمن يستطيع متابعة التذاكر من صندوق الدعم.</p></div> : staff.map(member => <article className={s.staffCard} key={member.id}><header><h3>{member.name || "موظف دعم"}</h3><span className={s.status}>{member.active ? "مفعّل" : "موقوف"}</span></header><p dir="ltr">{member.email}</p><ul>{member.permissions.map(p => <li key={p}>{permissionLabels[p]}</li>)}</ul><button disabled={busy} onClick={() => { setEditing(member); setPermissions(member.permissions); setActive(member.active); setError(""); setNotice(""); window.scrollTo({ top: 0, behavior: "smooth" }); }}>تعديل الصلاحيات والوصول</button></article>)}</section></div>}
      {!staff && !error && <div className={s.empty}>جاري تحميل الفريق…</div>}
    </div></main>;
}
