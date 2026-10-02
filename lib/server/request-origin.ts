import {validPushOrigin} from './push-origin';

// Authentication/authorization still belongs in every handler and the database.
// This is only the browser CSRF boundary, including simple text/plain requests.
export function allowedMutationOrigin(request:Request,publicUrl:string|undefined){
 if(['GET','HEAD','OPTIONS'].includes(request.method))return true;
 if(request.headers.get('sec-fetch-site')==='cross-site')return false;
 return validPushOrigin(request,publicUrl);
}
