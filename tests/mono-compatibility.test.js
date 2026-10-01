import{describe,expect,it}from'vitest';import{analyzeMonoCompatibility}from'../js/mono-compatibility.js';
const wave=(n=4096)=>Float64Array.from({length:n},(_,i)=>Math.sin(i*.07));
describe('mono compatibility diagnostics',()=>{
 it('reports strongly correlated identical stereo as low risk',()=>{const a=wave(),r=analyzeMonoCompatibility(a,a);expect(r.available).toBe(true);expect(r.correlation).toBeCloseTo(1,6);expect(r.risk).toBe('low');});
 it('flags polarity-inverted channels as high risk',()=>{const a=wave(),b=Float64Array.from(a,x=>-x),r=analyzeMonoCompatibility(a,b);expect(r.correlation).toBeCloseTo(-1,6);expect(r.risk).toBe('high');expect(r.message).toMatch(/cancellation/i);});
 it('flags decorrelated stereo without inventing a quality score',()=>{const a=wave(),b=Float64Array.from({length:a.length},(_,i)=>Math.cos(i*.113)),r=analyzeMonoCompatibility(a,b);expect(r.risk).toBe('elevated');expect(r).not.toHaveProperty('score');});
 it('refuses analysis when stereo samples are absent or too short',()=>{expect(analyzeMonoCompatibility(null,null)).toMatchObject({available:false});expect(analyzeMonoCompatibility([1],[1])).toMatchObject({available:false});});
});
