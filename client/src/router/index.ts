import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'Login',
      component: () => import('../views/login/index.vue'),
    },
    {
      path: '/',
      component: () => import('../layouts/DefaultLayout.vue'),
      redirect: '/jobs',
      children: [
        {
          path: 'knowledge/capture',
          redirect: '/jobs',
        },
        {
          path: 'knowledge/list',
          name: 'KnowledgeList',
          component: () => import('../views/knowledge/KnowledgeList.vue'),
          meta: { title: '知识列表' },
        },
        {
          path: 'jobs',
          name: 'CaptureConsole',
          component: () => import('../views/knowledge/CaptureConsole.vue'),
          meta: { title: '知识采集' },
        },
        {
          path: 'settings',
          name: 'Settings',
          component: () => import('../views/settings/SettingsPage.vue'),
          meta: { title: '设置' },
        },
        {
          path: '',
          redirect: '/jobs',
        },
      ],
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'NotFound',
      component: () => import('../views/NotFound.vue'),
    },
  ],
});

export default router;
