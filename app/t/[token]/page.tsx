import { PublicReportClient } from "@/components/public-report-client";
export default async function PublicCodePage({params}:{params:Promise<{token:string}>}){const {token}=await params;return <PublicReportClient token={token}/>;}
