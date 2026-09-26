import {redirect} from "next/navigation";

export default function LegacyInstitutionalPage(){
  redirect("/partner?section=operations");
}
