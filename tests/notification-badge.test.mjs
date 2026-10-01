import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
test('notification badge is a padded transparent silhouette, separate from launcher icon',async()=>{
 const sw=await readFile(new URL('../public/sw.js',import.meta.url),'utf8');
 assert.match(sw,/badge: "\/icons\/notification-badge-v1.png"/);
 assert.match(sw,/icon: "\/icons\/icon-192.png"/);
 const {data,info}=await sharp(new URL('../public/icons/notification-badge-v1.png',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 assert.equal(info.width,96);assert.equal(info.height,96);
 let visible=0;
 for(let y=0;y<96;y++)for(let x=0;x<96;x++){
  const i=(y*96+x)*4;
  if(x<8||y<8||x>=88||y>=88)assert.equal(data[i+3],0);
  if(data[i+3]>0){visible++;assert.equal(data[i],data[i+1]);assert.equal(data[i],data[i+2]);assert.ok(data[i]>=250);}
 }
 assert.ok(visible>500&&visible<96*96*.7);
});
