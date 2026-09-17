import "server-only";
import { claimDigest,randomToken } from "./security";

export type GeneratedCode={serialNumber:string;publicToken:string;claimCode:string;credentialHash:string};
export async function generateCodes(quantity:number):Promise<GeneratedCode[]>{
  const prefix=`DRN-LY-${new Date().getUTCFullYear().toString().slice(-2)}`;
  const rows:GeneratedCode[]=[];const seen=new Set<string>();
  for(let i=0;i<quantity;i++){
    let serialNumber:string;do{serialNumber=`${prefix}-${randomToken(7).replace(/[-_]/g,"").slice(0,10).toUpperCase()}`;}while(seen.has(serialNumber));seen.add(serialNumber);
    const claimCode=randomToken(12).replace(/[-_]/g,"").slice(0,16).toUpperCase();
    rows.push({serialNumber,publicToken:randomToken(24),claimCode,credentialHash:await claimDigest(serialNumber,claimCode)});
  }
  return rows;
}
export function productionCsv(batchCode:string,rows:GeneratedCode[],origin:string){const quote=(v:string)=>`"${v.replaceAll('"','""')}"`;return ["batch_code,print_index,serial_number,public_qr_payload,claim_code,claim_qr_payload",...rows.map((r,i)=>[batchCode,String(i+1),r.serialNumber,`${origin}/t/${r.publicToken}`,r.claimCode,`${origin}/claim?serial=${encodeURIComponent(r.serialNumber)}&code=${encodeURIComponent(r.claimCode)}`].map(quote).join(","))].join("\r\n");}
