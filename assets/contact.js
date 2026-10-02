/* This prepares a draft; it does not send email or assert receipt. */
(function(){
 const form=document.querySelector('#company-draft-form');
 const result=document.querySelector('#company-draft-result');
 const link=document.querySelector('#company-mail-link');
 const t=(key)=>window.DorniI18n?.t(key)||key;
 form.querySelector('[type="submit"]').disabled=false;
 // Without JS the form cannot submit customer values in a URL.
 form.addEventListener('submit',event=>{
  event.preventDefault();if(!form.reportValidity())return;
  const company=form.elements.company.value.trim();
  if(!company){form.elements.company.setCustomValidity(t('اكتب اسم الشركة.'));form.elements.company.reportValidity();return;}
  const body=[t('مرحباً، أرغب في مناقشة دورني للأعمال.'),`${t('اسم الشركة')}: ${company}`,`${t('عدد البطاقات المتوقع')}: ${t(form.elements.quantity.value)}`,`${t('الاستخدام')}: ${t(form.elements.purpose.value)}`,t('أرجو توضيح الخيارات وطريقة البدء.')].join('\n');
  link.href=`mailto:dorni.2026@gmail.com?subject=${encodeURIComponent(t('استفسار دورني للأعمال'))}&body=${encodeURIComponent(body)}`;
  result.hidden=false;link.focus();window.DorniAnalytics?.track('company_draft_prepared');
 });
 form.addEventListener('input',()=>{form.elements.company.setCustomValidity('');result.hidden=true;link.href='mailto:dorni.2026@gmail.com';});
 form.addEventListener('change',()=>{result.hidden=true;link.href='mailto:dorni.2026@gmail.com';});
 window.addEventListener?.('dorni:languagechange',()=>{form.elements.company.setCustomValidity('');result.hidden=true;link.href='mailto:dorni.2026@gmail.com';});
})();
