<script lang="ts">
import {defineComponent,h,computed,type VNode} from 'vue'
import MarkdownIt from 'markdown-it'
import CodeBlock from './CodeBlock.vue'
const markdown=new MarkdownIt({html:false,breaks:true,linkify:false,typographer:false}).disable('lheading')
// Render tokens as Vue nodes, never HTML. Images and links remain inert text:
// provider output cannot load remote resources or navigate the desktop window.
function render(tokens:ReturnType<typeof markdown.parse>):VNode[]{
 const root:VNode[]=[];const stack:{tag:string;attrs:Record<string,string>;children:VNode[]}[]=[]
 const append=(node:VNode)=>(stack.at(-1)?.children || root).push(node)
 for(const token of tokens){
  if(token.type==='inline'){for(const node of render(token.children || []))append(node)}
  else if(token.type==='fence'||token.type==='code_block')append(h(CodeBlock,{code:token.content,language:token.info.trim().split(/\s/)[0]}))
  else if(token.type==='text')append(h('span',token.content))
  else if(token.type==='code_inline')append(h('code',token.content))
  else if(token.type==='softbreak'||token.type==='hardbreak')append(h('br'))
  else if(token.type==='image')append(h('span',{class:'markdown-image-label'},`[图片：${token.content || '请在原网页查看'}]`))
  else if(token.nesting===1){const tag=token.type==='link_open'?'span':token.tag;const attrs:Record<string,string>={};if(token.type==='link_open'){attrs.class=/^\[?\d{1,3}\]?$/.test(tokens[tokens.indexOf(token)+1]?.content || '')?'markdown-citation':'markdown-link';attrs.title=String(token.attrGet('href') || '')}if(token.type==='ordered_list_open'&&token.attrGet('start'))attrs.start=String(token.attrGet('start'));stack.push({tag,attrs,children:[]})}
  else if(token.nesting===-1){const node=stack.pop();if(node)append(h(node.tag,node.attrs,node.children))}
  else if(token.type==='hr')append(h('hr'))
 }
 while(stack.length){const node=stack.pop()!;append(h(node.tag,node.attrs,node.children))}
 return root
}
export default defineComponent({props:{text:{type:String,required:true}},setup(props){const nodes=computed(()=>render(markdown.parse(props.text,{})));return()=>h('div',{class:'safe-markdown'},nodes.value)}})
</script>
