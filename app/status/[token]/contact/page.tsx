import { StatusClient } from "@/components/status-client";
export default async function Contact({params}:{params:Promise<{token:string}>}) {
  const {token}=await params;
  return <StatusClient token={token} contactMode/>;
}
