<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { fetchKnowledgeItem, updateKnowledgeItem, type KnowledgeItem } from '../../api/knowledge'
import MarkdownEditor from '../../components/MarkdownEditor.vue'

const route = useRoute()
const router = useRouter()

const item = ref<KnowledgeItem | null>(null)
const content = ref('')
const originalContent = ref('')
const loading = ref(true)
const error = ref('')
const saved = ref(false)

const isDirty = ref(false)

watch(content, (val) => {
  isDirty.value = val !== originalContent.value
})

function onSave() {
  if (!item.value) return
  updateKnowledgeItem(item.value.id, content.value)
    .then(() => {
      originalContent.value = content.value
      isDirty.value = false
      saved.value = true
      ElMessage.success('保存成功')
      setTimeout(() => { saved.value = false }, 3000)
    })
    .catch((e: any) => {
      ElMessage.error(e?.response?.data?.message || '保存失败')
    })
}

function onBeforeUnload(e: BeforeUnloadEvent) {
  if (isDirty.value) {
    e.preventDefault()
  }
}

onMounted(async () => {
  const id = Number(route.params.id)
  try {
    const { data } = await fetchKnowledgeItem(id)
    item.value = data
    content.value = data.contentMarkdown || ''
    originalContent.value = content.value
  } catch (e: any) {
    error.value = e?.response?.status === 404
      ? '知识条目不存在'
      : '加载失败，请稍后重试'
  } finally {
    loading.value = false
  }
  window.addEventListener('beforeunload', onBeforeUnload)
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', onBeforeUnload)
})
</script>

<template>
  <div class="fs-page">
    <!-- Top bar -->
    <div class="fs-topbar">
      <div class="fs-topbar-left">
        <button class="btn-back" @click="router.push({ name: 'CaptureConsole' })">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14">
            <path d="M10 3L5 8l5 5" />
          </svg>
          返回列表
        </button>
        <span class="text-[var(--text-muted)] text-xs">/</span>
        <span class="fs-title">{{ item?.title || '加载中...' }}</span>
      </div>
      <div class="fs-topbar-right">
        <span class="kbd-hint">
          <span v-if="isDirty" class="dirty-dot" style="margin-right:4px;" />
          <span v-else-if="saved" class="text-[11px] text-[var(--accent-gold)] mr-1">已保存</span>
          <span class="kbd">Ctrl</span> + <span class="kbd">S</span> 保存
        </span>
      </div>
    </div>

    <!-- Body -->
    <div class="fs-body">
      <!-- Loading -->
      <div v-if="loading" class="flex items-center justify-center h-full col-span-full">
        <span class="text-[var(--text-muted)] text-sm">加载中...</span>
      </div>

      <!-- Error -->
      <div v-else-if="error" class="flex flex-col items-center justify-center h-full col-span-full gap-4">
        <span class="text-[var(--text-secondary)] text-sm">{{ error }}</span>
        <button class="btn-back" @click="router.push({ name: 'CaptureConsole' })">
          ← 返回列表
        </button>
      </div>

      <!-- Editor -->
      <MarkdownEditor
        v-else
        v-model="content"
        height="calc(100vh - 44px)"
        @save="onSave"
      />
    </div>
  </div>
</template>

<style scoped>
.fs-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--surface-1, hsl(234, 10%, 7%));
  color: var(--text-primary, hsl(44, 16%, 88%));
}

/* Top bar */
.fs-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 44px;
  padding: 0 16px;
  border-bottom: 1px solid var(--hairline, rgba(255, 255, 255, 0.06));
  background: var(--surface-1, hsl(234, 10%, 7%));
  flex-shrink: 0;
}

.fs-topbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.fs-topbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.btn-back {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-secondary, hsl(44, 7%, 67%));
  background: none;
  border: none;
  cursor: pointer;
  font-family: system-ui, sans-serif;
  padding: 4px 0;
  transition: color 120ms;
}

.btn-back:hover {
  color: var(--text-primary, hsl(44, 16%, 88%));
}

.fs-title {
  font-family: 'Space Grotesk', system-ui, sans-serif;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary, hsl(44, 16%, 88%));
  letter-spacing: -0.01em;
}

/* Body */
.fs-body {
  flex: 1;
  min-height: 0;
  display: flex;
}

.fs-body > :deep(.md-editor) {
  flex: 1;
}

/* Dirty dot */
.dirty-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--accent-gold, hsl(43, 60%, 58%));
  flex-shrink: 0;
}

/* Keyboard hint */
.kbd-hint {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--text-muted, hsl(40, 5%, 41%));
  font-family: system-ui, sans-serif;
}

.kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 6px;
  font-family: 'JetBrains Mono', 'Consolas', monospace;
  font-size: 10px;
  background: var(--surface-3, hsl(234, 10%, 12%));
  border: 1px solid var(--hairline, rgba(255, 255, 255, 0.06));
  border-radius: 3px;
  color: var(--text-secondary, hsl(44, 7%, 67%));
  min-width: 20px;
}
</style>
