import {z} from 'zod';
import {json,requireUser,UnauthorizedError} from '@/lib/server/http';
import {claimDigest} from '@/lib/server/security';
import {newContext,readActivationContext,saveActivationContext,clearActivationContext,rememberActivationSerial} from '@/lib/server/activation-context';
import {validPushOrigin} from '@/lib/server/push-origin';
const capture=z.object({action:z.literal('capture'),serial:z.string().trim().min(6).max(80),code:z.string().trim().min(8).max(120)}).strict();
const confirm=z.object({action:z.literal('confirm'),journeyId:z.string().uuid(),versionId:z.string().uuid().nullable(),vehicleId:z.string().uuid().optional(),manufacturer:z.string().trim().min(1).max(80).optional(),model:z.string().trim().min(1).max(80).optional(),color:z.string().trim().min(1).max(40).optional()}).strict();
async function journey(confirmData?:z.infer<typeof confirm>){
 const {user,supabase}=await requireUser();const context=await readActivationContext();
 if(!context)return json({state:'MISSING'},410);
 if(context.userId&&context.userId!==user.id)return json({state:'ACCOUNT_CHANGED'},409);
 if(confirmData&&confirmData.journeyId!==context.id)return json({state:'CONTEXT_CHANGED'},409);
 context.userId=user.id;await saveActivationContext(context);
 if(context.codeId){const {data,error}=await supabase.rpc('owner_services',{p_action:'detail',p_data:{codeId:context.codeId}});return error?json({state:'UNAVAILABLE'},409):json({state:'OWNED',service:data,journeyId:context.id});}
 const {data,error}=await supabase.rpc('activation_journey',{p_action:confirmData?'confirm':'preview',p_serial:context.serial,p_proof:context.proof,p_data:confirmData??{}});
 if(error)return json({state:error.code==='42501'?'AUTH_REQUIRED':'RETRY'},error.code==='42501'?401:409);
 if(data.state==='OWNED'||data.state==='ACTIVATED'){
  await saveActivationContext({id:context.id,expires:context.expires,userId:user.id,codeId:data.service.codeId});
  return json({...data,journeyId:context.id});
 }
 const vehicles=await supabase.from('vehicles').select('id,manufacturer,model,color,code_assignments(id,ended_at)').eq('owner_id',user.id).is('archived_at',null).order('created_at');
 if(vehicles.error)return json({state:'RETRY'},503);
 return json({...data,journeyId:context.id,vehicles:vehicles.data.map(v=>({...v,occupied:v.code_assignments.some((a:{ended_at:string|null})=>!a.ended_at),code_assignments:undefined}))});
}
export async function GET(){try{if(!await readActivationContext())await rememberActivationSerial('pending');return await journey();}catch(e){return json({state:e instanceof UnauthorizedError?'AUTH_REQUIRED':'RETRY'},e instanceof UnauthorizedError?401:503);}}
export async function POST(request:Request){try{
 if(!validPushOrigin(request,process.env.NEXT_PUBLIC_APP_URL)||!request.headers.get('origin'))return json({state:'FORBIDDEN'},403);
 const raw=await request.json();
 if(raw.action==='restart'){const p=z.object({action:z.literal('restart'),serial:z.string().trim().min(6).max(80).optional()}).strict().parse(raw);await clearActivationContext();if(p.serial)await rememberActivationSerial(p.serial);return json({ok:true});}
 if(raw.action==='capture'){
  const p=capture.parse(raw);await saveActivationContext(newContext(p.serial.toUpperCase(),await claimDigest(p.serial,p.code)));
  return json({ok:true}); // Never echo the proof, credential or cookie.
 }
 return await journey(confirm.parse(raw));
}catch(e){return json({state:e instanceof UnauthorizedError?'AUTH_REQUIRED':'RETRY'},e instanceof UnauthorizedError?401:400);}}
