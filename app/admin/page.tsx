import { Activity, BadgeCheck, Boxes, Building2, ChevronLeft, CircleAlert, FileClock, Headphones, LayoutDashboard, Search, ShieldAlert, Siren, UsersRound } from "lucide-react";
import { DorniBrand } from "@/components/dorni-brand";
import { Badge } from "@/components/ui/badge";

export default function AdminConsole() {
  return (
    <main className="admin-shell" dir="rtl">
      <aside className="admin-sidebar"><DorniBrand /><Badge className="internal-badge">داخلي</Badge><nav><a className="active"><LayoutDashboard /> مركز العمليات</a><a><Boxes /> الأكواد والدفعات</a><a><Building2 /> الشركاء</a><a><Siren /> البلاغات والتوصيل <i>7</i></a><a><Headphones /> الدعم الفني <i>12</i></a><a><ShieldAlert /> الأمن وإساءة الاستخدام</a><a><FileClock /> سجل التدقيق</a></nav><div className="admin-profile"><span>س ن</span><div><b>سارة النعّاس</b><small>مسؤول عمليات</small></div></div></aside>
      <section className="admin-main">
        <header className="admin-header"><div><p>دورني / العمليات</p><h1>مركز العمليات</h1></div><label className="admin-search"><Search /><input aria-label="بحث" placeholder="ابحث عن كود، دفعة، بلاغ..." /></label></header>
        <div className="ops-banner"><span><Activity /></span><div><b>النظام يعمل بصورة طبيعية</b><p>آخر فحص للخدمات قبل دقيقتين • نسبة نجاح التوصيل 98.7%</p></div><Badge>مستقر</Badge></div>
        <div className="admin-metrics"><article><p>بلاغات نشطة</p><strong>24</strong><small>7 تنتظر رد المالك</small></article><article><p>فشل في التوصيل</p><strong>9</strong><small className="danger-text">3 تحتاج مراجعة</small></article><article><p>دفعات قيد الإنتاج</p><strong>3</strong><small>8,500 بطاقة</small></article><article><p>حالات إساءة محجوبة</p><strong>42</strong><small>آخر 24 ساعة</small></article></div>
        <div className="admin-grid"><article className="ops-queue"><div className="card-heading"><div><h3>تحتاج تدخّل</h3><p>مرتّبة حسب الأولوية</p></div><button>عرض قائمة العمليات</button></div>{[
          { icon: CircleAlert, title: "فشل توصيل تنبيه عاجل", meta: "بلاغ RPT-84391 • محاولتان فاشلتان", badge: "حرج", tone: "critical" },
          { icon: Boxes, title: "دفعة جاهزة للموافقة", meta: "DOR-INS-000124 • 5,000 كود", badge: "مراجعة", tone: "review" },
          { icon: Headphones, title: "طلب استبدال بطاقة", meta: "SUP-2194 • بطاقة تالفة", badge: "دعم", tone: "support" },
          { icon: ShieldAlert, title: "ارتفاع بلاغات مكررة", meta: "الكود DRN-LY-084273 • حجب تلقائي", badge: "أمن", tone: "security" },
        ].map(({ icon: Icon, title, meta, badge, tone }) => <div className="queue-row" key={title}><span className={`queue-icon ${tone}`}><Icon /></span><div><b>{title}</b><small>{meta}</small></div><Badge className={`queue-badge ${tone}`}>{badge}</Badge><button><ChevronLeft /></button></div>)}</article>
        <article className="activity-panel"><div className="card-heading"><div><h3>نشاط اليوم</h3><p>حتى الآن</p></div></div><div className="activity-stat"><span><BadgeCheck /></span><div><strong>1,862</strong><small>تنبيه تم توصيله</small></div></div><div className="mini-bars"><i style={{height:"42%"}}/><i style={{height:"66%"}}/><i style={{height:"55%"}}/><i style={{height:"82%"}}/><i style={{height:"68%"}}/><i style={{height:"91%"}}/><i style={{height:"76%"}}/><i style={{height:"100%"}}/></div><div className="activity-breakdown"><p><span>واتساب</span><b>76%</b></p><p><span>رسائل SMS</span><b>18%</b></p><p><span>Web Push</span><b>6%</b></p></div><div className="audit-hint"><UsersRound /><p><b>كل إجراء حساس قابل للتتبّع</b><span>آخر تحديث لصلاحيات الموظفين اليوم 11:24 ص</span></p></div></article></div>
      </section>
    </main>
  );
}
