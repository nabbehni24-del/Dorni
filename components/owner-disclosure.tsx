"use client";
import {useState,type ReactNode} from 'react';
import {ChevronDown} from 'lucide-react';

/** Native keyboard-accessible disclosure. Contents remain mounted to retain form drafts. */
export function OwnerDisclosure({title,description,icon,children,initialOpen=false,className=''}:{title:string;description?:string;icon?:ReactNode;children:ReactNode;initialOpen?:boolean;className?:string}){
 const [open,setOpen]=useState(initialOpen);
 return <details className={`owner-disclosure ${className}`} open={open} onToggle={e=>setOpen(e.currentTarget.open)}>
  <summary><span className="owner-disclosure-icon">{icon}</span><span className="owner-disclosure-label"><strong>{title}</strong>{description&&<small>{description}</small>}</span><ChevronDown className="owner-disclosure-chevron" aria-hidden="true"/></summary>
  <div className="owner-disclosure-body">{children}</div>
 </details>;
}
