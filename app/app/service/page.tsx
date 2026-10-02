import {redirect} from 'next/navigation';
import Link from 'next/link';
import {requireUser,UnauthorizedError} from '@/lib/server/http';
import {ServiceDetail} from '@/components/service-detail';
export default async function ServicePage({searchParams}:{searchParams:Promise<{code?:string}>}){
 const {code}=await searchParams;
 let result;
 try{const {supabase}=await requireUser();result=await supabase.rpc('owner_services',{p_action:'detail',p_data:{codeId:code}});
 }catch(e){if(e instanceof UnauthorizedError)redirect('/login');throw e;}
 const {data,error}=result;
 return <main className="activation-shell" dir="rtl"><header className="activation-header"><Link href="/app?tab=vehicles">رجوع إلى مركباتي</Link></header><div className="activation-body"><h1>خدمة مركبتك</h1>{error?<p role="alert">تعذر عرض الخدمة. ارجع إلى مركباتي واختر بطاقتك.</p>:<ServiceDetail initial={data}/>}</div></main>;
}
