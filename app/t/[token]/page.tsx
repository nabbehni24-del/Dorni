import { PublicReportClient } from "@/components/public-report-client";
import {InstitutionalScanPanel} from "@/components/institutional-scan-panel";
export default async function PublicCodePage({params}:{params:Promise<{token:string}>}){const {token}=await params;return <><PublicReportClient token={token}/><InstitutionalScanPanel token={token}/></>;}
