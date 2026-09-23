"use client";
import {createContext,useCallback,useContext,useEffect,useState,type ReactNode} from 'react';
import {chooseText,formatLocale,localeDirection,validLocale,type Locale} from '@/lib/locale';
import {translateOwner} from '@/lib/owner-messages';
const storageKey='dorni.locale';
const LocaleContext=createContext<{locale:Locale;setLocale:(value:Locale)=>void;storageAvailable:boolean}>({locale:'ar-LY',setLocale:()=>{},storageAvailable:true});
export function LocaleProvider({children,initialLocale='ar-LY'}:{children:ReactNode;initialLocale?:Locale}){
 const [locale,setValue]=useState<Locale>(initialLocale);
 const [storageAvailable,setStorageAvailable]=useState(true);
 useEffect(()=>{
  // Hydrate browser-only preferences after SSR; no account or form state is reset.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  try{const saved=localStorage.getItem(storageKey);if(validLocale(saved))setValue(saved);}catch{setStorageAvailable(false);}
  const sync=(event:StorageEvent)=>{if(event.key===storageKey&&validLocale(event.newValue))setValue(event.newValue);};
  window.addEventListener('storage',sync);return()=>window.removeEventListener('storage',sync);
 },[]);
 useEffect(()=>{document.documentElement.lang=locale;document.documentElement.dir=localeDirection(locale);},[locale]);
 const setLocale=useCallback((value:Locale)=>{
  if(!validLocale(value))return;
  setValue(value);
  try{localStorage.setItem(storageKey,value);setStorageAvailable(true);}catch{setStorageAvailable(false);}
 },[]);
 return <LocaleContext.Provider value={{locale,setLocale,storageAvailable}}>{children}</LocaleContext.Provider>;
}
export function useLocale(){
 const context=useContext(LocaleContext);
 return {...context,dir:localeDirection(context.locale),dateLocale:formatLocale(context.locale),
  t:(source:string,values:Record<string,string|number>={})=>translateOwner(context.locale,source,values),
  text:(arabic:string,english:string,libyan=arabic)=>chooseText(context.locale,arabic,english,libyan)};
}
