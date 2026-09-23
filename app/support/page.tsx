"use client";
import {useLocale} from "@/components/locale-provider";
import { OwnerCenter } from '@/components/owner-center';
import { useRouter } from 'next/navigation';
const noop=async()=>{};
export default function StaffSupport(){const {t,dir}=useLocale();const router=useRouter();return <main dir={dir} className="real-owner-page"><section className="owner-real-content"><a href="/app">{t("رجوع للحساب")}</a><OwnerCenter panel="support" name="" email="" onChanged={noop} onCars={()=>router.push('/app')} staffMode/></section></main>;}
