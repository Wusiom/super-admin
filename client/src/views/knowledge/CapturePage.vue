<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { captureUrl, type CapturePayload } from '../../api/knowledge'

const url = ref('')
const cookies = ref('')
const localStorageStr = ref('')
const showAdvanced = ref(false)
const loading = ref(false)

function validateJSON(val: string, expectArray: boolean): boolean {
  if (!val.trim()) return true
  try {
    const parsed = JSON.parse(val)
    if (expectArray && !Array.isArray(parsed)) {
      ElMessage.error('格式错误：需要 JSON 数组')
      return false
    }
    if (!expectArray && (Array.isArray(parsed) || typeof parsed !== 'object')) {
      ElMessage.error('格式错误：需要 JSON 对象')
      return false
    }
    return true
  } catch {
    ElMessage.error('格式错误：不是合法的 JSON')
    return false
  }
}

async function handleCapture() {
  if (!url.value.trim()) {
    ElMessage.warning('请输入 URL')
    return
  }
  try { new URL(url.value) } catch {
    ElMessage.error('URL 格式不正确，请以 http:// 或 https:// 开头')
    return
  }

  if (!validateJSON(cookies.value, true)) return
  if (!validateJSON(localStorageStr.value, false)) return

  loading.value = true
  try {
    const payload: CapturePayload = { url: url.value.trim() }
    if (cookies.value.trim()) payload.cookies = cookies.value.trim()
    if (localStorageStr.value.trim()) payload.localStorage = localStorageStr.value.trim()
    const { data } = await captureUrl(payload)
    ElMessage.success(`采集任务已提交，任务 ID：${data.jobId}`)
    url.value = ''
    cookies.value = ''
    localStorageStr.value = ''
  } catch (e: any) {
    const msg = e.response?.data?.message || e.message || '提交失败'
    ElMessage.error(msg)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div>
    <h2 class="text-xl font-semibold mb-4">采集知识</h2>
    <p class="text-gray-500 mb-6">输入网页 URL，系统将自动提取正文内容并转为 Markdown。</p>

    <div class="flex gap-3 max-w-2xl mb-4">
      <el-input
        v-model="url"
        placeholder="请输入网页 URL"
        size="large"
        clearable
        @keyup.enter="handleCapture"
      />
      <el-button type="primary" size="large" :loading="loading" @click="handleCapture">
        {{ loading ? '采集中...' : '开始采集' }}
      </el-button>
    </div>

    <!-- 高级设置 -->
    <div class="max-w-2xl">
      <el-button text size="small" @click="showAdvanced = !showAdvanced">
        {{ showAdvanced ? '收起' : '展开' }} 认证设置（需要登录的页面）
      </el-button>
      <div v-show="showAdvanced" class="mt-3 space-y-4">
        <div>
          <p class="text-xs text-gray-500 mb-1">
            F12 Console 运行，粘贴输出到下方即可：
            <code class="text-xs bg-gray-100 px-1">copy(JSON.stringify(localStorage))</code>
          </p>
          <el-input
            v-model="localStorageStr"
            type="textarea"
            :rows="4"
            placeholder='{"vuex":"{...}","token":"xxx",...}'
          />
        </div>
        <div>
          <p class="text-xs text-gray-500 mb-1">
            Cookie（可选，如页面仅靠 localStorage 认证则不需要填）
          </p>
          <el-input
            v-model="cookies"
            type="textarea"
            :rows="3"
            placeholder='[{"name":"session","value":"abc","domain":".example.com","path":"/"}]'
          />
        </div>
      </div>
    </div>

    <div class="mt-8">
      <el-divider />
      <router-link to="/knowledge/list" class="text-blue-500 hover:text-blue-700">
        查看已采集的知识 &rarr;
      </router-link>
    </div>
  </div>
</template>
