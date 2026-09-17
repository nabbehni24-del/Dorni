import { json } from "@/lib/server/http";
import { dispatchQueuedNotifications } from "@/lib/server/notifications";
export async function POST(request:Request){const expected=process.env.CRON_SECRET;const provided=request.headers.get("authorization");if(!expected||provided!==`Bearer ${expected}`)return json({error:"FORBIDDEN"},403);try{return json(await dispatchQueuedNotifications());}catch{return json({error:"Notification dispatch failed"},500);}}
