<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import axios from 'axios'

const extId = import.meta.env.VITE_EXTENSION_ID as string

const extDetected = ref<boolean | null>(null)
const authorizing = ref(false)

const backendUrl = computed(() => {
  const origin = window.location.origin
  if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
    return 'http://localhost:3000'
  }
  return origin
})

onMounted(async () => {
  // 检测扩展是否安装
  try {
    const resp = await chrome?.runtime?.sendMessage(extId, { action: 'ping' })
    extDetected.value = resp !== undefined
  } catch {
    extDetected.value = false
  }
})

async function authorize() {
  authorizing.value = true
  try {
    // 1. 获取 API token
    const { data } = await axios.get(`${backendUrl.value}/api/auth/token`)
    const { token } = data

    // 2. 推送到扩展
    try {
      await chrome.runtime.sendMessage(extId, {
        action: 'setConfig',
        token,
        backendUrl: backendUrl.value,
      })
      extDetected.value = true
      ElMessage.success('✅ 扩展已授权')
    } catch {
      extDetected.value = false
      ElMessage.warning('⚠️ 未检测到扩展，请确认扩展已安装并加载')
    }
  } catch (e: any) {
    ElMessage.error('获取 Token 失败：' + (e.response?.data?.message || e.message))
  } finally {
    authorizing.value = false
  }
}
</script>

<template>
  <div>
    <h2 class="text-xl font-semibold mb-4">⚙️ 设置</h2>

    <!-- 扩展授权 -->
    <div class="max-w-2xl">
      <h3 class="text-lg font-medium mb-3">🔌 Chrome 扩展</h3>

      <!-- 安装步骤 -->
      <div class="bg-gray-50 rounded-lg p-4 mb-4">
        <h4 class="font-medium mb-2">安装步骤</h4>
        <ol class="text-sm text-gray-600 space-y-1 list-decimal list-inside">
          <li>打开 Chrome 浏览器，访问 <code class="bg-gray-200 px-1 rounded">chrome://extensions/</code></li>
          <li>开启右上角 <strong>开发者模式</strong></li>
          <li>点击 <strong>加载已解压的扩展程序</strong></li>
          <li>选择项目中的 <code class="bg-gray-200 px-1 rounded">extension/</code> 目录</li>
          <li>回到此页面，点击下方「授权此浏览器」按钮</li>
        </ol>
      </div>

      <!-- 扩展状态 + 授权按钮 -->
      <div class="flex items-center gap-4">
        <el-button
          type="primary"
          :loading="authorizing"
          @click="authorize"
        >
          {{ authorizing ? '授权中...' : '🔑 授权此浏览器' }}
        </el-button>

        <span v-if="extDetected === true" class="text-green-600 text-sm">
          ✅ 扩展已授权
        </span>
        <span v-else-if="extDetected === false" class="text-orange-500 text-sm">
          ⚠️ 未检测到扩展
        </span>
        <span v-else class="text-gray-400 text-sm">
          检测中...
        </span>
      </div>

      <p class="text-xs text-gray-400 mt-2">
        扩展 ID：{{ extId }}
      </p>
    </div>
  </div>
</template>
