export async function copyText(text:string){
 if(window.council?.copyText)await window.council.copyText(text)
 else await navigator.clipboard.writeText(text)
}
