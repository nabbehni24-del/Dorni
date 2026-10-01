"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { requestJson, errorMessage, copyText } from "@/lib/client-api";
import { Button } from "@/components/ui/button";
type Company = {
  id: string;
  name: string;
  type: string;
  status: string;
  trusted_generation: boolean;
  generation_limit_per_day: number;
  review_note: string | null;
};
type Overview = {
  auditLogs: {
    id: string;
    action: string;
    actor_kind: string;
    entity_type: string;
    created_at: string;
  }[];
  metrics: Record<string, number>;
  organizations: Company[];
  recentBatches: {
    id: string;
    batch_code: string;
    quantity: number;
    generation_status: string;
  }[];
  recentReports: {
    id: string;
    report_type_code: string;
    status: string;
    created_at: string;
  }[];
  supportTickets: { id: string; subject: string; status: string }[];
};
const labels: Record<string, string> = {
  ACKNOWLEDGED: "تم الاطلاع",
  REJECTED: "مرفوضة",
  BLOCKING_EXIT: "تعيق الخروج",
  PLEASE_MOVE: "طلب تحريك السيارة",
  LIGHTS_ON: "أنوار السيارة مشغّلة",
  DOOR_OR_WINDOW_OPEN: "باب أو نافذة مفتوحة",
  VEHICLE_DAMAGE: "ضرر بالسيارة",
  URGENT_ATTENTION: "تنبيه عاجل",
  ADMIN: "الإدارة",
  SYSTEM: "النظام",
  OWNER: "مالك السيارة",
  PARTNER: "شركة",
  SUPPORT_STAFF_CREATE: "إنشاء موظف دعم",
  SUPPORT_STAFF_SAVE: "تحديث صلاحيات موظف",
  SUPPORT_ACTIVATION_LINK: "إصدار رابط تفعيل موظف",
  PARTNER_STATUS_CHANGED: "تحديث حالة شركة",
  PRODUCTION_EXPORT_ACCESSED: "تحميل ملف طباعة",
  internal_membership: "حساب داخلي",
  partner_organization: "شركة",
  production_export: "ملف إنتاج",
  ACTIVE: "نشط",
  PENDING: "بانتظار المراجعة",
  SUSPENDED: "موقوف",
  COMPLETED: "مكتمل",
  READY: "جاهز",
  GENERATED: "تم التوليد",
  PROCESSING: "قيد المعالجة",
  FAILED: "تعذر الإصدار",
  OPEN: "جديد",
  IN_PROGRESS: "قيد المعالجة",
  RESOLVED: "تم الحل",
  CLOSED: "مغلق",
  INSURANCE: "تأمين",
  CORPORATE: "شركة",
  DISTRIBUTOR: "موزع",
  OTHER: "أخرى",
};
export function AdminWorkspace({
  section,
}: {
  section: "overview" | "companies" | "production" | "activity";
}) {
  const [data, setData] = useState<Overview | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [search, setSearch] = useState(""),
    [invite, setInvite] = useState("");
  const [editing, setEditing] = useState<Company | null>(null),
    [productionExport, setProductionExport] = useState("");
  const editHeading = useRef<HTMLHeadingElement>(null);
  const editingId=editing?.id;
  useEffect(() => { if (editingId) { editHeading.current?.focus(); editHeading.current?.scrollIntoView({block:"center",behavior:"smooth"}); } }, [editingId]);
  const [partner, setPartner] = useState({
    name: "",
    type: "CORPORATE",
    adminEmail: "",
    trustedGeneration: false,
  });
  const [batch, setBatch] = useState({ organizationId: "", quantity: 100 });
  const load = useCallback(async () => {
    try {
      setData(await requestJson<Overview>("/api/admin/overview"));
      setError("");
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);
  // Fetch asynchronously; existing data remains visible while refreshing.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);
  async function submit(kind: "company" | "batch") {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    setInvite("");
    try {
      const result = await requestJson<{
        invitation?: { url: string };
        batch?: { batchCode: string };
        productionExport?: { id: string };
      }>(kind === "company" ? "/api/admin/partners" : "/api/admin/batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          kind === "company"
            ? partner
            : {
                ...batch,
                organizationId: batch.organizationId || null,
                productType: "STANDARD_CARD",
              },
        ),
      });
      if (kind === "company") {
        setInvite(result.invitation?.url ?? "");
        setPartner({
          name: "",
          type: "CORPORATE",
          adminEmail: "",
          trustedGeneration: false,
        });
        setNotice(
          result.invitation
            ? "تم إنشاء الشركة. أرسل الدعوة الخاصة لمديرها."
            : "تم إنشاء الشركة وربط حساب مديرها.",
        );
      } else {
        setNotice(`تم إصدار الدفعة ${result.batch?.batchCode ?? ""}.`);
        setProductionExport(result.productionExport?.id ?? "");
      }
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  if (!data)
    return (
      <section className="ws-panel">
        <h2>{error ? "تعذر تحميل مساحة الإدارة" : "جاري تحميل البيانات…"}</h2>
        {error && (
          <>
            <p role="alert">{error}</p>
            <Button onClick={() => void load()}>إعادة المحاولة</Button>
            <Link href="/login"> تسجيل الدخول</Link>
          </>
        )}
      </section>
    );
  return (
    <div className="ws-stack">
      <div className="ws-toolbar">
        <p>
          {section === "overview"
            ? "حالة المنظومة واختصارات العمل اليومية."
            : section === "activity"
              ? "آخر 50 عملية مسجلة على المنظومة."
              : section === "companies"
                ? "إنشاء الشركات، ربط المديرين ومتابعة حالة الشراكات."
                : "إصدار دفعات الأكواد ومتابعة الإنتاج."}
        </p>
        <Button variant="outline" disabled={busy} onClick={() => void load()}>
          تحديث البيانات
        </Button>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="success-banner" role="status">
          {notice}
        </p>
      )}
      {section === "overview" && (
        <>
          <div className="ws-kpis">
            {[
              ["users", "الحسابات"],
              ["partners", "الشركات"],
              ["codes", "الأكواد"],
              ["reports", "البلاغات"],
              ["support", "تذاكر الدعم"],
            ].map(([key, label]) => (
              <article key={key}>
                <small>{label}</small>
                <strong>{data.metrics[key] ?? 0}</strong>
              </article>
            ))}
          </div>
          <section className="ws-panel">
            <h2>ابدأ مهمة</h2>
            <div className="ws-toolbar">
              <Link href="/admin/companies">إدارة الشركات ←</Link>
              <Link href="/admin/production">إصدار أكواد ←</Link>
              <Link href="/admin/support">إدارة فريق الدعم ←</Link>
              <Link href="/admin/inbox">متابعة التذاكر ←</Link>
            </div>
          </section>
          <section className="ws-panel">
            <h2>آخر البلاغات</h2>
            <div className="ws-table-wrap">
              <table className="ws-table">
                <thead>
                  <tr>
                    <th>البلاغ</th>
                    <th>النوع</th>
                    <th>الحالة</th>
                    <th>التاريخ</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentReports.map((r) => (
                    <tr key={r.id}>
                      <td>#{r.id.slice(0, 8)}</td>
                    <td>{labels[r.report_type_code] ?? r.report_type_code}</td>
                      <td>{labels[r.status] ?? r.status}</td>
                      <td>
                        {new Date(r.created_at).toLocaleDateString("ar-LY")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!data.recentReports.length && (
              <p className="ws-empty">لا توجد بلاغات بعد.</p>
            )}
          </section>
        </>
      )}
      {section === "activity" && (
        <section className="ws-panel">
          <h2>سجل العمليات</h2>
          <p>سجل للقراءة فقط؛ لا يتضمن كلمات مرور أو روابط التفعيل.</p>
          <div className="ws-table-wrap">
            <table className="ws-table">
              <thead>
                <tr>
                  <th>العملية</th>
                  <th>نوع الحساب</th>
                  <th>الجهة</th>
                  <th>الوقت</th>
                </tr>
              </thead>
              <tbody>
                {data.auditLogs.map((log) => (
                  <tr key={log.id}>
                    <td>{labels[log.action] ?? log.action}</td>
                    <td>{labels[log.actor_kind] ?? log.actor_kind}</td>
                    <td>{labels[log.entity_type] ?? log.entity_type}</td>
                    <td>{new Date(log.created_at).toLocaleString("ar-LY")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!data.auditLogs.length && (
            <p className="ws-empty">لا توجد عمليات مسجلة بعد.</p>
          )}
        </section>
      )}
      {section === "companies" && (
        <>
          {editing && (
            <section className="ws-panel">
              <h2 ref={editHeading} tabIndex={-1}>إدارة {editing.name}</h2>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (
                    editing.status !== "ACTIVE" &&
                    !window.confirm(
                      "تغيير الحالة سيوقف وصول الشركة إلى عملياتها. متابعة؟",
                    )
                  )
                    return;
                  setBusy(true);
                  setError("");
                  try {
                    await requestJson("/api/admin/companies", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        id: editing.id,
                        status: editing.status,
                        trustedGeneration: editing.trusted_generation,
                        limit: editing.generation_limit_per_day,
                        note: editing.review_note ?? "",
                      }),
                    });
                    setEditing(null);
                    setNotice(
                      "تم تحديث الشركة وتسجيل التغيير في سجل العمليات.",
                    );
                    await load();
                  } catch (e) {
                    setError(errorMessage(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <label>
                  حالة الشركة
                  <select
                    required
                    value={editing.status}
                    onChange={(e) =>
                      setEditing({ ...editing, status: e.target.value })
                    }
                  >
                    {editing.status === "PENDING" && (
                      <option value="PENDING" disabled>
                        بانتظار المراجعة
                      </option>
                    )}
                    <option value="ACTIVE">نشطة</option>
                    <option value="SUSPENDED">موقوفة</option>
                    <option value="REJECTED">مرفوضة</option>
                  </select>
                </label>
                <label>
                  حد الإصدار اليومي
                  <input
                    type="number"
                    min={1}
                    max={100000}
                    required
                    value={editing.generation_limit_per_day}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        generation_limit_per_day: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label style={{ display: "flex" }}>
                  <input
                    style={{ width: 18 }}
                    type="checkbox"
                    checked={editing.trusted_generation}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        trusted_generation: e.target.checked,
                      })
                    }
                  />{" "}
                  السماح بالإصدار المباشر
                </label>
                <label>
                  ملاحظة المراجعة
                  <input
                    maxLength={1000}
                    value={editing.review_note ?? ""}
                    onChange={(e) =>
                      setEditing({ ...editing, review_note: e.target.value })
                    }
                  />
                </label>
                <div className="ws-toolbar">
                  <button disabled={busy || editing.status === "PENDING"}>
                    حفظ التغييرات
                  </button>
                  <Button
                    variant="outline"
                    type="button"
                    disabled={busy}
                    onClick={() => setEditing(null)}
                  >
                    إلغاء
                  </Button>
                  <Link href="/admin/institutions">التخويلات المؤسسية</Link>
                </div>
              </form>
            </section>
          )}
          <details className="ws-panel">
            <summary className="ws-add-company">إنشاء شركة جديدة</summary>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submit("company");
              }}
            >
              <div className="form-pair">
                <label>
                  اسم الشركة
                  <input
                    required
                    minLength={2}
                    maxLength={160}
                    value={partner.name}
                    onChange={(e) =>
                      setPartner({ ...partner, name: e.target.value })
                    }
                  />
                </label>
                <label>
                  نوع الشركة
                  <select
                    value={partner.type}
                    onChange={(e) =>
                      setPartner({ ...partner, type: e.target.value })
                    }
                  >
                    {["CORPORATE", "INSURANCE", "DISTRIBUTOR", "OTHER"].map(
                      (t) => (
                        <option key={t} value={t}>
                          {labels[t]}
                        </option>
                      ),
                    )}
                  </select>
                </label>
              </div>
              <label>
                بريد مدير الشركة
                <input
                  required
                  type="email"
                  dir="ltr"
                  maxLength={254}
                  value={partner.adminEmail}
                  onChange={(e) =>
                    setPartner({ ...partner, adminEmail: e.target.value })
                  }
                />
              </label>
              <label style={{ display: "flex", alignItems: "center" }}>
                <input
                  style={{ width: 18 }}
                  type="checkbox"
                  checked={partner.trustedGeneration}
                  onChange={(e) =>
                    setPartner({
                      ...partner,
                      trustedGeneration: e.target.checked,
                    })
                  }
                />{" "}
                السماح بتوليد الأكواد مباشرة ضمن حد الشركة
              </label>
              <button disabled={busy}>
                {busy ? "جاري الإنشاء…" : "إنشاء الشركة"}
              </button>
            </form>
            {invite && (
              <div role="status">
                <p>رابط خاص بمدير الشركة؛ لا تنشره علناً.</p>
                <input
                  readOnly
                  dir="ltr"
                  aria-label="رابط دعوة الشركة"
                  value={invite}
                />
                <button
                  onClick={() =>
                    void copyText(invite)
                      .then(() => setNotice("تم نسخ الدعوة."))
                      .catch(() => setError("تعذر النسخ؛ انسخ الرابط يدوياً."))
                  }
                >
                  نسخ الدعوة
                </button>
              </div>
            )}
          </details>
          <section className="ws-panel">
            <div className="ws-toolbar">
              <h2>الشركات ({data.organizations.length})</h2>
              <label>
                بحث
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="اسم الشركة"
                />
              </label>
            </div>
            <div className="ws-table-wrap">
              <table className="ws-table">
                <thead>
                  <tr>
                    <th>الشركة</th>
                    <th>النوع</th>
                    <th>الحالة</th>
                    <th>الإجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {data.organizations
                    .filter((o) => o.name.includes(search.trim()))
                    .map((o) => (
                      <tr key={o.id}>
                        <td>{o.name}</td>
                        <td>{labels[o.type] ?? o.type}</td>
                        <td>{labels[o.status] ?? o.status}</td>
                        <td>
                          <button onClick={() => setEditing(o)}>
                            إدارة الشركة
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {!data.organizations.filter((o) => o.name.includes(search.trim()))
              .length && <p className="ws-empty">لا توجد شركات مطابقة.</p>}
          </section>
        </>
      )}
      {section === "production" && (
        <>
          {productionExport && (
            <section className="ws-panel">
              <h2>ملف طباعة الدفعة جاهز</h2>
              <p>
                يحتوي على رموز تفعيل سرية. حمّله إلى جهاز موثوق ولا تشاركه
                علناً.
              </p>
              <button
                disabled={busy}
                onClick={async () => {
                  try {
                    const result = await requestJson<{ url: string }>(
                      `/api/admin/exports/${productionExport}`,
                    );
                    window.location.assign(result.url);
                  } catch (e) {
                    setError(errorMessage(e));
                  }
                }}
              >
                تحميل ملف الطباعة CSV
              </button>
            </section>
          )}
          <section className="ws-panel">
            <h2>إصدار دفعة</h2>
            <p>
              عملية الإصدار تنشئ أكواداً فعلية. راجع الشركة والكمية قبل التأكيد.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (window.confirm(`تأكيد إصدار ${batch.quantity} كود؟`))
                  void submit("batch");
              }}
            >
              <div className="form-pair">
                <label>
                  الجهة
                  <select
                    value={batch.organizationId}
                    onChange={(e) =>
                      setBatch({ ...batch, organizationId: e.target.value })
                    }
                  >
                    <option value="">دورني — إصدار مباشر</option>
                    {data.organizations
                      .filter((o) => o.status === "ACTIVE")
                      .map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  عدد الأكواد
                  <input
                    type="number"
                    required
                    min={1}
                    max={1000}
                    step={1}
                    value={batch.quantity}
                    onChange={(e) =>
                      setBatch({ ...batch, quantity: Number(e.target.value) })
                    }
                  />
                </label>
              </div>
              <button disabled={busy}>
                {busy ? "جاري الإصدار…" : "إصدار الدفعة"}
              </button>
            </form>
          </section>
          <section className="ws-panel">
            <h2>آخر الدفعات</h2>
            <div className="ws-table-wrap">
              <table className="ws-table">
                <thead>
                  <tr>
                    <th>الدفعة</th>
                    <th>الكمية</th>
                    <th>حالة الإنتاج</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentBatches.map((b) => (
                    <tr key={b.id}>
                      <td dir="ltr">{b.batch_code}</td>
                      <td>{b.quantity}</td>
                      <td>
                        {labels[b.generation_status] ?? b.generation_status}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!data.recentBatches.length && (
              <p className="ws-empty">لم تُصدر دفعات بعد.</p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
