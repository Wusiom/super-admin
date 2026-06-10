import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import './styles/index.css';
import 'highlight.js/styles/atom-one-dark.css';
import App from './App.vue';
import router from './router';
import { config } from 'md-editor-v3';
import hljs from './utils/highlight';
import { goldHighlightExtension } from './utils/editor-highlight';

// 注入 highlight.js 实例，启用预览区代码语法高亮
config({
  editorExtensions: {
    highlight: {
      instance: hljs,
    },
  },
  // 自定义编辑器语法高亮配色 → 暗金设计系统
  codeMirrorExtensions(extensions) {
    return [
      ...extensions,
      {
        type: 'goldHighlight',
        extension: goldHighlightExtension(),
      },
    ]
  },
});

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.use(ElementPlus);
app.mount('#app');
