"use client";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {Landmark,Headphones} from "lucide-react";

export default function AdminLayout({children}:{children:React.ReactNode}){
  const pathname=usePathname();
  if(pathname==='/admin/support')return <>{children}</>;
  return <>{children}<nav className="institutional-shortcut" aria-label="أقسام الإدارة"><Link href="/admin/support" style={{display:'flex',gap:6,alignItems:'center'}}><Headphones/> فريق الدعم</Link><Link href="/admin/institutions" style={{display:'flex',gap:6,alignItems:'center'}}><Landmark/> المؤسسات الموثقة</Link></nav></>;
}
