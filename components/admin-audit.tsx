"use client";
import {useEffect,useRef,useState} from 'react';
import {Activity,CalendarDays,Download,Filter,RefreshCw,Search,ShieldCheck,Users,Layers,ChevronLeft,ChevronRight} from 'lucide-react';
import {auditDefaults,auditFiltersSchema,auditLabel,type AuditData,type AuditFilters,type AuditRow} from '@/lib/admin-audit';
import './admin-audit.css';

const number=(n:number)=>n.toLocaleString('ar-LY');
function timestamp(value:string){return new Date(value).toLocaleString('ar-LY',{timeZone:'Africa/Tripoli',year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'});}
function References({row}:{row:AuditRow}){return <details className="audit-reference"><summary>المراجع</summary><dl><dt>رقم العملية</dt><dd dir="ltr">{row.id}</dd>{row.entity_id&&<><dt>مرجع السجل</dt><dd dir="ltr">{row.entity_id}</dd></>}</dl><code dir="ltr">{row.action}</code></details>;}
export function AdminAudit(){
 const [filters,setFilters]=useState<AuditFilters>(()=>auditDefaults());
 const [draft,setDraft]=useState<AuditFilters>(()=>auditDefaults());
 const [data,setData]=useState<AuditData|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[exporting,setExporting]=useState(false);
 const exportLock=useRef(false);
 useEffect(()=>{
  const controller=new AbortController();let disposed=false;
  const timer=setTimeout(()=>controller.abort(),30000);
  async function load(){
   setLoading(true);setError('');
   try{
    const params=new URLSearchParams();Object.entries(filters).forEach(([k,v])=>{if(v!==undefined)params.set(k,String(v));});
    const response=await fetch('/api/admin/activity?'+params,{cache:'no-store',signal:controller.signal});
    const result=await response.json();if(!response.ok)throw new Error(result.error||'تعذر تحميل السجل.');
    if(!disposed)setData(result);
   }catch(e){if(!disposed)setError(e instanceof Error&&e.name!=='AbortError'?e.message:'الاتصال بطيء. حاول تحديث السجل.');}
   finally{clearTimeout(timer);if(!disposed)setLoading(false);}
  }
  // Synchronize server data with the applied filters; drafts do not trigger requests.
  void load();return()=>{disposed=true;clearTimeout(timer);controller.abort();};
 },[filters]);
 const dirty=['from','to','action','kind','entity','search','size'].some(k=>draft[k as keyof AuditFilters]!==filters[k as keyof AuditFilters]);
 function apply(next:AuditFilters){const parsed=auditFiltersSchema.safeParse({...next,page:1,snapshot:undefined});if(!parsed.success){setNotice('اختر تواريخ صحيحة، من الأقدم للأحدث، ضمن سنة واحدة.');return;}setNotice('');setDraft(parsed.data);setFilters(parsed.data);}
 function preset(days:number){apply({...draft,...auditDefaults(days),action:draft.action,kind:draft.kind,entity:draft.entity,search:draft.search,size:draft.size});}
 async function exportCsv(){
  if(exportLock.current||!data||loading||dirty||error)return;
  exportLock.current=true;setExporting(true);setNotice('');
  try{
   const response=await fetch('/api/admin/activity',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...filters,snapshot:data.snapshot,page:1}),signal:AbortSignal.timeout(60000)});
   if(!response.ok){const failure=await response.json();throw new Error(failure.error||'تعذر التصدير.');}
   const blob=await response.blob(),url=URL.createObjectURL(blob),link=document.createElement('a');
   link.href=url;link.download=`dorni-audit-${filters.from}-${filters.to}.csv`;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
   setNotice(`تم تجهيز ${number(Number(response.headers.get('X-Export-Rows')||0))} عملية للتنزيل. التصدير يطابق الفلاتر المطبقة.`);
  }catch(e){setNotice(e instanceof Error&&e.name!=='TimeoutError'?e.message:'تعذر تأكيد تنزيل الملف. حاول مجدداً.');}
  finally{exportLock.current=false;setExporting(false);}
 }
 const pages=Math.max(1,Math.ceil((data?.total??0)/filters.size));
 const options=data?.options??{actions:[],kinds:[],entities:[]};
 return <main className="audit-page">
  <section className="audit-heading"><div><p className="audit-eyebrow"><ShieldCheck/> سجل إداري للقراءة فقط</p><h2>كل عملية، في مكان واضح</h2><p>ابحث وراجع وصدّر العمليات المسجلة. التواريخ والأوقات بتوقيت ليبيا.</p></div><div className="audit-actions"><button disabled={loading||exporting} onClick={()=>setFilters({...filters,page:1,snapshot:undefined})}><RefreshCw className={loading?'spin':''}/>تحديث السجل</button><button className="audit-primary" disabled={!data?.total||loading||exporting||dirty||Boolean(error)} onClick={()=>void exportCsv()}><Download/>{exporting?'جاري تجهيز الملف…':'تصدير النتائج CSV'}</button></div></section>
  <section className="audit-kpis" aria-label="مؤشرات النتائج المفلترة" aria-busy={loading}>
   {([{key:'total',title:'العمليات المطابقة',Icon:Activity},{key:'today',title:'منها عمليات اليوم',Icon:CalendarDays},{key:'actors',title:'الحسابات المنفّذة',Icon:Users},{key:'actions',title:'أنواع العمليات',Icon:Layers}] as const).map(({key,title,Icon})=><article key={key}><div><span>{title}</span><Icon/></div><strong>{data?number(data.metrics[key]):'—'}</strong><small>ضمن الفلاتر المطبقة</small></article>)}
  </section>
  <form className="audit-filters" onSubmit={e=>{e.preventDefault();apply(draft);}}>
   <div className="audit-filter-title"><h3><Filter/> تصفية السجل</h3><div className="audit-presets">{[[1,'اليوم'],[7,'7 أيام'],[30,'30 يوماً']] .map(([days,label])=><button type="button" key={days} disabled={exporting} onClick={()=>preset(Number(days))}>{label}</button>)}</div></div>
   <fieldset disabled={exporting} className="audit-fields"><legend className="sr-only">فلاتر سجل العمليات</legend>
    <label>من تاريخ<input type="date" required value={draft.from} onChange={e=>setDraft({...draft,from:e.target.value})}/></label>
    <label>إلى تاريخ<input type="date" required value={draft.to} onChange={e=>setDraft({...draft,to:e.target.value})}/></label>
    <label>نوع العملية<select value={draft.action} onChange={e=>setDraft({...draft,action:e.target.value})}><option value="">كل العمليات</option>{options.actions.map(v=><option key={v} value={v}>{auditLabel(v)}</option>)}</select></label>
    <label>نوع الحساب<select value={draft.kind} onChange={e=>setDraft({...draft,kind:e.target.value})}><option value="">كل الحسابات</option>{options.kinds.map(v=><option key={v} value={v}>{auditLabel(v)}</option>)}</select></label>
    <label>نوع السجل<select value={draft.entity} onChange={e=>setDraft({...draft,entity:e.target.value})}><option value="">كل السجلات</option>{options.entities.map(v=><option key={v} value={v}>{auditLabel(v)}</option>)}</select></label>
    <label>بحث بالمرجع<span className="audit-search"><Search/><input type="search" maxLength={80} placeholder="رقم العملية أو مرجع السجل" value={draft.search} onChange={e=>setDraft({...draft,search:e.target.value})}/></span></label>
   </fieldset>
   <div className="audit-filter-footer"><p>حتى سنة لكل بحث · التصدير يشمل كل النتائج، بحد 10,000 عملية.</p><div className="audit-actions"><button type="button" disabled={exporting} onClick={()=>apply(auditDefaults())}>مسح الفلاتر</button><button className="audit-primary" disabled={exporting}>تطبيق الفلاتر</button></div></div>
   {dirty&&<p className="audit-hint">الفلاتر معدّلة ولم تُطبّق بعد. اضغط «تطبيق الفلاتر» لتحديث النتائج والتصدير.</p>}
  </form>
  {notice&&<p className="audit-notice" role="status">{notice}</p>}
  {error&&<div className="audit-error" role="alert"><p>{error}</p><button onClick={()=>setFilters({...filters})}>إعادة المحاولة</button></div>}
  <section className="audit-results" aria-busy={loading}>
   <header className="audit-result-heading"><div><h3>العمليات المسجّلة <span>{data?number(data.total):'—'}</span></h3><p role="status">{loading?'جاري تحميل النتائج…':data?`النتائج حتى ${timestamp(data.snapshot)}`:'لم تُحمّل البيانات بعد.'}</p></div><label>في الصفحة<select value={draft.size} disabled={loading||exporting} onChange={e=>apply({...filters,size:Number(e.target.value)})}>{[25,50,100].map(n=><option key={n} value={n}>{n}</option>)}</select></label></header>
   {data&&data.rows.length>0?<>
    <div className="audit-table-wrap"><table><caption className="sr-only">سجل العمليات المطابق للفلاتر</caption><thead><tr><th>العملية</th><th>نوع الحساب</th><th>نوع السجل</th><th>التاريخ والوقت</th><th>المراجع</th></tr></thead><tbody>{data.rows.map(row=><tr key={row.id}><td><strong>{auditLabel(row.action)}</strong></td><td><span className="audit-pill">{auditLabel(row.actor_kind)}</span></td><td>{auditLabel(row.entity_type)}</td><td><time dateTime={row.created_at}>{timestamp(row.created_at)}</time></td><td><References row={row}/></td></tr>)}</tbody></table></div>
    <div className="audit-mobile-list">{data.rows.map(row=><article key={row.id}><header><strong>{auditLabel(row.action)}</strong><span className="audit-pill">{auditLabel(row.actor_kind)}</span></header><p>{auditLabel(row.entity_type)}</p><time dateTime={row.created_at}>{timestamp(row.created_at)}</time><References row={row}/></article>)}</div>
   </>:<div className="audit-empty"><Search/><h4>{loading?'جاري تحميل سجل العمليات…':error?'السجل غير متاح مؤقتاً':'لا توجد عمليات مطابقة'}</h4><p>{!loading&&!error?'جرّب فترة أخرى أو امسح بعض الفلاتر.':'ستظهر العمليات هنا عند اكتمال التحميل.'}</p></div>}
   <footer className="audit-pagination"><p>{data?.total?`${number((filters.page-1)*filters.size+1)}–${number(Math.min(filters.page*filters.size,data.total))} من ${number(data.total)}`:'0 نتائج'}</p><div><button aria-label="الصفحة السابقة" disabled={loading||exporting||Boolean(error)||filters.page<=1} onClick={()=>setFilters({...filters,page:filters.page-1,snapshot:data?.snapshot})}><ChevronRight/>السابق</button><span>صفحة {number(filters.page)} من {number(pages)}</span><button aria-label="الصفحة التالية" disabled={loading||exporting||Boolean(error)||filters.page>=pages} onClick={()=>setFilters({...filters,page:filters.page+1,snapshot:data?.snapshot})}>التالي<ChevronLeft/></button></div></footer>
  </section>
  <p className="audit-footnote"><ShieldCheck/> البيانات للقراءة فقط. عمليات التصدير تُسجّل، ولا تتضمن كلمات مرور أو روابط تفعيل أو محتوى رسائل الدعم.</p>
 </main>;
}
