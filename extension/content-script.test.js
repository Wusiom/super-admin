/**
 * 单元测试：content-script.js 的 serializeStorage() 函数
 *
 * 运行方式：node --test extension/content-script.test.js
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');

// 模拟 chrome.runtime.onMessage（content-script 在加载时会调用 addListener）
global.chrome = {
  runtime: {
    onMessage: {
      addListener: () => {},
    },
  },
};

const { serializeStorage } = require('./content-script.js');

// Mock Storage 接口
function createMockStorage(entries) {
  const keys = Object.keys(entries);
  return {
    length: keys.length,
    key(index) {
      return index < keys.length ? keys[index] : null;
    },
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(entries, key) ? entries[key] : null;
    },
  };
}

describe('serializeStorage()', () => {
  it('正常数据：多个 key/value 对', () => {
    const storage = createMockStorage({
      token: 'abc123',
      theme: 'dark',
      count: '42',
    });
    assert.deepStrictEqual(serializeStorage(storage), {
      token: 'abc123',
      theme: 'dark',
      count: '42',
    });
  });

  it('空 Storage', () => {
    const storage = createMockStorage({});
    assert.deepStrictEqual(serializeStorage(storage), {});
  });

  it('特殊字符 key/value', () => {
    const storage = createMockStorage({
      'a:b/c': 'value with spaces',
      '中文key': '中文value',
      '{"json":"key"}': '{"json":"value"}',
      '': 'empty-key',
    });
    const result = serializeStorage(storage);
    assert.strictEqual(result['a:b/c'], 'value with spaces');
    assert.strictEqual(result['中文key'], '中文value');
    assert.strictEqual(result['{"json":"key"}'], '{"json":"value"}');
    assert.strictEqual(result[''], 'empty-key');
  });

  it('单个 key/value', () => {
    const storage = createMockStorage({ single: 'value' });
    assert.deepStrictEqual(serializeStorage(storage), { single: 'value' });
  });

  it('大量 key（100 个）', () => {
    const entries = {};
    for (let i = 0; i < 100; i++) {
      entries[`key_${i}`] = `value_${i}`;
    }
    const storage = createMockStorage(entries);
    const result = serializeStorage(storage);
    assert.strictEqual(Object.keys(result).length, 100);
    assert.strictEqual(result.key_0, 'value_0');
    assert.strictEqual(result.key_99, 'value_99');
  });

  it('key 方法返回 null 时正确处理', () => {
    const storage = createMockStorage({ a: '1' });
    assert.strictEqual(storage.key(1), null);
    const result = serializeStorage(storage);
    assert.deepStrictEqual(result, { a: '1' });
  });

  it('getItem 抛异常时不应中断遍历', () => {
    const storage = {
      length: 2,
      key(index) {
        return ['good', 'bad'][index];
      },
      getItem(key) {
        if (key === 'bad') throw new Error('模拟读取错误');
        return 'good_value';
      },
    };
    const result = serializeStorage(storage);
    assert.strictEqual(result.good, 'good_value');
    assert.ok(result.bad.startsWith('[Error:'));
  });
});
