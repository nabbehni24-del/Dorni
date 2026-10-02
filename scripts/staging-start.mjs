// Dedicated staging entrypoint. Never reuse for Production.
if(process.env.NEXT_PUBLIC_SUPABASE_URL!=="https://unsfbwpvypoposlkzzjo.supabase.co")throw Error("Staging database isolation check failed");
const app=new URL(process.env.NEXT_PUBLIC_APP_URL??"http://invalid");
if(app.protocol!=="https:"||!app.hostname.startsWith("dorni-staging-"))throw Error("Staging application origin required");
for(const key of ["CLAIM_PEPPER","BATCH_GENERATION_SECRET","ABUSE_HASH_SECRET"]){if((process.env[key]??"").length<32)throw Error(`${key} requires a staging-only secret`);}
if(process.env.SMS_WEBHOOK_URL||process.env.WHATSAPP_WEBHOOK_URL)throw Error("External messaging disabled in Staging");
await import("./server.js");
