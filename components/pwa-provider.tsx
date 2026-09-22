"use client";
import { createContext, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Check, Download, RefreshCw, Smartphone, WifiOff } from "lucide-react";

interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
const InstallContext = createContext<{ installed: boolean; prompt: InstallEvent | null; clear: () => void }>({ installed: false, prompt: null, clear: () => {} });

export function PwaProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [installed, setInstalled] = useState(false);
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [offline, setOffline] = useState(false);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)");
    const updateInstalled = () => setInstalled(standalone.matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    const updateConnection = () => setOffline(!navigator.onLine);
    const beforeInstall = (event: Event) => { event.preventDefault(); setPrompt(event as InstallEvent); };
    const afterInstall = () => { setInstalled(true); setPrompt(null); };
    updateInstalled(); updateConnection();
    standalone.addEventListener("change", updateInstalled);
    window.addEventListener("beforeinstallprompt", beforeInstall);
    window.addEventListener("appinstalled", afterInstall);
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);
    return () => {
      standalone.removeEventListener("change", updateInstalled);
      window.removeEventListener("beforeinstallprompt", beforeInstall);
      window.removeEventListener("appinstalled", afterInstall);
      window.removeEventListener("online", updateConnection);
      window.removeEventListener("offline", updateConnection);
    };
  }, []);
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    let active = true;
    let registration: ServiceWorkerRegistration | undefined;
    let worker: ServiceWorker | null = null;
    const checkWorker = () => {
      if (active) setWaiting(navigator.serviceWorker.controller ? registration?.waiting ?? null : null);
    };
    const onUpdate = () => { worker = registration?.installing ?? null; worker?.addEventListener("statechange", checkWorker); };
    const checkOnFocus = () => { if (document.visibilityState === "visible") void registration?.update().catch(() => {}); };
    void navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).then(result => {
      if (!active) return;
      registration = result; checkWorker();
      registration.addEventListener("updatefound", onUpdate);
      navigator.serviceWorker.addEventListener("controllerchange", checkWorker);
      document.addEventListener("visibilitychange", checkOnFocus);
    }).catch(() => { /* The online application remains usable if registration fails. */ });
    return () => { active = false; registration?.removeEventListener("updatefound", onUpdate); worker?.removeEventListener("statechange", checkWorker); navigator.serviceWorker.removeEventListener("controllerchange", checkWorker); document.removeEventListener("visibilitychange", checkOnFocus); };
  }, []);
  function applyUpdate() {
    if (!waiting) return;
    navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload(), { once: true });
    waiting.postMessage({ type: "ACTIVATE_UPDATE" });
  }
  const showInstall = !installed && ["/login", "/app", "/partner"].includes(pathname);
  return <InstallContext.Provider value={{ installed, prompt, clear: () => setPrompt(null) }}>
    {offline && <div className="connection-banner" role="status"><WifiOff size={18} /> أنت بدون اتصال. تحتاج الإنترنت لإرسال البلاغات وحفظ التغييرات.</div>}
    {children}
    {showInstall && <Link className="install-shortcut" href="/install"><Smartphone size={18} /> تثبيت دورني</Link>}
    {waiting && <div className="pwa-update" role="status"><span>نسخة جديدة من دورني جاهزة. احفظ تغييراتك ثم حدّث.</span><button onClick={applyUpdate}><RefreshCw size={16} /> تحديث الآن</button></div>}
  </InstallContext.Provider>;
}

export function InstallPanel() {
  const { installed, prompt, clear } = useContext(InstallContext);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function install() {
    if (!prompt) return;
    setBusy(true); setError("");
    try { await prompt.prompt(); await prompt.userChoice; clear(); }
    catch { setError("تعذر فتح نافذة التثبيت. استخدم قائمة المتصفح لإضافة دورني للشاشة الرئيسية."); }
    finally { setBusy(false); }
  }
  return <>
    <span className="install-symbol"><Smartphone /></span><p className="eyebrow">دورني معاك</p>
    <h1>{installed ? "دورني مثبت على جهازك" : "دورني على شاشة تلفونك"}</h1>
    <p>افتح حسابك وسياراتك وتنبيهاتك من أيقونة دورني، بنفس بيانات الدخول.</p>
    {installed ? <p className="success-banner"><Check /> تفتح التطبيق الآن في وضع مستقل.</p> : prompt ? <button className="install-primary" disabled={busy} onClick={install}><Download size={20} /> {busy ? "جاري التثبيت..." : "تثبيت دورني"}</button> : <p className="install-hint">لو خيار التثبيت مش ظاهر، اتبع خطوات جهازك تحت. وقد يكون دورني مثبتاً بالفعل.</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="install-instructions"><section><h2>آيفون</h2><ol><li>افتح دورني في Safari.</li><li>من قائمة المشاركة اختار «إضافة إلى الشاشة الرئيسية».</li><li>أكد الإضافة وافتح دورني من الأيقونة الجديدة.</li></ol></section><section><h2>أندرويد</h2><ol><li>افتح دورني في Chrome.</li><li>اضغط زر التثبيت، أو افتح قائمة المتصفح واختار «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».</li><li>افتح دورني من الشاشة الرئيسية وسجّل دخولك.</li></ol></section></div>
    <div className="install-hint"><h2>التنبيهات حالياً</h2><p>تتحدّث داخل دورني وهو مفتوح. إشعارات شاشة القفل لم تُفعّل بعد؛ التثبيت وحده لا يفعّلها. ستحتاج موافقتك عند إطلاقها.</p></div>
    <Link className="install-primary" href="/app">فتح حسابي</Link><Link href="/login">تسجيل الدخول أو إنشاء حساب</Link>
  </>;
}
