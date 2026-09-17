import { StatusClient } from "@/components/status-client";
export default async function StatusPage({params}:{params:Promise<{token:string}>}){const {token}=await params;return <StatusClient token={token}/>;}
