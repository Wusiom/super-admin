<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useToolsStore } from '../stores/tools'

const router = useRouter()
const route = useRoute()
const toolsStore = useToolsStore()

onMounted(() => {
  toolsStore.load()
})

function navigate(toolRoute: string) {
  router.push(`/${toolRoute}`)
}
</script>

<template>
  <div class="flex h-screen bg-gray-50">
    <!-- 侧边栏 -->
    <aside class="w-60 bg-white border-r border-gray-200 flex flex-col shrink-0">
      <div class="h-14 flex items-center px-5 border-b border-gray-100">
        <h1 class="text-lg font-semibold text-gray-800">Super Admin</h1>
      </div>

      <el-menu
        :default-active="route.path"
        class="flex-1 border-r-0"
        background-color="transparent"
      >
        <el-menu-item
          v-for="tool in toolsStore.tools"
          :key="tool.key"
          :index="`/${tool.route}`"
          @click="navigate(tool.route)"
        >
          <span>{{ tool.icon }} {{ tool.name }}</span>
        </el-menu-item>

        <el-menu-item index="/jobs" @click="router.push('/jobs')">
          <span>📋 任务中心</span>
        </el-menu-item>
      </el-menu>
    </aside>

    <!-- 主内容区 -->
    <main class="flex-1 overflow-auto p-6">
      <router-view />
    </main>
  </div>
</template>
