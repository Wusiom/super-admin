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
    <!-- 页面标题 -->
    <div class="mb-5">
      <h2 class="text-[24px] font-semibold text-[var(--text-primary)] tracking-[-0.01em] font-[Space_Grotesk]">
        采集知识
      </h2>
      <p class="text-[13px] text-[var(--text-muted)] mt-0.5">
        输入网页 URL，系统将自动提取正文内容并转为 Markdown。
      </p>
    </div>

    <!-- 扩展引导 banner -->
    <div class="bg-[var(--surface-2)] border border-[var(--hairline)] rounded-lg p-4 mb-5 max-w-2xl">
      <div class="flex items-start gap-3">
        <span class="text-lg mt-0.5">💡</span>
        <div>
          <p class="font-medium text-[var(--text-primary)] mb-1 text-sm">
            推荐使用 Chrome 扩展一键采集
          </p>
          <p class="text-[13px] text-[var(--text-secondary)] leading-relaxed">
            安装 Chrome 扩展后，浏览到目标页面点击扩展按钮即可自动提取 Cookie 和 localStorage，无需手动分析。
            <router-link to="/settings" class="text-[var(--accent-gold)] hover:underline font-medium">
              查看安装指南 →
            </router-link>
          </p>
        </div>
      </div>
    </div>

    <!-- URL 输入 -->
    <div class="flex gap-3 max-w-2xl mb-4">
      <el-input
        v-model="url"
        placeholder="请输入网页 URL（https://...）"
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
          <p class="text-xs text-[var(--text-muted)] mb-1.5">
            F12 Console 运行，粘贴输出到下方即可：
            <code class="text-[11px] bg-[var(--surface-3)] px-1.5 py-0.5 rounded font-mono">copy(JSON.stringify(localStorage))</code>
          </p>
          <el-input
            v-model="localStorageStr"
            type="textarea"
            :rows="4"
            placeholder='{"vuex":"{...}","token":"xxx",...}'
          />
        </div>
        <div>
          <p class="text-xs text-[var(--text-muted)] mb-1.5">
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

    <!-- 底部链接 -->
    <div class="mt-8 pt-5 border-t border-[var(--hairline)]">
      <router-link to="/knowledge/list" class="text-[var(--accent-gold)] hover:underline text-sm">
        查看已采集的知识 →
      </router-link>
    </div>
  </div>
</template>
