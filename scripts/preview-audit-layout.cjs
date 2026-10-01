// Layout-only local harness: renders the actual components with synthetic state.
// No credentials, API calls, database access or live customer data.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const root=path.resolve(__dirname,'..');
function compile(file,resolve){const out={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText)(resolve,out,out.exports);return out.exports;}
const lib=compile('lib/admin-audit.ts',require);
const fixture={rows:[{id:'11111111-1111-4111-8111-111111111111',action:'REPORT_RESPONDED',actor_kind:'OWNER',entity_type:'report',entity_id:'22222222-2222-4222-8222-222222222222',created_at:'2026-10-01T14:08:16Z'}],total:1,snapshot:'2026-10-01T14:32:00Z',page:1,size:25,metrics:{total:1,today:1,actors:1,actions:1},options:{actions:['REPORT_RESPONDED'],kinds:['OWNER'],entities:['report']}};
let state=0;
const mockReact={...React,useEffect(){},useState(initial){const index=state++;return [index===2?fixture:index===3?false:typeof initial==='function'?initial():initial,()=>{}];}};
const {AdminAudit}=compile('components/admin-audit.tsx',name=>name==='react'?mockReact:name==='@/lib/admin-audit'?lib:name.endsWith('.css')?{}:require(name));
const {WorkspaceShell}=compile('components/workspace-shell.tsx',name=>name==='next/link'?{__esModule:true,default:({children,...props})=>React.createElement('a',props,children)}:name==='next/navigation'?{usePathname:()=>'/admin/activity',useRouter:()=>({})}:name==='./dorni-brand'?{DorniBrand:()=>React.createElement('a',{href:'#',style:{fontSize:28,color:'#f87845'}},'دورني')}:name==='./theme-toggle'?{ThemeToggle:()=>React.createElement('button',null,'◐')}:name.endsWith('.css')?{}:require(name));
const staticRoot=path.join(root,'.next','static');
function cssFiles(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?cssFiles(path.join(dir,e.name)):e.name.endsWith('.css')?[path.join(dir,e.name)]:[]);}
http.createServer((req,res)=>{
 if(req.url.startsWith('/_next/static/')){const target=path.resolve(staticRoot,'.'+req.url.slice('/_next/static'.length));if(!target.startsWith(staticRoot+path.sep)||!fs.existsSync(target)){res.writeHead(404);res.end();return;}res.end(fs.readFileSync(target));return;}
 state=0;const body=renderToStaticMarkup(React.createElement(WorkspaceShell,null,React.createElement(AdminAudit)));
 const css=cssFiles(staticRoot).map(f=>fs.readFileSync(f,'utf8')).concat(fs.readFileSync(path.join(root,'components/admin-audit.css'),'utf8')).join('\n');
 res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="ar" dir="rtl" class="dark"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Audit layout QA — synthetic data</title><style>'+css+'</style></head><body>'+body+'</body></html>');
}).listen(4188,'127.0.0.1',()=>console.log('Synthetic layout preview: http://127.0.0.1:4188'));
