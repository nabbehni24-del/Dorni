/* Language preference only: no visitor tracking or external translation service. */
(function(){
 const dictionary=window.DorniTranslations;
 const allowed=['ar','ar-LY','en'];
 let locale='ar-LY';
 try{const saved=localStorage.getItem('dorni.landing.language');if(allowed.includes(saved))locale=saved;}catch{/* Storage can be unavailable in private mode. */}
 const records=new Map();const attributes=[];
 function t(source,params={}){
  let value=locale==='ar-LY'?source:(dictionary[source]?.[locale]||source);
  for(const [key,replacement] of Object.entries(params))value=value.replaceAll('{'+key+'}',String(replacement));
  return value;
 }
 function render(node,record){node.textContent=record.prefix+t(record.key,record.params)+record.suffix;}
 function set(node,source,params={}){
  if(!node)return;
  // Bind text nodes so language switching never recreates interactive controls.
  const text=node.nodeType===3?node:node.firstChild;
  if(!text||text.nodeType!==3){node.textContent='';node.appendChild(document.createTextNode(''));return set(node,source,params);}
  const record={key:source.trim(),prefix:source.match(/^\s*/)[0],suffix:source.match(/\s*$/)[0],params};
  records.set(text,record);render(text,record);
 }
 const walker=document.createTreeWalker(document.documentElement,NodeFilter.SHOW_TEXT);
 while(walker.nextNode()){
  const node=walker.currentNode;
  if(node.parentElement?.closest('script,style,noscript,svg,[data-language-control]'))continue;
  if(dictionary[node.textContent.trim()])set(node,node.textContent);
 }
 document.querySelectorAll('[aria-label],[alt]').forEach(element=>{
  if(element.closest('[data-language-control]'))return;
  for(const name of ['aria-label','alt']){const key=element.getAttribute(name);if(key&&dictionary[key])attributes.push({element,name,key});}
 });
 function localizeMail(){
  const order=document.querySelector('[data-event="card_order_start"]');
  const body=[t('مرحباً، أرغب في الحصول على بطاقة دورني.'),t('عدد البطاقات')+': ',t('أرجو توضيح التفاصيل وطريقة الحصول عليها.')].join('\n');
  order.href='mailto:dorni.2026@gmail.com?subject='+encodeURIComponent(t('طلب بطاقة دورني'))+'&body='+encodeURIComponent(body);
 }
 function apply(next,persist=false){
  if(!allowed.includes(next))return;
  locale=next;document.documentElement.lang=locale;document.documentElement.dir=locale==='en'?'ltr':'rtl';
  records.forEach((record,node)=>render(node,record));
  attributes.forEach(({element,name,key})=>element.setAttribute(name,t(key)));
  document.querySelectorAll('[data-language-select]').forEach(select=>{select.value=locale;select.setAttribute('aria-label',t('اللغة'));});
  document.querySelectorAll('[data-language-flag]').forEach(img=>{img.src='assets/flag-'+({'ar':'sa','ar-LY':'ly','en':'gb'}[locale])+'.svg';});
  localizeMail();
  if(persist){try{localStorage.setItem('dorni.landing.language',locale);}catch{}}
  window.dispatchEvent(new CustomEvent('dorni:languagechange',{detail:{locale}}));
 }
 window.DorniI18n=Object.freeze({t,set,get locale(){return locale;}});
 document.querySelectorAll('[data-language-select]').forEach(select=>select.addEventListener('change',()=>apply(select.value,true)));
 apply(locale);
})();
