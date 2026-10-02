export type CodeBalance = {product_type:string;granted:number;issued:number;revoked:number;remaining:number};
export type CodeInventory = {
 organizationId:string;canIssue:boolean;legacyIssued:number;balances:CodeBalance[];
 grants:Array<{id:string;product_type:string;quantity:number;consumed:number;reference:string;granted_at:string;revoked_at:string|null}>;
};
export function standardBalance(inventory:CodeInventory):CodeBalance {
 return inventory.balances.find(x=>x.product_type==='STANDARD_CARD')??{product_type:'STANDARD_CARD',granted:0,issued:0,revoked:0,remaining:0};
}
export function cardStatus(code:{card_state:string;admin_suspended:boolean;owner_paused:boolean;service_state:string}) {
 if(code.card_state==='REVOKED')return 'بطاقة ملغاة';
 if(code.card_state==='REPLACED')return 'بطاقة مستبدلة';
 if(code.admin_suspended)return 'معلّقة إداريًا';
 if(code.owner_paused)return 'موقوفة من المالك';
 return code.service_state==='ENABLED'?'الخدمة فعّالة':'بانتظار التفعيل';
}
