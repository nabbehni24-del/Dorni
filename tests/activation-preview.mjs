// LOOPBACK-ONLY visual fixture. Actual Next UI, synthetic API responses; no Auth,
// mail, payments, production connection or service credentials. Not app runtime.
import http from 'node:http';
const id='00000000-0000-4000-8000-000000000701';
let mode='new',complete=false,pending=false;
const car={id,manufacturer:'تويوتا',model:'كورولا',color:'أبيض',occupied:false};
const service=()=>({codeId:id,serial:'DRN-DEMO-0001',vehicle:car,status:mode==='expired'?'EXPIRED':'ACTIVE',plan:'تجربة 15 يومًا',unit:'DAYS',duration:15,startsAt:mode==='expired'?'2026-09-02T12:00:00Z':'2026-10-02T12:00:00Z',expiresAt:mode==='expired'?'2026-09-17T12:00:00Z':'2026-10-17T12:00:00Z',renewable:true,soonDays:7,pending:pending?{id,status:'PENDING',plan:'شهر'}:null});
http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1:3211');
 const json=(data,status=200)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));};
 if(url.pathname==='/_fixture'){mode=url.searchParams.get('mode')??'new';complete=false;pending=false;res.writeHead(302,{location:'/claim'});res.end();return;}
 if(url.pathname==='/api/activation'){
  if(req.method==='POST'){let body='';for await(const b of req)body+=b;const p=JSON.parse(body);if(p.action==='capture'){json({ok:true});return;}complete=true;json({state:'ACTIVATED',journeyId:id,service:service()});return;}
  if(complete||mode==='owned'||mode==='expired'){json({state:'OWNED',journeyId:id,service:service()});return;}
  json({state:'READY',journeyId:id,serial:'DRN-DEMO-0001',plan:'تجربة 15 يومًا',unit:'DAYS',duration:15,versionId:id,vehicles:mode==='new'?[]:[car,{...car,id:'00000000-0000-4000-8000-000000000702',manufacturer:'هيونداي',model:'توسان',color:'أسود',occupied:mode==='occupied'}]});return;
 }
 if(url.pathname==='/api/services'){json({data:{plans:[{id,name:'شهر',active:true}],versions:[{id,plan_id:id,version:1,duration_unit:'MONTHS',duration_value:1}],prices:[]}});return;}
 if(url.pathname==='/api/service-requests'){if(req.method==='POST')pending=true;json({data:req.method==='POST'?service():[service()]});return;}
 if(url.pathname.startsWith('/api/')){json({error:'Fixture does not implement this API'},404);return;}
 const forward=http.request({hostname:'127.0.0.1',port:3210,path:req.url,method:req.method,headers:{...req.headers,host:'127.0.0.1:3210'}},upstream=>{res.writeHead(upstream.statusCode??500,upstream.headers);upstream.pipe(res);});
 forward.on('error',()=>{res.writeHead(503);res.end('Start local Next server on 3210');});req.pipe(forward);
}).listen(3211,'127.0.0.1',()=>console.log('Synthetic UI fixture: http://127.0.0.1:3211/_fixture?mode=new'));
