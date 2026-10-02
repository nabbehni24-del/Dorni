// Run with the project's existing sharp installation: node scripts/optimize-assets.cjs <sharp-module-path>
const sharp=require(process.argv[2]||'sharp');
const path=require('node:path');const fs=require('node:fs');
const assets=path.join(__dirname,'..','assets');
(async()=>{
 for(const [name,width] of [['libya-street',1200],['person-scanner',640],['person-notified',640]]){
  const source=path.join(assets,name+'.png');const out=path.join(assets,name+'.webp');
  await sharp(source).resize({width,withoutEnlargement:true}).webp({quality:84,effort:5}).toFile(out);
  console.log(name,JSON.stringify({before:fs.statSync(source).size,after:fs.statSync(out).size,dimensions:await sharp(out).metadata().then(m=>[m.width,m.height])}));
 }
 // Share image uses the existing logo and illustrations, never a product mockup.
 const backdrop=Buffer.from('<svg width="1200" height="630"><rect width="1200" height="630" fill="#fff8ed"/><circle cx="320" cy="270" r="215" fill="#ff5a22"/><rect y="600" width="1200" height="30" fill="#071c31"/></svg>');
 const street=await sharp(path.join(assets,'libya-street.webp')).resize(660,340,{fit:'cover'}).toBuffer();
 const person=await sharp(path.join(assets,'person-scanner.webp')).resize({height:530}).toBuffer();
 const logo=await sharp(path.join(assets,'dorni-wordmark-optimized.png')).resize({width:420}).toBuffer();
 await sharp(backdrop).composite([{input:street,left:0,top:260},{input:person,left:145,top:70},{input:logo,left:730,top:215}]).jpeg({quality:88}).toFile(path.join(assets,'dorni-share.jpg'));
})();
