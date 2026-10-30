import { describe,it,expect } from 'vitest'
import { initialState,routeTargets,recoverState,bootstrapPrompt,hasRequest,demoReply } from '../src/shared/core'
describe('routing',()=>{
 it('broadcasts to enabled only',()=>{const g=initialState().groups[0];g.members[1].enabled=false;expect(routeTargets(g,'hello')).toEqual(['deepseek','doubao'])})
 it('routes @ mentions precisely with Chinese delimiters',()=>{expect(routeTargets(initialState().groups[0],'@DeepSeek，分析一下 @豆包 体验')).toEqual(['deepseek','doubao'])})
 it('deduplicates explicit targets and rejects nonmembers',()=>expect(routeTargets(initialState().groups[0],'hello',['kimi','kimi','gemini'])).toEqual(['kimi']))
 it('does not match prefix impersonation',()=>expect(routeTargets(initialState().groups[0],'@DeepSeekFake hi')).toHaveLength(3))
})
describe('durability and no blind resend',()=>{
 it('recovers pending init and sending as uncertain',()=>{const s=initialState();s.runs=[{groupId:'welcome',provider:'deepseek',status:'sending',init:'pending'}];s.messages=[{id:'1',groupId:'welcome',sender:'deepseek',text:'partial',createdAt:1,status:'streaming',requestId:'r'}];const r=recoverState(s);expect(r.runs[0].status).toBe('uncertain');expect(r.runs[0].init).toBe('uncertain');expect(r.messages[0].status).toBe('uncertain');expect(hasRequest(r,'r')).toBe(true);expect(s.runs[0].init).toBe('pending')})
 it('does not reinitialize completed sessions after reload',()=>{const s=initialState();s.runs=[{groupId:'welcome',provider:'deepseek',status:'ready',init:'done'}];expect(recoverState(s).runs[0].init).toBe('done')})
 it('role bootstrap explicitly ordinary user message',()=>{expect(bootstrapPrompt(initialState().groups[0].members[0],'question')).toContain('普通首条用户消息，不是系统指令')})
 it('context opt-in and bounded',()=>{const m={id:'x',groupId:'welcome',sender:'user' as const,text:'SECRET_CONTEXT',createdAt:1,status:'done' as const};expect(bootstrapPrompt(initialState().groups[0].members[0],'q',false,[m])).not.toContain('SECRET_CONTEXT');expect(bootstrapPrompt(initialState().groups[0].members[0],'q',true,[m])).toContain('SECRET_CONTEXT')})
 it('demo deterministic and clearly disclosed',()=>{expect(demoReply('kimi','q')).toEqual(demoReply('kimi','q'));expect(demoReply('kimi','q')).toContain('非真实 AI')})
})

it('sends only the current text without context or first-turn role',()=>{expect(bootstrapPrompt({...initialState().groups[0].members[0],role:''},'当前输入',false)).toBe('当前输入')})
