"use client";
import { OwnerCenter } from '@/components/owner-center';
import { useRouter } from 'next/navigation';
const noop=async()=>{};
export default function StaffSupport(){const router=useRouter();return <main dir="rtl" className="real-owner-page"><section className="owner-real-content"><a href="/app">رجوع للحساب</a><OwnerCenter panel="support" name="" email="" onChanged={noop} onCars={()=>router.push('/app')} staffMode/></section></main>;}

