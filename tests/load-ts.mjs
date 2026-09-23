import ts from 'typescript';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const cache=new Map();
export function moduleUrl(path){
 const absolute=resolve(root,path);
 if(cache.has(absolute))return cache.get(absolute);
 let js=ts.transpileModule(readFileSync(absolute,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 js=js.replace(/from ["']([^"']+)["']/g,(_,name)=>{
  if(name.startsWith('@/')||name.startsWith('.')){
   const stem=name.startsWith('@/')?resolve(root,name.slice(2)):resolve(dirname(absolute),name);
   const file=[stem,stem+'.ts',stem+'.tsx'].find(p=>existsSync(p));
   if(!file)throw Error('Missing test import '+name);
   return 'from '+JSON.stringify(moduleUrl(file));
  }
  return 'from '+JSON.stringify(import.meta.resolve(name));
 });
 const url='data:text/javascript;base64,'+Buffer.from(js).toString('base64');cache.set(absolute,url);return url;
}
