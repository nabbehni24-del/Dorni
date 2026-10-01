"use client";
import { useCallback, useEffect, useState } from "react";
import { Users } from "lucide-react";
import {
  permissionLabels,
  supportPermissions,
  type SupportPermission,
  type SupportStaff,
} from "@/lib/support";
import s from "@/components/support-workspace.module.css";
import { copyText } from "@/lib/client-api";

export default function SupportTeamPage() {
  const [staff, setStaff] = useState<SupportStaff[] | null>(null);
  const [editing, setEditing] = useState<SupportStaff | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"create" | "existing">("create");
  const [activation, setActivation] = useState("");
  const [search, setSearch] = useState("");
  const [permissions, setPermissions] = useState<SupportPermission[]>([
    "view",
    "reply",
  ]);
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/support-staff", {
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok) {
        setStaff(null);
        throw new Error(result.error);
      }
      setStaff(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تحميل الفريق.");
    }
  }, []);
  // State is populated by the asynchronous response, not derived in the effect.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    void load();
  }, [load]);
  function reset() {
    setEditing(null);
    setEmail("");
    setName("");
    setActive(true);
    setPermissions(["view", "reply"]);
  }
  async function reissue(id: string) {
    setBusy(true);
    setError("");
    setActivation("");
    try {
      const response = await fetch("/api/admin/support-staff/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reissue", id }),
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error);
      setActivation(result.activationUrl);
      setNotice("تم إصدار رابط تفعيل جديد. أرسله للموظف بشكل خاص.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر إصدار الرابط.");
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    setBusy(true);
    setError("");
    setNotice("");
    setActivation("");
    try {
      const creating = !editing && mode === "create";
      const response = await fetch(
        creating
          ? "/api/admin/support-staff/create"
          : "/api/admin/support-staff",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            creating
              ? { action: "create", name, email, permissions }
              : {
                  ...(editing ? { id: editing.id } : { email }),
                  active,
                  permissions,
                },
          ),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setActivation(result.activationUrl ?? "");
      reset();
      await load();
      setNotice(
        creating
          ? "تم إنشاء حساب الموظف بصلاحيات الدعم. أرسل له رابط التفعيل الخاص ليختار كلمة مروره."
          : "تم حفظ الموظف وصلاحياته. تُطبّق الصلاحيات الجديدة على الطلبات التالية مباشرة.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر الحفظ. حاول مجددًا.");
      await load();
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className={s.workspace} dir="rtl">
      <div className={s.content}>
        <div className={s.title}>
          <div>
            <p className={s.eyebrow}>إدارة الوصول</p>
            <h1>الفريق المناسب. بالصلاحيات المناسبة.</h1>
            <p>
              دور الدعم مستقل عن الأدمن؛ لا يمنح إدارة الحسابات أو الشركاء أو
              الأكواد.
            </p>
          </div>
        </div>
        {error && (
          <div className={s.error} role="alert">
            {error}
            <button onClick={() => void load()}>إعادة المحاولة</button>
          </div>
        )}
        {notice && (
          <p className={s.notice} role="status">
            {notice}
          </p>
        )}
        {activation && (
          <section className={s.panel}>
            <h2>رابط تفعيل الموظف</h2>
            <p>
              رابط سري للاستخدام مرة واحدة، تنتهي صلاحيته حسب إعدادات المصادقة.
              أرسله للموظف بشكل خاص؛ لم يُرسل بريد تلقائي.
            </p>
            <input
              dir="ltr"
              aria-label="رابط التفعيل"
              readOnly
              value={activation}
            />
            <button
              onClick={() =>
                void copyText(activation)
                  .then(() => setNotice("تم نسخ رابط التفعيل."))
                  .catch(() => setError("تعذر النسخ. انسخ الرابط يدوياً."))
              }
            >
              نسخ الرابط
            </button>
            <button onClick={() => setActivation("")}>إخفاء الرابط</button>
          </section>
        )}
        {staff && (
          <div className={s.staffGrid}>
            <section className={s.panel}>
              <h2>{editing ? `تعديل ${editing.name}` : "إنشاء موظف دعم"}</h2>
              <p>
                حساب عمل مستقل، بدون تسجيل كعميل. الموظف يختار كلمة مروره من
                رابط التفعيل.
              </p>
              {!editing && (
                <label>
                  طريقة الإضافة
                  <select
                    disabled={busy}
                    value={mode}
                    onChange={(e) =>
                      setMode(e.target.value as "create" | "existing")
                    }
                  >
                    <option value="create">إنشاء حساب موظف جديد</option>
                    <option value="existing">ربط حساب موجود ومؤكد</option>
                  </select>
                </label>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void save();
                }}
              >
                <label>
                  البريد الإلكتروني
                  <input
                    dir="ltr"
                    type="email"
                    required
                    maxLength={254}
                    value={editing?.email ?? email}
                    disabled={Boolean(editing) || busy}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="support@example.com"
                  />
                </label>
                {!editing && mode === "create" && (
                  <label>
                    اسم الموظف
                    <input
                      required
                      minLength={2}
                      maxLength={100}
                      disabled={busy}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </label>
                )}
                <fieldset disabled={busy}>
                  <legend>صلاحيات الموظف</legend>
                  {supportPermissions.map((permission) => (
                    <label className={s.check} key={permission}>
                      <input
                        type="checkbox"
                        checked={permissions.includes(permission)}
                        disabled={permission === "view"}
                        onChange={(e) =>
                          setPermissions((current) =>
                            e.target.checked
                              ? [...current, permission]
                              : current.filter((p) => p !== permission),
                          )
                        }
                      />
                      <span>{permissionLabels[permission]}</span>
                    </label>
                  ))}
                </fieldset>
                {(editing || mode === "existing") && (
                  <label className={s.check}>
                    <input
                      type="checkbox"
                      checked={active}
                      disabled={busy}
                      onChange={(e) => setActive(e.target.checked)}
                    />
                    <span>الوصول للدعم مفعّل</span>
                  </label>
                )}
                {!active && (
                  <p>
                    إيقاف الوصول لا يحذف الحساب أو الرسائل، ويعيد تذاكره
                    المفتوحة إلى الطابور غير المسند.
                  </p>
                )}
                <button className={s.primary} disabled={busy}>
                  {busy
                    ? "جاري الحفظ…"
                    : editing
                      ? "حفظ الصلاحيات"
                      : "إضافة موظف الدعم"}
                </button>
                {editing && (
                  <button disabled={busy} type="button" onClick={reset}>
                    إلغاء التعديل
                  </button>
                )}
              </form>
            </section>
            <section className={s.staffList} aria-label="موظفو الدعم">
              <label>
                بحث في الفريق
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="الاسم أو البريد"
                />
              </label>
              {staff.length === 0 ? (
                <div className={`${s.panel} ${s.empty}`}>
                  <Users />
                  <h2>فريقك يبدأ من هنا</h2>
                  <p>
                    لم تُضف موظفي دعم بعد. الأدمن يستطيع متابعة التذاكر من صندوق
                    الدعم.
                  </p>
                </div>
              ) : (
                staff
                  .filter((member) =>
                    `${member.name} ${member.email}`
                      .toLowerCase()
                      .includes(search.toLowerCase()),
                  )
                  .map((member) => (
                    <article className={s.staffCard} key={member.id}>
                      <header>
                        <h3>{member.name || "موظف دعم"}</h3>
                        <span className={s.status}>
                          {!member.active
                            ? "موقوف"
                            : member.activated === false
                              ? "بانتظار التفعيل"
                              : "مفعّل"}
                        </span>
                      </header>
                      <p dir="ltr">{member.email}</p>
                      <ul>
                        {member.permissions.map((p) => (
                          <li key={p}>{permissionLabels[p]}</li>
                        ))}
                      </ul>
                      <button
                        disabled={busy}
                        onClick={() => {
                          setEditing(member);
                          setPermissions(member.permissions);
                          setActive(member.active);
                          setError("");
                          setNotice("");
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                      >
                        تعديل الصلاحيات والوصول
                      </button>
                      {member.activated === false && (
                        <button
                          disabled={busy || !member.active}
                          onClick={() => void reissue(member.id)}
                        >
                          إصدار رابط تفعيل
                        </button>
                      )}
                    </article>
                  ))
              )}
            </section>
          </div>
        )}
        {!staff && !error && <div className={s.empty}>جاري تحميل الفريق…</div>}
      </div>
    </main>
  );
}
