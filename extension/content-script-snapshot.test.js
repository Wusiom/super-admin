const { describe, it } = require('node:test');
const assert = require('node:assert');

global.chrome = {
  runtime: {
    onMessage: {
      addListener: () => {},
    },
  },
};

global.document = {
  title: 'Current Page',
  documentElement: {
    outerHTML: '<html><body><article>Current rendered body</article></body></html>',
  },
};

const { createPageSnapshot } = require('./content-script.js');

describe('createPageSnapshot()', () => {
  it('captures title and rendered HTML from the current tab', () => {
    assert.deepStrictEqual(createPageSnapshot(), {
      title: 'Current Page',
      html: '<html><body><article>Current rendered body</article></body></html>',
    });
  });
});
