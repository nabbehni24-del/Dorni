/* Provider-neutral, memory-only events. No cookies, identifiers, network or form values. */
(function(root){
 'use strict';
 const schema={
  get_dorni_click:['location'],activation_click:['location'],how_click:['location'],
  how_view:[],privacy_view:[],business_click:['location'],faq_open:['faq_id'],
  card_order_start:['location'],company_draft_prepared:[],company_email_open:['location'],
  // Reserved for authoritative app / backend success integrations, never fired by landing CTAs.
  activation_start:[],activation_complete:[],company_form_submitted:[],card_order_complete:[]
 };
 const locations=new Set(['header','menu','hero','purchase','business','footer','faq']);
 const faqs=new Set(['phone','sender-app','scan','change-car','lost-card','multiple-cars','activate','notifications','business','no-response','emergency','legal']);
 const queue=[];let adapter=null;
 function track(name,properties={}){
  if(!Object.hasOwn(schema,name))return false;
  const safe={};
  for(const key of schema[name]){
   const value=properties[key];
   if(key==='location'&&locations.has(value))safe[key]=value;
   if(key==='faq_id'&&faqs.has(value))safe[key]=value;
  }
  const event=Object.freeze({name,properties:Object.freeze(safe),version:1});
  queue.push(event);if(queue.length>100)queue.shift();
  root.dispatchEvent(new CustomEvent('dorni:analytics',{detail:event}));
  if(adapter){try{adapter(event);}catch{/* Analytics must never interrupt the visitor. */}}
  return true;
 }
 root.DorniAnalytics=Object.freeze({track,snapshot:()=>queue.slice(),
  // Caller must arrange any required consent before connecting an external provider.
  setAdapter(fn){adapter=typeof fn==='function'?fn:null;},events:Object.freeze(Object.keys(schema))});
 if(!root.document)return;
 root.document.addEventListener('click',event=>{
  const target=event.target.closest?.('[data-event]');if(!target)return;
  track(target.dataset.event,{location:target.dataset.location});
 });
 root.document.querySelectorAll('[data-faq]').forEach(item=>item.addEventListener('toggle',()=>{
  if(item.open)track('faq_open',{faq_id:item.dataset.faq});
 }));
 if('IntersectionObserver' in root){
  const viewed=new Set();
  const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{
   if(entry.isIntersecting&&!viewed.has(entry.target)){
    viewed.add(entry.target);track(entry.target.closest('[data-view-event]').dataset.viewEvent);observer.unobserve(entry.target);
   }
  }),{threshold:0.5});
  root.document.querySelectorAll('[data-view-event]').forEach(section=>observer.observe(section.querySelector('h2')||section));
 }
})(window);
