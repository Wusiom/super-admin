<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useToolsStore } from '../stores/tools'
import {
  Monitor,
  Setting,
  DocumentCopy,
  List,
  Grid,
} from '@element-plus/icons-vue'
import type { Component } from 'vue'

const router = useRouter()
const route = useRoute()
const toolsStore = useToolsStore()

onMounted(() => {
  toolsStore.load()
})

function navigate(toolRoute: string) {
  router.push(`/${toolRoute}`)
}

// Map icon name strings from manifest to Element Plus icon components
const iconMap: Record<string, Component> = {
  DocumentCopy,
  List,
  Grid,
  Monitor,
  Setting,
}

function getToolIcon(iconName: string): Component {
  return iconMap[iconName] || Grid
}
</script>

<template>
  <div class="flex h-screen bg-[hsl(225,11%,3.5%)]">
    <!-- 侧边栏 -->
    <aside class="w-[220px] bg-[hsl(234,10%,7%)] border-r border-[rgba(255,255,255,0.06)] flex flex-col shrink-0">
      <!-- Logo -->
      <div class="h-12 flex items-center px-4 border-b border-[rgba(255,255,255,0.06)]">
        <span class="text-[15px] font-semibold text-[hsl(44,16%,88%)] tracking-tight font-[Space_Grotesk]">
          Super Admin
        </span>
      </div>

      <!-- Navigation -->
      <el-menu
        :default-active="route.path"
        class="flex-1 border-r-0 !bg-transparent px-2 py-1.5"
        background-color="transparent"
      >
        <!-- 动态工具菜单 -->
        <el-menu-item
          v-for="tool in toolsStore.tools"
          :key="tool.key"
          :index="`/${tool.route}`"
          @click="navigate(tool.route)"
          class="!h-auto !leading-none !mb-px"
        >
          <el-icon class="!mr-2 !text-sm">
            <component :is="getToolIcon(tool.icon)" />
          </el-icon>
          <span class="text-[13px]">{{ tool.name }}</span>
        </el-menu-item>

        <!-- 分隔 -->
        <div class="text-[10px] font-medium text-[hsl(40,5%,41%)] uppercase tracking-wider px-2.5 pt-4 pb-1">
          系统
        </div>

        <!-- 任务中心 -->
        <el-menu-item
          index="/jobs"
          @click="router.push('/jobs')"
          class="!h-auto !leading-none !mb-px"
        >
          <el-icon class="!mr-2 !text-sm">
            <Monitor />
          </el-icon>
          <span class="text-[13px]">任务中心</span>
        </el-menu-item>

        <!-- 设置 -->
        <el-menu-item
          index="/settings"
          @click="router.push('/settings')"
          class="!h-auto !leading-none !mb-px"
        >
          <el-icon class="!mr-2 !text-sm">
            <Setting />
          </el-icon>
          <span class="text-[13px]">设置</span>
        </el-menu-item>
      </el-menu>
    </aside>

    <!-- 主内容区 -->
    <main class="flex-1 overflow-auto">
      <router-view />
    </main>
  </div>
</template>

<style>
/* ---- Sidebar menu items — dark theme overrides ---- */
.el-menu-item {
  color: hsl(44, 7%, 67%) !important;
  border-radius: 4px !important;
  margin: 0 4px !important;
  padding: 7px 10px !important;
  min-height: unset !important;
  transition: background 120ms ease-out, color 120ms ease-out !important;
}

.el-menu-item:hover {
  background: rgba(255, 255, 255, 0.04) !important;
  color: hsl(44, 16%, 88%) !important;
}

.el-menu-item.is-active {
  background: rgba(212, 168, 83, 0.12) !important;
  color: hsl(43, 60%, 58%) !important;
  position: relative;
}

.el-menu-item.is-active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 6px;
  bottom: 6px;
  width: 2px;
  background: hsl(43, 60%, 58%);
  border-radius: 1px;
}
</style>
