export const locales = ['ar', 'en', 'ar-LY'] as const;
export type Locale = typeof locales[number];
export const localeNames: Record<Locale,string> = {ar:'العربية',en:'English','ar-LY':'العربية (بالليبي)'};
export function validLocale(value:unknown):value is Locale {return locales.includes(value as Locale);}
export function localeDirection(locale:Locale){return locale==='en'?'ltr':'rtl';}
export function formatLocale(locale:Locale){return locale==='en'?'en-GB':locale==='ar'?'ar':'ar-LY';}
export function chooseText(locale:Locale,arabic:string,english:string,libyan=arabic){return locale==='en'?english:locale==='ar-LY'?libyan:arabic;}
