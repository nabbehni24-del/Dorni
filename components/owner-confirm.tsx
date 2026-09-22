"use client";
import {useEffect,useRef} from 'react';
export function OwnerConfirm({text,busy,onConfirm,onCancel}:{text:string;busy:boolean;onConfirm:()=>void;onCancel:()=>void}){
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const el=ref.current;const previous=document.activeElement as HTMLElement|null;el?.showModal();return()=>{el?.close();previous?.focus();};},[]);
 return <dialog ref={ref} className="owner-confirm-dialog" onCancel={e=>{e.preventDefault();onCancel();}} aria-labelledby="owner-confirm-title"><h2 id="owner-confirm-title">تأكيد العملية</h2><p>{text}</p><div><button disabled={busy} onClick={onConfirm}>تأكيد</button><button autoFocus onClick={onCancel}>إلغاء</button></div></dialog>;
}

