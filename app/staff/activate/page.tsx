"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DorniBrand } from "@/components/dorni-brand";
import { requestJson, errorMessage } from "@/lib/client-api";
export default function ActivateStaff() {
  const router = useRouter();
  const [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function activate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("كلمتا المرور غير متطابقتين.");
      return;
    }
    setBusy(true);
    try {
      const tokenHash = new URLSearchParams(location.hash.slice(1)).get(
        "token_hash",
      );
      if (!tokenHash)
        throw Error("رابط التفعيل ناقص. اطلب رابطاً جديداً من الأدمن.");
      await requestJson("/api/staff/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokenHash, password }),
      });
      history.replaceState(null, "", location.pathname);
      router.replace("/support");
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }
  return (
    <main className="auth-shell" dir="rtl">
      <header>
        <DorniBrand />
      </header>
      <section className="auth-card">
        <h1>أهلاً بك في فريق دورني</h1>
        <p>حسابك جاهز. اختر كلمة مرور لتفعيل الوصول إلى مساحة الدعم.</p>
        <form onSubmit={activate}>
          <label className="auth-field">
            كلمة المرور
            <input
              type="password"
              dir="ltr"
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={128}
              pattern="(?=.*[A-Za-z])(?=.*[0-9]).{8,128}"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <label className="auth-field">
            تأكيد كلمة المرور
            <input
              type="password"
              dir="ltr"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </label>
          <button className="primary-action" disabled={busy}>
            {busy ? "جاري التفعيل…" : "تفعيل الحساب والدخول"}
          </button>
        </form>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}
