/* Educational only: no API calls, real QR tokens, forms or customer records. */
// Keep content visible without JavaScript or when reduced motion is requested.
if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const reveals = new IntersectionObserver(entries => {
    entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('is-visible'); reveals.unobserve(entry.target); } });
  }, {threshold:0.08});
  document.querySelectorAll('.section-head,.feature-card,.showcase-grid,.privacy-story-grid,.setup-grid,.business-box,.faq-grid').forEach(element => {
    element.classList.add('reveal-ready'); reveals.observe(element);
  });
}
const menu = document.querySelector('#mobile-menu');
const menuToggle = document.querySelector('.menu-toggle');
function closeMenu(restore = false) {menu.hidden=true;menuToggle.setAttribute('aria-expanded','false');menuToggle.setAttribute('aria-label','فتح القائمة');if(restore)menuToggle.focus();}
menuToggle.addEventListener('click',()=>{const open=menu.hidden;menu.hidden=!open;menuToggle.setAttribute('aria-expanded',String(open));menuToggle.setAttribute('aria-label',open?'إغلاق القائمة':'فتح القائمة');});
menu.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>closeMenu()));
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!menu.hidden)closeMenu(true);});
document.addEventListener('click',e=>{if(!menu.hidden&&!e.target.closest('.header'))closeMenu();});
matchMedia('(min-width: 901px)').addEventListener('change',e=>{if(e.matches)closeMenu();});

const tabs=[...document.querySelectorAll('[data-step]')];
const panels=[...document.querySelectorAll('.demo-panel')];
const previous=document.querySelector('#demo-prev');
const counter=document.querySelector('#demo-counter');
let current=0;
function selectStep(index,focus=false) {
  current=Math.max(0,Math.min(3,index));
  tabs.forEach((tab,i)=>{tab.setAttribute('aria-selected',String(i===current));tab.tabIndex=i===current?0:-1;tab.classList.toggle('completed',i<current);panels[i].hidden=i!==current;});
  previous.disabled=current===0;counter.textContent=`الخطوة ${current+1} من 4`;
  if(focus)tabs[current].focus();
}
tabs.forEach((tab,i)=>{
  tab.addEventListener('click',()=>selectStep(i));
  tab.addEventListener('keydown',e=>{
    const next=e.key==='ArrowLeft'?(i+1)%4:e.key==='ArrowRight'?(i+3)%4:e.key==='Home'?0:e.key==='End'?3:null;
    if(next!==null){e.preventDefault();selectStep(next,true);}
  });
});
document.querySelectorAll('[data-go]').forEach(button=>button.addEventListener('click',()=>selectStep(Number(button.dataset.go),true)));
previous.addEventListener('click',()=>selectStep(current-1,true));
const response=document.querySelector('#response-state span');
const responseMessage=document.querySelector('#response-message');
const supportResult=document.querySelector('#support-result');
const escalate=document.querySelector('#demo-escalate');
function resetResponse(){response.textContent='بانتظار ردّ صاحب السيارة';responseMessage.textContent='';document.querySelectorAll('[data-response]').forEach(b=>b.setAttribute('aria-pressed','false'));panels[2].querySelector('[data-go]').firstChild.textContent='استكشف طلب الدعم ';supportResult.hidden=true;escalate.disabled=false;escalate.textContent='جرّب تصعيد الحالة';}
document.querySelector('#demo-send').addEventListener('click',()=>{
  document.querySelector('#demo-reason').textContent=document.querySelector('input[name="reason"]:checked').value;
  resetResponse();selectStep(2,true);
});
document.querySelectorAll('[data-response]').forEach(button=>{
  button.setAttribute('aria-pressed','false');
  button.addEventListener('click',()=>{
    const unavailable=button.dataset.response==='unavailable';
    document.querySelectorAll('[data-response]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
    response.textContent=unavailable?'ردّ المالك: لا أستطيع الوصول':'ردّ المالك: أنا في الطريق';
    responseMessage.textContent=unavailable?'في التطبيق، يتاح التصعيد للدعم مباشرة بعد هذا الردّ.':'هذا مثال لردّ المالك، وليس تأكيداً أنه وصل إلى السيارة.';
    const next=panels[2].querySelector('[data-go]');next.firstChild.textContent=unavailable?'التصعيد للدعم متاح الآن ':'استكشف طلب الدعم ';
  });
});
escalate.addEventListener('click',()=>{supportResult.hidden=false;escalate.textContent='تم عرض مسار التصعيد ✓';escalate.disabled=true;});
document.querySelector('#demo-reset').addEventListener('click',()=>{
  document.querySelector('input[name="reason"]').checked=true;document.querySelector('#demo-reason').textContent='المركبة تعيق المرور';
  resetResponse();supportResult.hidden=true;escalate.disabled=false;escalate.textContent='جرّب تصعيد الحالة';
  panels[2].querySelector('[data-go]').firstChild.textContent='استكشف طلب الدعم ';selectStep(0,true);
});
