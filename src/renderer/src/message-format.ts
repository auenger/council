export function repairLegacyDeepSeek(text:string):string {
 return text.split(/(```[^\n]*\n[\s\S]*?(?:\n```|$))/g).map((part,index)=>index%2?part:part.replace(/(?<=[。！？.!?：:）)])-(?:\n\d{1,3}\n-)*\n\d{1,3}(?=\n\n|$)/g,refs=>[...refs.matchAll(/\d+/g)].map(m=>`[${m[0]}]`).join(''))).join('')
}
