"use client";
import {useEffect, useRef} from 'react';
import {ChevronLeft} from 'lucide-react';
import {useLocale} from '@/components/locale-provider';

export function SettingsHeader({title,onBack}:{title:string;onBack:()=>void}){
 const {text}=useLocale();
 const heading=useRef<HTMLHeadingElement>(null);
 useEffect(()=>{window.scrollTo({top:0,behavior:'instant'});heading.current?.focus({preventScroll:true});},[title]);
 return <header className="settings-navigation"><button type="button" onClick={onBack} aria-label={text('رجوع','Back')}><ChevronLeft aria-hidden="true"/></button><h2 tabIndex={-1} ref={heading}>{title}</h2><span aria-hidden="true"/></header>;
}
