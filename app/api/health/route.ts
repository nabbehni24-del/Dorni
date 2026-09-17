import { json } from "@/lib/server/http";
export function GET(){return json({status:"ok",service:"dorni",time:new Date().toISOString()});}
