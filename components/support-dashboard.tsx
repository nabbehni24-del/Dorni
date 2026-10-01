"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Headphones, Inbox, LockKeyhole, RefreshCw, Search, Send, Users } from "lucide-react";
import { useSupportLive } from "./use-support-live";
import { ThemeToggle } from "./theme-toggle";
import { statusLabels, ticketStatuses, type SupportOverview, type SupportThread } from "@/lib/support";
import s from "./support-workspace.module.css";

const date = (value: string) => new Date(value).toLocaleString("ar-LY", { dateStyle: "short", timeStyle: "short" });
export function SupportDashboard() {
  const [data, setData] = useState<SupportOverview | null>(null);
  const [thread, setThread] = useState<SupportThread | null>(null);
  const [selected, setSelected] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [draft, setDraft] = useState("");
  const [internal, setInternal] = useState(false);
  const [historyCursor, setHistoryCursor] = useState("");
  const requestId = useRef("");
  const listVersion = useRef(0);
  const threadVersion = useRef(0);
  const can = (permission: SupportOverview["permissions"][number]) => data?.permissions.includes(permission) ?? false;
  const fail = useCallback((response: Response, text: string) => {
    if (response.status === 401 || response.status === 403) { setData(null); setThread(null); setDenied(true); }
    throw new Error(text || "تعذر تحميل البيانات.");
  }, []);
  const load = useCallback(async () => {
    const version = ++listVersion.current;
    try {
      const response = await fetch(`/api/support/workspace?${new URLSearchParams({ status, search: query, page: String(page) })}`, { cache: "no-store" });
      const result = await response.json();
      if (version !== listVersion.current) return;
      if (!response.ok) fail(response, result.error);
      setData(result); setDenied(false);
    } catch (e) { if (version === listVersion.current) setError(e instanceof Error ? e.message : "تعذر الاتصال."); }
  }, [status, query, page, fail]);
  const loadThread = useCallback(async () => {
    if (!selected) return;
    const version = ++threadVersion.current;
    try {
      const response = await fetch(`/api/support/workspace?id=${selected}${historyCursor ? `&before=${historyCursor}` : ""}`, { cache: "no-store" });
      const result = await response.json();
      if (version !== threadVersion.current) return;
      if (!response.ok) { setThread(null); throw new Error(result.error); }
      // Replace latest data rather than retaining messages after permission revocation.
      setThread(result);
    } catch (e) { if (version === threadVersion.current) setError(e instanceof Error ? e.message : "تعذر تحميل المحادثة."); }
    finally { if (version === threadVersion.current) setLoadingThread(false); }
  }, [selected, historyCursor]);
  // Async network responses populate state; counters invalidate obsolete requests.
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { void load(); return () => { listVersion.current++; }; }, [load]);
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { void loadThread(); return () => { threadVersion.current++; }; }, [loadThread]);
  useEffect(() => { const timer = setTimeout(() => { setQuery(search.trim()); setPage(0); }, 300); return () => clearTimeout(timer); }, [search]);
  const refresh = useCallback(() => { void load(); void loadThread(); }, [load, loadThread]);
  const live = useSupportLive(refresh, !denied);
  const select = (id: string) => {
    if (selected === id) return;
    if (draft.trim() && !window.confirm("عند فتح تذكرة أخرى سيُحذف الرد غير المرسل. متابعة؟")) return;
    threadVersion.current++; setThread(null); setSelected(id); setLoadingThread(true); setDraft(""); setInternal(false); setHistoryCursor(""); setError(""); setNotice(""); requestId.current = "";
  };
  async function mutate(action: string, payload: Record<string, unknown>) {
    if (busy) return false;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/support/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, data: payload }) });
      const result = await response.json();
      if (!response.ok) { if (response.status === 401) fail(response, result.error); throw new Error(result.error); }
      setNotice(action === "reply" ? "تم إرسال الرسالة." : "تم تحديث التذكرة.");
      return true;
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر الحفظ. ردك محفوظ في خانة الكتابة."); return false; }
    finally { setBusy(false); refresh(); }
  }
  function loadOlder() {
    if (!thread?.messages.length || busy) return;
    threadVersion.current++; setHistoryCursor(thread.messages[0].id); setLoadingThread(true);
  }
  const ticket = thread?.ticket;
  const closed = ticket && ["CLOSED", "RESOLVED"].includes(ticket.status);
  // Never silently turn a drafted private note into a public reply after revocation.
  const isNote = internal || !can("reply");
  return <main className={s.workspace} dir="rtl">
    <header className={s.header}><div className={s.brand}><Headphones /><div><b>دورني <span>/ الدعم</span></b><small>مساحة عمل الفريق</small></div></div><nav><Link href={data?.admin ? "/admin" : "/app"}><ArrowRight />{data?.admin ? "الإدارة" : "حسابي"}</Link>{data?.admin && <Link href="/admin/support"><Users />فريق الدعم</Link>}<ThemeToggle placement="header" /></nav></header>
    <div className={s.content}>
      <div className={s.title}><div><p className={s.eyebrow}>رعاية المستخدمين</p><h1>كل محادثة، تستحق الاهتمام.</h1><p>تابع الطلبات، تعاون مع الفريق، وساعد المستخدم على الوصول للحل.</p></div><span className={s.connection}><i data-live={live} />{live ? "متصل بالتحديث المباشر" : "تحديث تلقائي كل 15 ثانية"}</span></div>
      {error && <div className={s.error} role="alert">{error}<button onClick={() => { setError(""); refresh(); }}>إعادة المحاولة</button></div>}
      {notice && <p className={s.notice} role="status"><CheckCircle2 />{notice}</p>}
      {denied ? <section className={s.empty}><LockKeyhole /><h2>الوصول مخصص لفريق الدعم</h2><p>سجّل الدخول بحساب الموظف، أو اطلب من الأدمن تفعيل صلاحياتك.</p><Link href="/login">تسجيل الدخول</Link></section> : !data ? <div className={s.empty}><RefreshCw /><p>جاري تحميل مساحة العمل…</p></div> : <>
        <div className={s.metrics}>{[["open", "تذاكر جديدة"], ["progress", "قيد المعالجة"], ["waiting", "بانتظار المستخدم"], ["resolved", "تمت معالجتها"]].map(([key, label]) => <article key={key}><small>{label}</small><strong>{data.metrics[key] ?? 0}</strong></article>)}</div>
        <div className={s.desk} data-selected={Boolean(selected)}>
          <section className={s.inbox} aria-label="صندوق التذاكر"><div className={s.inboxHeading}><h2><Inbox />التذاكر <small>{data.total}</small></h2><button aria-label="تحديث التذاكر" onClick={refresh}><RefreshCw /></button></div>
            <label className={s.search}><Search /><input aria-label="البحث في التذاكر" placeholder="ابحث بالعنوان أو رقم التذكرة" value={search} onChange={e => setSearch(e.target.value)} maxLength={160} /></label>
            <select aria-label="تصفية حسب الحالة" value={status} onChange={e => { setStatus(e.target.value); setPage(0); }}><option value="">كل الحالات</option>{ticketStatuses.map(state => <option key={state} value={state}>{statusLabels[state]}</option>)}</select>
            {!can("view_all") && <p className={s.scope}><LockKeyhole />تظهر التذاكر المسندة لك فقط.</p>}
            <div className={s.ticketList}>{data.tickets.length ? data.tickets.map(item => <button disabled={busy} className={s.ticket} data-active={selected === item.id} key={item.id} onClick={() => select(item.id)}><div><span className={s.status} data-status={item.status}>{statusLabels[item.status]}</span><small>#{item.id.slice(0, 8)}</small></div><h3>{item.subject}</h3><p>{item.requester_name || "مستخدم دورني"}</p><footer><span>{item.assignee_name || "غير مسندة"}</span><time>{date(item.updated_at)}</time></footer></button>) : <div className={s.empty}><Inbox /><p>لا توجد تذاكر ضمن هذا العرض.</p></div>}</div>
            <div className={s.pagination}><button disabled={page === 0} onClick={() => setPage(p => p - 1)}>السابق</button><small>صفحة {page + 1}</small><button disabled={(page + 1) * 30 >= data.total} onClick={() => setPage(p => p + 1)}>التالي</button></div>
          </section>
          <section className={s.conversation} aria-label="محادثة الدعم">
            {!selected ? <div className={s.empty}><Headphones /><h2>ابدأ بتذكرة من الصندوق</h2><p>تفاصيل الطلب والرسائل وأدوات المتابعة تظهر هنا.</p></div> : <>
              <button className={s.mobileBack} onClick={() => { if (!draft.trim() || window.confirm("الرد لم يُرسل بعد. العودة للصندوق؟")) { setSelected(""); setThread(null); setDraft(""); } }}><ArrowRight />كل التذاكر</button>
              {loadingThread ? <div className={s.empty}>جاري تحميل المحادثة…</div> : !ticket ? <div className={s.empty}><LockKeyhole /><p>تعذر فتح التذكرة. قد تكون أُسندت لموظف آخر.</p></div> : <>
                <div className={s.threadHeader}><div><span className={s.status} data-status={ticket.status}>{statusLabels[ticket.status]}</span><h2>{ticket.subject}</h2><small>{ticket.requester_name} · {date(ticket.created_at)}</small></div><span className={s.ticketNumber}>#{ticket.id.slice(0, 8)}</span></div>
                <div className={s.controls}>{can("status") && <label>حالة التذكرة<select disabled={busy} value={ticket.status} onChange={e => void mutate("status", { id: ticket.id, status: e.target.value, updatedAt: ticket.updated_at })}>{ticketStatuses.map(state => <option key={state} value={state}>{statusLabels[state]}</option>)}</select></label>}{can("assign") && <label>مسؤول المتابعة<select disabled={busy} value={ticket.assigned_to ?? ""} onChange={e => void mutate("assign", { id: ticket.id, assignee: e.target.value || null, updatedAt: ticket.updated_at })}><option value="">غير مسندة</option>{!data.agents.some(a => a.id === ticket.assigned_to) && ticket.assigned_to && <option value={ticket.assigned_to}>موظف غير متاح</option>}{data.agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>}</div>
                <div className={s.messages}><article className={s.message}><header><b>{ticket.requester_name || "المستخدم"}</b><small>الطلب الأصلي</small></header><p>{ticket.description}</p></article>
                  {historyCursor && <button onClick={() => { setHistoryCursor(""); setLoadingThread(true); }}>العودة لأحدث الرسائل</button>}
                  {thread.messages.length >= 100 && <button onClick={loadOlder} disabled={busy}>عرض رسائل أقدم</button>}
                  {thread.messages.map(message => <article key={message.id} className={s.message} data-staff={message.author_kind === "STAFF"} data-note={message.internal}><header><b>{message.author_name || (message.author_kind === "STAFF" ? "فريق الدعم" : "المستخدم")}</b><small>{message.internal ? "ملاحظة داخلية — لا يراها المستخدم" : message.author_kind === "STAFF" ? "فريق دورني" : "المستخدم"}</small></header><p>{message.body}</p><time>{date(message.created_at)}</time></article>)}
                </div>
                {closed ? <div className={s.closed}><CheckCircle2 />هذه التذكرة مغلقة. {can("status") ? "غيّر حالتها لإعادة فتح المحادثة." : "اطلب من المسؤول إعادة فتحها عند الحاجة."}</div> : (can("reply") || can("notes")) ? <form className={s.composer} onSubmit={async e => { e.preventDefault(); requestId.current ||= crypto.randomUUID(); if (await mutate("reply", { id: ticket.id, body: draft.trim(), internal: isNote, requestId: requestId.current })) { setDraft(""); requestId.current = ""; setHistoryCursor(""); } }}>
                  <div className={s.composerTabs}>{can("reply") && <button disabled={busy} type="button" aria-pressed={!isNote} onClick={() => { setInternal(false); requestId.current = ""; }}>رد للمستخدم</button>}{can("notes") && <button disabled={busy} type="button" aria-pressed={isNote} onClick={() => { setInternal(true); requestId.current = ""; }}><LockKeyhole />ملاحظة داخلية</button>}</div>
                  <label htmlFor="support-reply" className={s.visuallyHidden}>{isNote ? "ملاحظة داخلية" : "رد للمستخدم"}</label><textarea id="support-reply" disabled={busy} value={draft} maxLength={4000} required placeholder={isNote ? "معلومة للفريق فقط…" : "اكتب ردًا واضحًا يساعد المستخدم…"} onChange={e => { setDraft(e.target.value); requestId.current = ""; }} />
                  <footer><small>{isNote && !can("notes") ? "أُلغيت صلاحية الملاحظات الداخلية. لن تُرسل هذه المسودة." : isNote ? "لن تظهر هذه الملاحظة للمستخدم." : "هذا الرد سيظهر للمستخدم في تذكرة الدعم."}</small><button className={s.primary} disabled={busy || !draft.trim() || (isNote && !can("notes"))}><Send />{busy ? "جاري الإرسال…" : "إرسال"}</button></footer>
                </form> : <p className={s.closed}><LockKeyhole />صلاحياتك تسمح بالمشاهدة فقط.</p>}
              </>}
            </>}
          </section>
        </div>
      </>}
    </div>
  </main>;
}
