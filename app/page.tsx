"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle, CarFront, Check, ChevronLeft, CircleAlert,
  DoorOpen, Lightbulb, MapPin, MoveRight, ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

const reasons = [
  { value: "BLOCKING_EXIT", label: "السيارة تعيق خروجي", icon: MoveRight },
  { value: "PLEASE_MOVE", label: "الرجاء تحريك السيارة", icon: CarFront },
  { value: "LIGHTS_ON", label: "الأنوار ما زالت شغّالة", icon: Lightbulb },
  { value: "DOOR_OPEN", label: "باب أو نافذة مفتوحة", icon: DoorOpen },
  { value: "DAMAGE", label: "هناك ضرر أو مشكلة بالسيارة", icon: AlertTriangle },
  { value: "URGENT", label: "تنبيه عاجل", icon: CircleAlert },
];

export default function PublicScanPage() {
  const [reason, setReason] = useState("BLOCKING_EXIT");
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <main className="public-shell" dir="rtl">
        <div className="ambient-orb ambient-orb-one" />
        <section className="status-card" aria-live="polite">
          <div className="success-mark"><Check aria-hidden="true" /></div>
          <p className="eyebrow">تم بنجاح</p>
          <h1>تم إرسال التنبيه</h1>
          <p className="support-copy">دورني سيتواصل مع صاحب السيارة من غير ما يكشف أي بيانات شخصية.</p>
          <div className="status-steps">
            <div className="status-step is-done"><span>1</span><div><strong>تم استلام البلاغ</strong><small>الآن</small></div></div>
            <div className="status-step"><span>2</span><div><strong>إيصال التنبيه</strong><small>جاري المحاولة عبر القنوات المتاحة</small></div></div>
            <div className="status-step"><span>3</span><div><strong>رد صاحب السيارة</strong><small>سيظهر الرد هنا</small></div></div>
          </div>
          <div className="privacy-note"><ShieldCheck /><span>هذه الصفحة خاصة بهذا البلاغ وتنتهي صلاحيتها تلقائياً.</span></div>
          <Button className="primary-action" onClick={() => setSent(false)}>رجوع للتجربة</Button>
        </section>
      </main>
    );
  }

  return (
    <main className="public-shell" dir="rtl">
      <div className="ambient-orb ambient-orb-one" />
      <div className="ambient-orb ambient-orb-two" />
      <header className="public-header">
        <Link className="brand" href="/" aria-label="دورني، الصفحة الرئيسية">
          <span className="brand-mark"><span /></span>
          <span><b>دورني</b><small>DORNI</small></span>
        </Link>
        <span className="secure-chip"><ShieldCheck /> تواصل آمن</span>
      </header>

      <section className="scan-card">
        <div className="vehicle-summary">
          <div className="vehicle-icon"><CarFront /></div>
          <div>
            <p className="eyebrow">تأكيد السيارة</p>
            <h1>تويوتا كامري</h1>
            <p>أبيض <span aria-hidden="true">•</span> موديل 2021</p>
          </div>
          <span className="verified-badge"><Check /> بطاقة مفعّلة</span>
        </div>

        <div className="divider" />
        <div className="report-heading">
          <span className="step-number">1</span>
          <div><h2>شن تبي تقول لصاحب السيارة؟</h2><p>اختار سبب واحد، من غير كتابة أو مشاركة بيانات.</p></div>
        </div>

        <RadioGroup value={reason} onValueChange={setReason} className="reason-grid" aria-label="سبب التنبيه">
          {reasons.map(({ value, label, icon: Icon }) => (
            <label key={value} className={`reason-option ${reason === value ? "is-selected" : ""}`}>
              <RadioGroupItem value={value} className="sr-only" />
              <span className="reason-icon"><Icon /></span>
              <span>{label}</span>
              <span className="selection-dot"><Check /></span>
            </label>
          ))}
        </RadioGroup>

        <button className="location-row" type="button">
          <span className="location-icon"><MapPin /></span>
          <span><b>إضافة موقعي الحالي</b><small>اختياري — يساعد صاحب السيارة يوصل أسرع</small></span>
          <ChevronLeft />
        </button>
        <Button className="primary-action" size="lg" onClick={() => setSent(true)}>إرسال التنبيه <ChevronLeft /></Button>
        <p className="privacy-footer"><ShieldCheck /> رقم واسم صاحب السيارة يظلوا مخفيين بالكامل</p>
      </section>

      <footer className="public-footer">
        <span>بطاقة دورني الرسمية</span><span>•</span><Link href="/app">دخول صاحب السيارة</Link>
      </footer>
    </main>
  );
}
