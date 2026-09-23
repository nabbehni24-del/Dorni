"use client";
import {useLocale} from '@/components/locale-provider';
import {localeNames,locales,validLocale} from '@/lib/locale';
export function LanguageSettings(){
 const {locale,setLocale,t,storageAvailable}=useLocale();
 return <fieldset className="language-settings"><legend>{t('اختر لغة الواجهة')}</legend>
 {locales.map(value=><label key={value} lang={value} dir={value==='en'?'ltr':'rtl'}><input type="radio" name="interface-language" value={value} checked={locale===value} onChange={e=>{if(validLocale(e.target.value))setLocale(e.target.value);}}/>{localeNames[value]}</label>)}
 <p role="status">{t(storageAvailable?'يُحفظ الاختيار على هذا الجهاز.':'تعذر حفظ اللغة على هذا الجهاز.')}</p>
 </fieldset>;
}
