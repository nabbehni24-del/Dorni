"use client";

import { useState, useSyncExternalStore } from 'react';
import { useTheme } from 'next-themes';
import { Bell, Car, ChevronLeft, Globe, Languages, Mail, Moon, Paintbrush, ShieldCheck, Sun, Trash2, UserRound } from 'lucide-react';
import { useLocale } from '@/components/locale-provider';
import { locales, localeNames, type Locale } from '@/lib/locale';
import './settings-home.css';
import {SettingsHeader} from './settings-header';

type Mode = 'system' | 'light' | 'dark';
const subscribeToHydration = () => () => {};
export function SettingsHome({ onOpen, onBack }: { onOpen: (group: string) => void; onBack:()=>void }) {
  const { locale, setLocale, storageAvailable, text } = useLocale();
  const { theme, resolvedTheme, setTheme } = useTheme();
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const [page, setPage] = useState<'home' | 'appearance' | 'language'>('home');
  const [themeStorageError, setThemeStorageError] = useState(false);
  const mode = hydrated && (theme === 'light' || theme === 'dark') ? theme : 'system';
  const language = locale;
  const dark = hydrated && resolvedTheme === 'dark';
  const modeName = (value: string) => value === 'dark' ? text('داكن', 'Dark') : value === 'light' ? text('فاتح', 'Light') : text('حسب الجهاز', 'System');
  function changeMode(value: Mode) {
    setTheme(value);
    try { localStorage.setItem('theme', value); setThemeStorageError(false); }
    catch { setThemeStorageError(true); }
  }
  function changeLanguage(value: Locale) { setLocale(value); }
  const rows = [
    { heading: text('حسابك', 'Your account'), items: [
      { id: 'account', icon: UserRound, title: text('الحساب', 'Account'), subtitle: text('الاسم وبيانات تسجيل الدخول', 'Name and sign-in details') },
      { id: 'vehicles', icon: Car, title: text('السيارات والبطاقات', 'Vehicles & cards'), subtitle: text('إدارة سياراتك وبطاقات دورني', 'Manage your vehicles and Dorni cards') },
      { id: 'contact', icon: Mail, title: text('وسائل التواصل', 'Contact details'), subtitle: text('البريد وطرق التواصل المتاحة', 'Email and available contact methods') },
    ] },
    { heading: text('التنبيهات', 'Alerts'), items: [
      { id: 'notifications', icon: Bell, title: text('الإشعارات', 'Notifications'), subtitle: text('إشعارات هذا الجهاز واختبار وصولها', 'Device notifications and delivery test') },
    ] },
    { heading: text('الخصوصية والأمان', 'Privacy & security'), items: [
      { id: 'privacy', icon: Globe, title: text('الخصوصية', 'Privacy'), subtitle: text('بياناتك وشروط استخدام دورني', 'Your data and Dorni terms') },
      { id: 'security', icon: ShieldCheck, title: text('الأمان والجلسات', 'Security & sessions'), subtitle: text('مراجعة الأجهزة المتصلة بحسابك', 'Review devices signed into your account') },
      { id: 'deletion', icon: Trash2, title: text('طلب حذف الحساب', 'Request account deletion'), subtitle: text('طلب مراجعة من فريق الدعم', 'Request a review by support') },
    ] },
  ];
  return <section className="dorni-settings">
    <SettingsHeader title={page === 'home' ? text('الإعدادات', 'Settings') : page === 'appearance' ? text('المظهر', 'Appearance') : text('اللغة', 'Language')} onBack={()=>{if(page!=='home'){setPage('home');return;}onBack();}}/>
    <p className="ds-intro">{page === 'home' ? text('خصّص تجربتك وأدر حسابك.', 'Personalize your experience and manage your account.') : page === 'appearance' ? text('اختر المظهر المناسب لك. يتغيّر التطبيق فوراً.', 'Choose your appearance. The app updates instantly.') : text('اختر لغتك. تتغيّر القوائم فوراً.', 'Choose your language. Menus update instantly.')}</p>
    {(themeStorageError || !storageAvailable) && <p className="ds-status" role="alert">{text('تم تطبيق اختيارك، لكن تعذّر حفظه على هذا الجهاز للمرة القادمة.', 'Your choice is applied, but could not be saved on this device for next time.')}</p>}
    {page === 'home' && <>
      <button className="ds-mode" role="switch" aria-checked={dark} aria-label={text('الوضع الداكن', 'Dark mode')} onClick={() => { changeMode(dark ? 'light' : 'dark'); }}>
        <span className="ds-icon">{dark ? <Moon /> : <Sun />}</span><span className="ds-label"><strong>{dark ? text('الوضع الداكن', 'Dark mode') : text('الوضع الفاتح', 'Light mode')}</strong><small>{text('اضغط للتبديل فوراً', 'Tap to switch instantly')}</small></span><span className="ds-switch" aria-hidden="true"><span>{dark ? <Moon /> : <Sun />}</span></span>
      </button>
      <section className="ds-group"><h3>{text('التخصيص', 'Personalization')}</h3><div className="ds-card">
        <button className="ds-row" onClick={() => setPage('appearance')}><span className="ds-icon"><Paintbrush /></span><span className="ds-label"><strong>{text('المظهر', 'Appearance')}</strong><small>{text('هوية دورني', 'Dorni identity')} · {modeName(mode)}</small></span><ChevronLeft className="ds-chevron" /></button>
        <button className="ds-row" onClick={() => setPage('language')}><span className="ds-icon"><Languages /></span><span className="ds-label"><strong>{text('اللغة', 'Language')}</strong><small>{localeNames[language]}</small></span><ChevronLeft className="ds-chevron" /></button>
      </div></section>
      {rows.map(section => <section className="ds-group" key={section.heading}><h3>{section.heading}</h3><div className="ds-card">{section.items.map(item => <button className="ds-row" key={item.id} onClick={() => onOpen(item.id)}><span className="ds-icon"><item.icon /></span><span className="ds-label"><strong>{item.title}</strong><small>{item.subtitle}</small></span><ChevronLeft className="ds-chevron" /></button>)}</div></section>)}
    </>}
    {page === 'appearance' && <><div className="ds-preview" data-mode={dark ? 'dark' : 'light'}><span className="ds-icon">{dark ? <Moon /> : <Sun />}</span><h3>{text('تنبيه جديد عن سيارتك', 'New alert about your vehicle')}</h3><p>{text('هذا هو المظهر الحالي للتطبيق', 'Your current app appearance')}</p></div><fieldset className="ds-options"><legend>{text('اختر المظهر', 'Choose appearance')}</legend>{(['system', 'light', 'dark'] as const).map(value => <label key={value}><span>{modeName(value)}</span><input type="radio" name="settings-mode" checked={mode === value} onChange={() => changeMode(value)} /></label>)}</fieldset></>}
    {page === 'language' && <><div className="ds-preview"><h3 lang={language}>{language === 'en' ? 'Hello' : language === 'ar-LY' ? 'أهلاً بيك' : 'مرحباً'}</h3><p>{text('لغة القوائم والنصوص داخل دورني', 'Language for menus and text in Dorni')}</p></div><fieldset className="ds-options"><legend>{text('اللغات المتاحة', 'Available languages')}</legend>{locales.map(value => <label key={value}><span lang={value}>{localeNames[value]}</span><input type="radio" name="settings-language" checked={language === value} onChange={() => changeLanguage(value)} /></label>)}</fieldset></>}
    <p className="ds-device-note">{text('تفضيلاتك تُطبّق فوراً وتُحفظ تلقائياً على هذا الجهاز.', 'Preferences apply instantly and save automatically on this device.')}</p>
  </section>;
}
