/* Educational walkthrough: no real reports or tickets are submitted. */
const t=(key,params)=>window.DorniI18n?.t(key,params)||key;
const setCopy=(node,key,params)=>{if(window.DorniI18n)window.DorniI18n.set(node,key,params);else node.textContent=key;};
const header=document.querySelector('.site-header');
const menuToggle=document.querySelector('.menu-button');
const menu=document.querySelector('.mobile-nav');
function closeMenu(restore=false){header.classList.remove('open');menuToggle.setAttribute('aria-expanded','false');menuToggle.setAttribute('aria-label',t('فتح القائمة'));if(restore)menuToggle.focus();}
menuToggle.addEventListener('click',()=>{const open=header.classList.toggle('open');menuToggle.setAttribute('aria-expanded',String(open));menuToggle.setAttribute('aria-label',t(open?'إغلاق القائمة':'فتح القائمة'));});
menu.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>closeMenu()));
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&header.classList.contains('open'))closeMenu(true);});
document.addEventListener('click',e=>{if(!e.target.closest('.site-header'))closeMenu();});
matchMedia('(min-width:981px)').addEventListener('change',e=>{if(e.matches)closeMenu();});
if('IntersectionObserver' in window&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
 document.body.classList.add('motion-ready');
 const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('visible');observer.unobserve(entry.target);}}),{threshold:.08});
 document.querySelectorAll('.reveal').forEach(element=>observer.observe(element));
}
const tabs=[...document.querySelectorAll('[data-step]')];
// Preserve direct links to the previously expanded walkthrough.
function openWalkthroughHash(){if(location.hash==='#walkthrough'||/^#(?:panel|step)-[0-3]$/.test(location.hash)){document.querySelector('.demo-explorer').open=true;}}
openWalkthroughHash();window.addEventListener('hashchange',openWalkthroughHash);
const panels=[...document.querySelectorAll('.demo-panel')];
const previous=document.querySelector('#demo-prev');
const counter=document.querySelector('#demo-counter');
let current=0;
function selectStep(index,focus=false) {
  current=Math.max(0,Math.min(3,index));
  tabs.forEach((tab,i)=>{tab.setAttribute('aria-selected',String(i===current));tab.tabIndex=i===current?0:-1;tab.classList.toggle('completed',i<current);panels[i].hidden=i!==current;});
  previous.disabled=current===0;setCopy(counter,'الخطوة {step} من 4',{step:current+1});
  if(focus)tabs[current].focus();
}
tabs.forEach((tab,i)=>{
  tab.addEventListener('click',()=>selectStep(i));
  tab.addEventListener('keydown',e=>{
    const rtl=document.documentElement.dir==='rtl';
    const next=e.key==='ArrowLeft'?(i+(rtl?1:3))%4:e.key==='ArrowRight'?(i+(rtl?3:1))%4:e.key==='Home'?0:e.key==='End'?3:null;
    if(next!==null){e.preventDefault();selectStep(next,true);}
  });
});
document.querySelectorAll('[data-go]').forEach(button=>button.addEventListener('click',()=>selectStep(Number(button.dataset.go),true)));
previous.addEventListener('click',()=>selectStep(current-1,true));
const response=document.querySelector('#response-state span');
const responseMessage=document.querySelector('#response-message');
const supportResult=document.querySelector('#support-result');
const escalate=document.querySelector('#demo-escalate');
function resetResponse(){setCopy(response,'بانتظار ردّ صاحب السيارة');setCopy(responseMessage,'');document.querySelectorAll('[data-response]').forEach(b=>b.setAttribute('aria-pressed','false'));setCopy(panels[2].querySelector('[data-go]').firstChild,'استكشف طلب الدعم ');supportResult.hidden=true;escalate.disabled=false;setCopy(escalate,'جرّب تصعيد الحالة');}
document.querySelector('#demo-send').addEventListener('click',()=>{
  setCopy(document.querySelector('#demo-reason'),document.querySelector('input[name="reason"]:checked').value);
  resetResponse();selectStep(2,true);
});
document.querySelectorAll('[data-response]').forEach(button=>{
  button.setAttribute('aria-pressed','false');
  button.addEventListener('click',()=>{
    const unavailable=button.dataset.response==='unavailable';
    document.querySelectorAll('[data-response]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
    setCopy(response,unavailable?'ردّ المالك: لا أستطيع الوصول':'ردّ المالك: أنا في الطريق');
    setCopy(responseMessage,unavailable?'في التطبيق، يتاح التصعيد للدعم مباشرة بعد هذا الردّ.':'هذا مثال لردّ المالك، وليس تأكيداً أنه وصل إلى السيارة.');
    const next=panels[2].querySelector('[data-go]');setCopy(next.firstChild,unavailable?'التصعيد للدعم متاح الآن ':'استكشف طلب الدعم ');
  });
});
escalate.addEventListener('click',()=>{supportResult.hidden=false;setCopy(escalate,'تم عرض مسار التصعيد ✓');escalate.disabled=true;});
document.querySelector('#demo-reset').addEventListener('click',()=>{
  document.querySelector('input[name="reason"]').checked=true;setCopy(document.querySelector('#demo-reason'),'المركبة تعيق المرور');
  resetResponse();supportResult.hidden=true;escalate.disabled=false;setCopy(escalate,'جرّب تصعيد الحالة');
  setCopy(panels[2].querySelector('[data-go]').firstChild,'استكشف طلب الدعم ');selectStep(0,true);
});
window.addEventListener('dorni:languagechange',()=>{menuToggle.setAttribute('aria-label',t(header.classList.contains('open')?'إغلاق القائمة':'فتح القائمة'));});
