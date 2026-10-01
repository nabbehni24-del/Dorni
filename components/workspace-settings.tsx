"use client";
import { useState } from "react";
import { useTheme } from "next-themes";
import { requestJson, errorMessage } from "@/lib/client-api";
import "./workspace-shell.css";
export function WorkspaceSettings() {
  const { theme, setTheme } = useTheme();
  const [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    if (password !== confirm) {
      setError("كلمتا المرور غير متطابقتين.");
      return;
    }
    setBusy(true);
    try {
      await requestJson("/api/auth/update-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      setPassword("");
      setConfirm("");
      setNotice("تم تغيير كلمة المرور.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="ws-stack">
      <section className="ws-panel">
        <h2>مظهر مساحة العمل</h2>
        <p>
          يُطبّق فوراً ويُحفظ على هذا الجهاز، بدون التأثير على حسابات الفريق.
        </p>
        <label>
          المظهر
          <select
            value={theme ?? "system"}
            onChange={(e) => setTheme(e.target.value)}
          >
            <option value="system">حسب الجهاز</option>
            <option value="light">فاتح</option>
            <option value="dark">داكن</option>
          </select>
        </label>
      </section>
      <section className="ws-panel">
        <h2>أمان حسابك</h2>
        <p>
          غيّر كلمة مرور الحساب الذي تستخدمه الآن. هذه العملية لا تغيّر كلمات
          مرور الموظفين.
        </p>
        <form onSubmit={save}>
          <label>
            كلمة المرور الجديدة
            <input
              type="password"
              autoComplete="new-password"
              dir="ltr"
              required
              minLength={8}
              maxLength={128}
              pattern="(?=.*[A-Za-z])(?=.*[0-9]).{8,128}"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <small>8 أحرف على الأقل، تتضمن حرفاً إنجليزياً ورقماً.</small>
          <label>
            تأكيد كلمة المرور
            <input
              type="password"
              autoComplete="new-password"
              dir="ltr"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </label>
          <button disabled={busy}>
            {busy ? "جاري الحفظ…" : "تغيير كلمة المرور"}
          </button>
        </form>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="success-banner">
            {notice}
          </p>
        )}
      </section>
    </div>
  );
}
