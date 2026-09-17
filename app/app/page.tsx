"use client";

import { useState } from "react";
import { Bell, CarFront, Check, ChevronLeft, CircleUserRound, Clock3, Menu, MessageCircle, Plus, ShieldCheck } from "lucide-react";
import { DorniBrand } from "@/components/dorni-brand";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const nav = [
  { id: "account", label: "بياناتي", icon: CircleUserRound },
  { id: "alerts", label: "التنبيهات", icon: Bell },
  { id: "cars", label: "سياراتي", icon: CarFront },
];

export default function OwnerApp() {
  const [active, setActive] = useState("alerts");
  const [response, setResponse] = useState<string | null>(null);
  return (
    <main className="owner-page" dir="rtl">
      <header className="owner-topbar">
        <DorniBrand compact />
        <button className="icon-button" aria-label="فتح القائمة"><Menu /></button>
      </header>

      <section className="owner-content">
        <div className="owner-welcome">
          <div><p className="eyebrow">مساء الخير، محمد</p><h1>التنبيهات</h1></div>
          <Badge className="soft-badge"><span className="live-dot" /> كل شيء تمام</Badge>
        </div>

        <div className="owner-summary-grid">
          <article><span className="summary-icon mint"><Bell /></span><div><strong>1</strong><small>تنبيه يحتاج ردّك</small></div></article>
          <article><span className="summary-icon blue"><CarFront /></span><div><strong>2</strong><small>سيارات مفعّلة</small></div></article>
        </div>

        <div className="section-title"><div><h2>التنبيهات الحالية</h2><p>وصلك قبل 3 دقائق</p></div><span className="count-pill">1 جديد</span></div>
        <article className="alert-detail-card">
          <div className="alert-accent" />
          <div className="alert-card-head">
            <span className="alert-type-icon"><CarFront /></span>
            <div><Badge className="urgent-badge">يحتاج رد</Badge><h3>السيارة تعيق خروجي</h3><p>تويوتا كامري • البيضاء</p></div>
            <span className="time-label"><Clock3 /> 3 د</span>
          </div>
          <div className="report-context"><ShieldCheck /><p><b>خصوصية محمية</b><span>المبلّغ لا يقدر يشوف اسمك أو رقمك.</span></p></div>
          <div className="owner-actions">
            <p>شن تحب ترد؟</p>
            <div>
              <Button onClick={() => setResponse("جاي للسيارة")} className={response === "جاي للسيارة" ? "selected-response" : ""}><CarFront /> جاي للسيارة</Button>
              <Button variant="outline" onClick={() => setResponse("تم حل الموضوع")}><Check /> تم حل الموضوع</Button>
              <Button variant="ghost" onClick={() => setResponse("مش قادر نوصل توا")}><MessageCircle /> مش قادر نوصل توا</Button>
            </div>
          </div>
          {response && <div className="response-confirmation"><Check /> تم إرسال ردّك: <b>{response}</b></div>}
          <button className="detail-link">عرض التفاصيل والخريطة <ChevronLeft /></button>
        </article>

        <div className="section-title spaced"><h2>آخر التنبيهات</h2><button>عرض الكل</button></div>
        <article className="history-row"><span className="history-icon"><Check /></span><div><strong>الأنوار ما زالت شغّالة</strong><small>هيونداي توسان • أمس، 10:42 م</small></div><Badge variant="secondary">تم الحل</Badge></article>
      </section>

      <nav className="owner-bottom-nav" aria-label="التنقل الرئيسي">
        {nav.map(({ id, label, icon: Icon }) => <button key={id} className={active === id ? "active" : ""} onClick={() => setActive(id)}><Icon /><span>{label}</span>{id === "alerts" && <i>1</i>}</button>)}
      </nav>
      <button className="floating-add" aria-label="إضافة سيارة"><Plus /></button>
    </main>
  );
}
