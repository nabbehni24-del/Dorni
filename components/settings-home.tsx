"use client";

import { useEffect, useRef, useState } from 'react';
import { useTheme } from 'next-themes';
import { Bell, Car, ChevronLeft, Globe, Languages, Mail, Moon, Paintbrush, ShieldCheck, Sun, Trash2, UserRound, X } from 'lucide-react';
import { useLocale } from '@/components/locale-provider';
import { locales, localeNames, type Locale } from '@/lib/locale';
import './settings-home.css';

type Mode = 'system' | 'light' | 'dark';
export function SettingsHome({ onOpen }: { onOpen: (group: string) => void }) {
  const { locale, setLocale, text } = useLocale();
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [draftMode, setDraftMode] = useState<Mode | null>(null);
  const [draftLocale, setDraftLocale] = useState<Locale | null>(null);
  const [page, setPage] = useState<'home' | 'appearance' | 'language'>('home');
  const [review, setReview] = useState(false);
  const [status, setStatus] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const mode = draftMode ?? (theme === 'light' || theme === 'dark' ? theme : 'system');
  const language = draftLocale ?? locale;
  const modeChanged = draftMode !== null && mode !== (theme ?? 'system');
  const languageChanged = language !== locale;
  const changes = Number(modeChanged) + Number(languageChanged);
  const dark = mode === 'dark' || (mode === 'system' && resolvedTheme === 'dark');
  const modeName = (value: string) => value === 'dark' ? text('داكن', 'Dark') : value === 'light' ? text('فاتح', 'Light') : text('حسب الجهاز', 'System');

  useEffect(() => {
    if (!review) return;
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current;
    element?.showModal();
    return () => { element?.close(); previous?.focus(); };
  }, [review]);
  useEffect(() => {
    if (!changes) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [changes]);

  function save() {
    // Persist before updating the providers; storage failure leaves the draft intact.
    try {
      const previousMode = localStorage.getItem('theme');
      const previousLocale = localStorage.getItem('dorni.locale');
      try {
        if (modeChanged) localStorage.setItem('theme', mode);
        if (languageChanged) localStorage.setItem('dorni.locale', language);
      } catch (error) {
        if (previousMode === null) localStorage.removeItem('theme'); else localStorage.setItem('theme', previousMode);
        if (previousLocale === null) localStorage.removeItem('dorni.locale'); else localStorage.setItem('dorni.locale', previousLocale);
        throw error;
      }
      if (modeChanged) setTheme(mode);
      if (languageChanged) setLocale(language);
      setDraftMode(null); setDraftLocale(null); setReview(false);
      setStatus(text('تم حفظ تفضيلاتك على هذا الجهاز.', 'Preferences saved on this device.'));
    } catch {
      setStatus(text('تعذر الحفظ على هذا الجهاز. تغييراتك ما زالت موجودة للمراجعة.', 'Could not save on this device. Your changes are still available to review.'));
    }
  }
  function open(group: string) {
    if (changes) { setReview(true); return; }
    onOpen(group);
  }
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
  return <section className="dorni-settings" data-preview={draftMode ? (dark ? 'dark' : 'light') : undefined}>
    <header className="ds-heading">
      {page !== 'home' && <button className="ds-back" onClick={() => setPage('home')} aria-label={text('كل الإعدادات', 'All settings')}><ChevronLeft /></button>}
      <h2>{page === 'home' ? text('الإعدادات', 'Settings') : page === 'appearance' ? text('المظهر', 'Appearance') : text('اللغة', 'Language')}</h2>
      <p>{text('خلّي تجربة دورني تناسبك.', 'Make Dorni feel like yours.')}</p>
    </header>
    {status && <p className="ds-status" role="status">{status}</p>}
    {page === 'home' && <>
      <button className="ds-mode" role="switch" aria-checked={dark} aria-label={text('الوضع الداكن', 'Dark mode')} onClick={() => { setDraftMode(dark ? 'light' : 'dark'); setStatus(''); }}>
        <span className="ds-icon">{dark ? <Moon /> : <Sun />}</span><span className="ds-label"><strong>{dark ? text('الوضع الداكن', 'Dark mode') : text('الوضع الفاتح', 'Light mode')}</strong><small>{text('اضغط لتجربة المظهر الآخر', 'Tap to preview the other theme')}</small></span><span className="ds-switch" aria-hidden="true"><span>{dark ? <Moon /> : <Sun />}</span></span>
      </button>
      <section className="ds-group"><h3>{text('التخصيص', 'Personalization')}</h3><div className="ds-card">
        <button className="ds-row" onClick={() => setPage('appearance')}><span className="ds-icon"><Paintbrush /></span><span className="ds-label"><strong>{text('المظهر', 'Appearance')}</strong><small>{text('هوية دورني', 'Dorni identity')} · {modeName(mode)}</small></span><ChevronLeft className="ds-chevron" /></button>
        <button className="ds-row" onClick={() => setPage('language')}><span className="ds-icon"><Languages /></span><span className="ds-label"><strong>{text('اللغة', 'Language')}</strong><small>{localeNames[language]}</small></span><ChevronLeft className="ds-chevron" /></button>
      </div></section>
      {rows.map(section => <section className="ds-group" key={section.heading}><h3>{section.heading}</h3><div className="ds-card">{section.items.map(item => <button className="ds-row" key={item.id} onClick={() => open(item.id)}><span className="ds-icon"><item.icon /></span><span className="ds-label"><strong>{item.title}</strong><small>{item.subtitle}</small></span><ChevronLeft className="ds-chevron" /></button>)}</div></section>)}
    </>}
    {page === 'appearance' && <><div className="ds-preview"><span className="ds-icon">{dark ? <Moon /> : <Sun />}</span><h3>{text('تنبيه جديد عن سيارتك', 'New alert about your vehicle')}</h3><p>{text('معاينة المظهر قبل الحفظ', 'Preview the appearance before saving')}</p></div><fieldset className="ds-options"><legend>{text('اختر المظهر', 'Choose appearance')}</legend>{(['system', 'light', 'dark'] as const).map(value => <label key={value}><span>{modeName(value)}</span><input type="radio" name="settings-mode" checked={mode === value} onChange={() => setDraftMode(value)} /></label>)}</fieldset></>}
    {page === 'language' && <><div className="ds-preview"><h3 lang={language}>{language === 'en' ? 'Hello' : language === 'ar-LY' ? 'أهلاً بيك' : 'مرحباً'}</h3><p>{text('لغة القوائم والنصوص داخل دورني', 'Language for menus and text in Dorni')}</p></div><fieldset className="ds-options"><legend>{text('اللغات المتاحة', 'Available languages')}</legend>{locales.map(value => <label key={value}><span lang={value}>{localeNames[value]}</span><input type="radio" name="settings-language" checked={language === value} onChange={() => setDraftLocale(value)} /></label>)}</fieldset></>}
    <p className="ds-device-note">{text('المظهر واللغة يُحفظان على هذا الجهاز. إعدادات الحساب والإشعارات لها أزرار حفظها الخاصة.', 'Appearance and language are saved on this device. Account and notification settings have their own save controls.')}</p>
    {changes > 0 && <div className="ds-savebar"><span role="status">{text(`${changes} تغييرات`, `${changes} changes`)}</span><button onClick={() => { setDraftMode(null); setDraftLocale(null); setStatus(''); }}>{text('تراجع', 'Discard')}</button><button className="ds-primary" onClick={() => setReview(true)}>{text('مراجعة', 'Review')}</button></div>}
    {review && <dialog className="ds-dialog" ref={dialog} aria-labelledby="ds-review-title" onCancel={() => setReview(false)}><header><h2 id="ds-review-title">{text('مراجعة التغييرات', 'Review changes')}</h2><button onClick={() => setReview(false)} aria-label={text('إغلاق', 'Close')}><X /></button></header><p>{text('راجع اختياراتك قبل حفظها على هذا الجهاز.', 'Review your choices before saving them on this device.')}</p><dl>{modeChanged && <div><dt>{text('المظهر', 'Appearance')}</dt><dd>{modeName(theme ?? 'system')} ← {modeName(mode)}</dd></div>}{languageChanged && <div><dt>{text('اللغة', 'Language')}</dt><dd>{localeNames[locale]} ← {localeNames[language]}</dd></div>}</dl>{status && <p role="status">{status}</p>}<footer><button onClick={() => { setDraftMode(null); setDraftLocale(null); setReview(false); }}>{text('تجاهل التغييرات', 'Discard changes')}</button><button className="ds-primary" onClick={save}>{text('حفظ التغييرات', 'Save changes')}</button></footer></dialog>}
  </section>;
}
