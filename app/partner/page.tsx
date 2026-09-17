import { Activity, ArrowUpLeft, Boxes, CheckCircle2, ChevronDown, CircleGauge, Download, PackageCheck, Plus, ShieldCheck, UsersRound } from "lucide-react";
import { DorniBrand } from "@/components/dorni-brand";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const metrics = [
  { label: "إجمالي الأكواد", value: "12,500", note: "+5,000 هذا الشهر", icon: Boxes, tone: "navy" },
  { label: "تم توزيعها", value: "9,240", note: "73.9% من الإجمالي", icon: PackageCheck, tone: "cyan" },
  { label: "بطاقات مفعّلة", value: "6,891", note: "74.6% نسبة التفعيل", icon: CheckCircle2, tone: "green" },
  { label: "تنبيهات آخر 30 يوم", value: "1,284", note: "+12.4% عن الشهر الماضي", icon: Activity, tone: "amber" },
];

export default function PartnerPortal() {
  return (
    <main className="portal-shell" dir="rtl">
      <aside className="portal-sidebar">
        <DorniBrand />
        <div className="org-card"><span>أ م</span><div><b>الأمان للتأمين</b><small>شريك معتمد</small></div><ChevronDown /></div>
        <nav><a className="active"><CircleGauge /> نظرة عامة</a><a><Boxes /> الدفعات والأكواد</a><a><Activity /> التحليلات</a><a><UsersRound /> فريق العمل</a></nav>
        <div className="sidebar-trust"><ShieldCheck /><b>بيانات العملاء محمية</b><p>تظهر هنا إحصائيات مجمّعة فقط.</p></div>
      </aside>
      <section className="portal-main">
        <header className="portal-header"><div><p>لوحة الشريك</p><h1>نظرة عامة</h1></div><div className="portal-user"><span>م ع</span><div><b>مريم العيساوي</b><small>مدير الشريك</small></div><ChevronDown /></div></header>
        <div className="portal-lead"><div><p>الخميس، 17 سبتمبر 2026</p><h2>أهلاً مريم، هذه حالة بطاقاتكم اليوم.</h2></div><Button><Plus /> طلب دفعة جديدة</Button></div>
        <div className="metric-grid">{metrics.map(({ label, value, note, icon: Icon, tone }) => <article key={label}><span className={`metric-icon ${tone}`}><Icon /></span><p>{label}</p><strong>{value}</strong><small><ArrowUpLeft /> {note}</small></article>)}</div>
        <div className="portal-grid">
          <article className="table-card"><div className="card-heading"><div><h3>آخر الدفعات</h3><p>حالة الإنتاج والتوزيع</p></div><button>عرض الكل <ArrowUpLeft /></button></div><div className="batch-table"><div className="batch-head"><span>الدفعة</span><span>الكمية</span><span>الحالة</span><span>التفعيل</span><span /></div>{[
            ["DOR-INS-000124", "5,000", "قيد الإنتاج", "—", "amber"], ["DOR-INS-000119", "4,000", "تم التوزيع", "68%", "green"], ["DOR-INS-000108", "3,500", "مكتملة", "81%", "blue"],
          ].map((row) => <div className="batch-row" key={row[0]}><b>{row[0]}</b><span>{row[1]}</span><Badge className={`batch-status ${row[4]}`}>{row[2]}</Badge><span>{row[3]}</span><button aria-label="تنزيل"><Download /></button></div>)}</div></article>
          <article className="activation-card"><div className="card-heading"><div><h3>رحلة التفعيل</h3><p>من التوزيع إلى الاستخدام</p></div><Badge variant="secondary">آخر 30 يوم</Badge></div><div className="funnel"><div><span>9,240</span><b>تم توزيعها</b></div><div><span>7,460</span><b>تم مسح رمز المطالبة</b></div><div><span>6,891</span><b>بطاقات مفعّلة</b></div></div><p className="aggregate-note"><ShieldCheck /> أرقام مجمّعة — لا تتضمن بيانات أصحاب السيارات.</p></article>
        </div>
      </section>
    </main>
  );
}
