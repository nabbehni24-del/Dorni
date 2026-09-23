export const ownerViews=['account','vehicles','alerts','support','settings','guide','privacy'] as const;
export type OwnerView=typeof ownerViews[number];
export function readOwnerView(search:string):OwnerView {
 const value=new URLSearchParams(search).get('tab');
 return ownerViews.find(view=>view===value)??'account';
}
export function ownerViewUrl(href:string,view:OwnerView){
 const url=new URL(href);url.searchParams.set('tab',view);
 return `${url.pathname}${url.search}${url.hash}`;
}
