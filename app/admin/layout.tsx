import Link from "next/link";
import {Landmark} from "lucide-react";

export default function AdminLayout({children}:{children:React.ReactNode}){
  return <>{children}<Link className="institutional-shortcut" href="/admin/institutions"><Landmark/> المؤسسات الموثقة</Link></>;
}
