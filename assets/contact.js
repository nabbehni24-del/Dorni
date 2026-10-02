/* This prepares a draft; it does not send email or assert receipt. */
(function(){
 const form=document.querySelector('#company-draft-form');
 const result=document.querySelector('#company-draft-result');
 const link=document.querySelector('#company-mail-link');
 form.querySelector('[type="submit"]').disabled=false;
 // Without JS the form cannot submit customer values in a URL.
 form.addEventListener('submit',event=>{
  event.preventDefault();if(!form.reportValidity())return;
  const company=form.elements.company.value.trim();
  if(!company){form.elements.company.setCustomValidity('اكتب اسم الشركة.');form.elements.company.reportValidity();return;}
  const body=['مرحباً، أرغب في مناقشة دورني للأعمال.',`اسم الشركة: ${company}`,`عدد البطاقات المتوقع: ${form.elements.quantity.value}`,`الاستخدام: ${form.elements.purpose.value}`,'أرجو توضيح الخيارات وطريقة البدء.'].join('\n');
  link.href=`mailto:dorni.2026@gmail.com?subject=${encodeURIComponent('استفسار دورني للأعمال')}&body=${encodeURIComponent(body)}`;
  result.hidden=false;link.focus();window.DorniAnalytics?.track('company_draft_prepared');
 });
 form.addEventListener('input',()=>{form.elements.company.setCustomValidity('');result.hidden=true;link.href='mailto:dorni.2026@gmail.com';});
 form.addEventListener('change',()=>{result.hidden=true;link.href='mailto:dorni.2026@gmail.com';});
})();
