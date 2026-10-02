import 'server-only';
import {createCipheriv,createDecipheriv,hkdfSync,randomBytes,randomUUID} from 'node:crypto';
import {cookies} from 'next/headers';

export const activationCookie='dorni_activation';
export type ActivationContext={id:string;expires:number;userId?:string;serial?:string;proof?:string;codeId?:string};
function key(){
 const secret=process.env.CLAIM_PEPPER;
 if(!secret)throw new Error('Activation context key unavailable');
 return Buffer.from(hkdfSync('sha256',secret,'dorni','activation-cookie-v1',32));
}
export function sealContext(context:ActivationContext){
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),iv);
 cipher.setAAD(Buffer.from('dorni-activation-v1'));
 return Buffer.concat([iv,cipher.update(JSON.stringify(context),'utf8'),cipher.final(),cipher.getAuthTag()]).toString('base64url');
}
export function openContext(value:string|undefined):ActivationContext|null{
 try{
  if(!value||value.length>3000)return null;
  const b=Buffer.from(value,'base64url'),decipher=createDecipheriv('aes-256-gcm',key(),b.subarray(0,12));
  decipher.setAAD(Buffer.from('dorni-activation-v1'));decipher.setAuthTag(b.subarray(-16));
  const c=JSON.parse(Buffer.concat([decipher.update(b.subarray(12,-16)),decipher.final()]).toString()) as ActivationContext;
  return typeof c.id==='string'&&Number.isFinite(c.expires)&&c.expires>Date.now()&&((typeof c.serial==='string'&&typeof c.proof==='string')||typeof c.codeId==='string')?c:null;
 }catch{return null;}
}
export function newContext(serial:string,proof:string):ActivationContext{return {id:randomUUID(),serial,proof,expires:Date.now()+86400000};}
export async function readActivationContext(){return openContext((await cookies()).get(activationCookie)?.value);}
export async function saveActivationContext(context:ActivationContext){
 (await cookies()).set(activationCookie,sealContext(context),{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:Math.max(0,Math.floor((context.expires-Date.now())/1000))});
}
export async function activationDestination(fallback:string){return (await readActivationContext())?.proof?'/claim':fallback;}
