import { createClient } from "supabase";
import webpush from "web-push";

// Dedicated worker: no browser CORS, no user-supplied destinations, custom bearer authentication.
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
async function sameSecret(a: string, b: string) {
  const hash = (s: string) => crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  const [x,y] = await Promise.all([hash(a),hash(b)]);
  const aBytes=new Uint8Array(x),bBytes=new Uint8Array(y);
  let difference=0;
  for(let i=0;i<aBytes.length;i++) difference|=aBytes[i]^bBytes[i];
  return difference===0;
}
function allowedEndpoint(endpoint: string) {
  try {
    const u = new URL(endpoint);
    return u.protocol === "https:" && !u.username && !u.password && !u.port &&
      (u.hostname === "fcm.googleapis.com" || u.hostname === "updates.push.services.mozilla.com" || u.hostname === "web.push.apple.com" || u.hostname.endsWith(".notify.windows.com"));
  } catch { return false; }
}
Deno.serve(async request => {
  if (request.method !== "POST") return new Response("Method not allowed", {status:405});
  const bearer = request.headers.get("authorization") ?? "";
  if (!bearer.startsWith("Bearer ") || bearer.length > 256) return new Response("Forbidden", {status:403});
  try {
    const {data:config,error:configError} = await db.rpc("push_worker_config");
    if (configError || !config) throw new Error("CONFIG");
    if (!await sameSecret(bearer.slice(7),config.worker_token)) return new Response("Forbidden", {status:403});
    const {data:jobs,error} = await db.rpc("claim_push_jobs", {p_limit:20});
    if (error) throw new Error("CLAIM");
    let accepted=0, failed=0;
    // Bounded parallelism; leases are longer than a complete batch's network timeout.
    for (let offset=0; offset<(jobs??[]).length; offset+=5) {
      await Promise.all(jobs.slice(offset,offset+5).map(async (job: {id:string;lease_token:string;endpoint:string;p256dh:string;auth:string;report_id:string|null}) => {
        let status=0;
        try {
          if (!allowedEndpoint(job.endpoint)) status=400;
          else {
            const response=await webpush.sendNotification({endpoint:job.endpoint,keys:{p256dh:job.p256dh,auth:job.auth}},
              JSON.stringify({body:job.report_id?"عندك تنبيه جديد بخصوص سيارتك. افتح دورني للاطلاع عليه.":"هذا إشعار تجريبي من دورني. إشعارات الجهاز تعمل.",tag:job.report_id??job.id}),
              {vapidDetails:{subject:"mailto:nabbeh.ni24@gmail.com",publicKey:config.public_key,privateKey:config.private_key},TTL:300,urgency:"high",timeout:10000});
            status=response.statusCode;
          }
        } catch(e) { status=Number((e as {statusCode?:number}).statusCode)||0; }
        const completed=await db.rpc("finish_push_job",{p_id:job.id,p_lease:job.lease_token,p_status:status});
        if (completed.error) throw new Error("FINISH");
        if(status>=200&&status<300) accepted++; else failed++;
      }));
    }
    return Response.json({processed:jobs?.length??0,accepted,failed});
  } catch {
    // Never log endpoints, keys, provider response bodies or account information.
    console.error("DORNI_PUSH_WORKER_FAILED");
    return Response.json({error:"Worker unavailable"},{status:503});
  }
});
