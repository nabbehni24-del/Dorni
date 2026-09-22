"use client";

import { useEffect, useState } from "react";
import { Check, Clock3, RefreshCw, ShieldCheck } from "lucide-react";

const responseLabel: Record<string, string> = {
  ON_MY_WAY: "صاحب السيارة جاي",
  RESOLVED: "تم حل الموضوع",
  CANNOT_REACH_NOW: "صاحب السيارة مش قادر يوصل توا",
};

type ReportStatus = {
  status: string;
  ownerResponse: string | null;
  updatedAt: string;
};

export function StatusClient({ token }: { token: string }) {
  const [data, setData] = useState<ReportStatus | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    let inFlight = false;
    async function load() {
      if (inFlight) return;
      inFlight = true;
      try {
        const response = await fetch(`/api/public/status/${token}`, { cache: "no-store" });
        const result = await response.json();
        if (!alive) return;
        if (!response.ok) {
          setError(result.error ?? "تعذر تحميل حالة البلاغ");
        } else {
          setError("");
          setData(result);
        }
      } catch {
        if (alive) setError("تعذر تحديث حالة البلاغ؛ سنعيد المحاولة.");
      } finally {
        inFlight = false;
      }
    }
    void load();
    const timer = window.setInterval(() => { void load(); }, 5000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [token]);

  const answered = Boolean(data?.ownerResponse);
  return <main className="public-shell" dir="rtl">
    <section className="status-card">
      {error && !data ? <>
        <div className="success-mark"><Clock3/></div>
        <h1>رابط الحالة غير متاح</h1>
        <p className="support-copy">{error}</p>
      </> : !data ? <>
        <RefreshCw className="spin status-spinner"/>
        <h1>جاري تحميل حالة البلاغ</h1>
      </> : <>
        <div className={`success-mark status-mark ${answered ? "status-mark--responded" : "status-mark--waiting"}`}>
          <Check/>
        </div>
        <p className="eyebrow">بلاغ محفوظ</p>
        <h1>{answered ? responseLabel[data.ownerResponse!] ?? "رد صاحب السيارة" : "في انتظار رد صاحب السيارة"}</h1>
        <p className="support-copy">هذه الحالة تُحدّث تلقائياً من رد صاحب السيارة المحفوظ في دورني.</p>
        {error && <p className="refresh-error" role="status">{error}</p>}
        <div className="status-steps">
          <div className="status-step is-done"><span>1</span><div><strong>تم استلام البلاغ</strong><small>مسجّل في النظام</small></div></div>
          <div className={`status-step ${answered ? "is-done" : "is-waiting"}`}><span>2</span><div><strong>رد صاحب السيارة</strong><small>{answered ? responseLabel[data.ownerResponse!] ?? "تم الرد" : "في انتظار الرد"}</small></div></div>
        </div>
        <div className="privacy-note"><ShieldCheck/><span>الرابط خاص بهذا البلاغ وينتهي تلقائياً.</span></div>
      </>}
    </section>
  </main>;
}
