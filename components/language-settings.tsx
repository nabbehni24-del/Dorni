"use client";
import { Check, ChevronDown, Languages } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocale } from "@/components/locale-provider";
import { localeNames, locales, validLocale } from "@/lib/locale";

const localeHints = {
  ar: "العربية الفصحى",
  en: "English",
  "ar-LY": "عربي ليبي",
} as const;

export function LoginLanguageSwitcher() {
  const { locale, setLocale, text } = useLocale();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  return (
    <div className="login-language" ref={root}>
      <button
        className="login-language-trigger"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="login-language-icon">
          <Languages />
        </span>
        <span>
          <small>{text("اللغة", "Language", "اللغة")}</small>
          <b>{localeHints[locale]}</b>
        </span>
        <ChevronDown className={open ? "is-open" : ""} />
      </button>
      {open && (
        <div
          className="login-language-menu"
          role="listbox"
          aria-label={text("لغة الواجهة", "Interface language", "لغة التطبيق")}
        >
          <div className="login-language-heading">
            <Languages />
            <span>
              <b>
                {text(
                  "اختر لغة الواجهة",
                  "Choose your language",
                  "اختار لغة التطبيق",
                )}
              </b>
              <small>
                {text(
                  "يمكنك تغييرها لاحقاً",
                  "You can change it later",
                  "تقدر تغيرها بعدين",
                )}
              </small>
            </span>
          </div>
          {locales.map((value) => (
            <button
              key={value}
              type="button"
              role="option"
              aria-selected={locale === value}
              className={locale === value ? "active" : ""}
              lang={value}
              dir={value === "en" ? "ltr" : "rtl"}
              onClick={() => {
                setLocale(value);
                setOpen(false);
              }}
            >
              <span className="language-code">
                {value === "en" ? "EN" : value === "ar" ? "ع" : "لي"}
              </span>
              <span>
                <b>{localeNames[value]}</b>
                <small>
                  {value === "en"
                    ? "English interface"
                    : value === "ar"
                      ? "لغة عربية رسمية"
                      : "باللهجة الليبية"}
                </small>
              </span>
              <span className="language-check">
                {locale === value && <Check />}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function LanguageSettings() {
  const { locale, setLocale, t, storageAvailable } = useLocale();
  return (
    <fieldset className="language-settings">
      <legend>{t("اختر لغة الواجهة")}</legend>
      {locales.map((value) => (
        <label key={value} lang={value} dir={value === "en" ? "ltr" : "rtl"}>
          <input
            type="radio"
            name="interface-language"
            value={value}
            checked={locale === value}
            onChange={(e) => {
              if (validLocale(e.target.value)) setLocale(e.target.value);
            }}
          />
          {localeNames[value]}
        </label>
      ))}
      <p role="status">
        {t(
          storageAvailable
            ? "يُحفظ الاختيار على هذا الجهاز."
            : "تعذر حفظ اللغة على هذا الجهاز.",
        )}
      </p>
    </fieldset>
  );
}

