import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

describe('兼容性测试：ESM', () => {
  it('应该能通过 ESM 方式导入 CascadeQ 并正常使用', async () => {
    const { CascadeQ } = await import('../dist/cascade-q.js');
    const queue = new CascadeQ({ maxConcurrency: 2 });
    queue.add(async () => await new Promise(resolve => setTimeout(resolve, 50)), 1);
    const state = queue.getState();
    expect(state.pending).toBeGreaterThanOrEqual(0);
  });
});

describe('兼容性测试：CommonJS', () => {
  it('应该能通过 CommonJS 方式导入 CascadeQ 并正常使用', () => {
    const require = createRequire(import.meta.url);
    const { CascadeQ } = require('../dist/cascade-q.cjs');
    const queue = new CascadeQ({ maxConcurrency: 2 });
    queue.add(async () => await new Promise(resolve => setTimeout(resolve, 50)), 1);
    const state = queue.getState();
    expect(state.pending).toBeGreaterThanOrEqual(0);
  });
});
