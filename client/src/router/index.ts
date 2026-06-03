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
          name: 'KnowledgeCapture',
          component: () => import('../views/knowledge/CapturePage.vue'),
        },
        {
          path: 'knowledge/list',
          name: 'KnowledgeList',
          component: () => import('../views/knowledge/KnowledgeList.vue'),
        },
        {
          path: 'jobs',
          name: 'JobCenter',
          component: () => import('../views/jobs/JobCenter.vue'),
        },
        {
          path: 'settings',
          name: 'Settings',
          component: () => import('../views/settings/SettingsPage.vue'),
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
