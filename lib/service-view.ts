export type ServiceView={codeId:string;serial:string;vehicle:{id:string;manufacturer:string;model:string;color:string};status:string;plan:string;unit:string|null;duration:number|null;startsAt:string|null;expiresAt:string|null;renewable:boolean;soonDays:number;pending:{id:string;status:string;plan:string}|null};
export const serviceLabels:Record<string,string>={ACTIVE:'فعالة',EXPIRING:'تنتهي قريبًا',EXPIRED:'منتهية',SUSPENDED:'معلقة',PAUSED:'موقوفة مؤقتًا',UNAVAILABLE:'غير متاحة'};
// Display the version's real duration even when a catalog name mentions old terms.
export function serviceDuration(unit:string|null|undefined,value:number|null|undefined){
 if(!value)return '';
 if(unit==='MONTHS')return value===1?'شهر':value===12?'سنة':`${value} أشهر`;
 return unit==='DAYS'?`${value} يومًا`:'';
}
