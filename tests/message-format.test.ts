import {describe,it,expect} from 'vitest'
import {repairLegacyDeepSeek} from '../src/renderer/src/message-format'
describe('DeepSeek legacy references',()=>{
 it('joins flattened citations without inventing headings or losing numbers',()=>{expect(repairLegacyDeepSeek('参数：3万亿。-\n1\n-\n2\n\n后文。-\n6\n-\n12')).toBe('参数：3万亿。[1][2]\n\n后文。[6][12]')})
 it('preserves code and ordinary lists',()=>{const text='```text\n例子。-\n1\n-\n2\n```\n\n- 第一项\n- 第二项';expect(repairLegacyDeepSeek(text)).toBe(text)})
})
