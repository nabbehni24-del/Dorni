"use client";
import {useLocale} from "@/components/locale-provider";
import {useEffect,useRef} from 'react';
export function OwnerConfirm({text,busy,onConfirm,onCancel}:{text:string;busy:boolean;onConfirm:()=>void;onCancel:()=>void}){
 const {t,dir}=useLocale();
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const el=ref.current;const previous=document.activeElement as HTMLElement|null;el?.showModal();return()=>{el?.close();previous?.focus();};},[]);
 return <dialog dir={dir} ref={ref} className="owner-confirm-dialog" onCancel={e=>{e.preventDefault();onCancel();}} aria-labelledby="owner-confirm-title"><h2 id="owner-confirm-title">{t("تأكيد العملية")}</h2><p>{t(text)}</p><div><button disabled={busy} onClick={onConfirm}>{t("تأكيد")}</button><button autoFocus onClick={onCancel}>{t("إلغاء")}</button></div></dialog>;
}
