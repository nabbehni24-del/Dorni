import Link from "next/link";
import {ShieldCheck} from "lucide-react";

export default function PartnerLayout({children}:{children:React.ReactNode}){
  return <>{children}<Link className="institutional-shortcut" href="/partner/institutional"><ShieldCheck/> مساحة المؤسسة</Link></>;
}
