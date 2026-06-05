<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { fetchKnowledgeItems, fetchKnowledgeItem, deleteKnowledgeItem, type KnowledgeItem } from '../../api/knowledge'

const items = ref<KnowledgeItem[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)
const loading = ref(false)

const dialogVisible = ref(false)
const currentMarkdown = ref('')
const currentTitle = ref('')
const dialogLoading = ref(false)

async function loadItems() {
  loading.value = true
  try {
    const { data } = await fetchKnowledgeItems({ page: page.value, pageSize: pageSize.value })
    items.value = data.items
    total.value = data.total
  } catch (e: any) {
    ElMessage.error('加载知识列表失败')
  } finally {
    loading.value = false
  }
}

function onPageChange(p: number) {
  page.value = p
  loadItems()
}

function onSizeChange(s: number) {
  pageSize.value = s
  page.value = 1
  loadItems()
}

async function viewMarkdown(row: KnowledgeItem) {
  currentTitle.value = row.title || row.url
  dialogVisible.value = true
  dialogLoading.value = true
  try {
    const { data } = await fetchKnowledgeItem(row.id)
    currentMarkdown.value = data.contentMarkdown || '(无内容)'
  } catch {
    currentMarkdown.value = '(加载失败)'
  } finally {
    dialogLoading.value = false
  }
}

async function handleDelete(row: KnowledgeItem) {
  try {
    await deleteKnowledgeItem(row.id)
    ElMessage.success('删除成功')
    loadItems()
  } catch {
    ElMessage.error('删除失败')
  }
}

function formatDate(iso: string) {
  if (!iso) return '-'
  return new Date(iso).toLocaleString('zh-CN')
}

function statusPillClass(status: string): string {
  return status === 'published' ? 'pill pill-success' : 'pill pill-draft'
}

function statusLabel(status: string): string {
  return status === 'published' ? '已发布' : '草稿'
}

onMounted(loadItems)
</script>

<template>
  <div class="h-full flex flex-col overflow-hidden">
    <!-- 页面标题 -->
    <div class="flex items-center justify-between mb-4 shrink-0">
      <div>
        <h2 class="text-[24px] font-semibold text-[var(--text-primary)] tracking-[-0.01em] font-[Space_Grotesk]">
          知识列表
        </h2>
        <p class="text-[13px] text-[var(--text-muted)] mt-0.5">
          管理已采集的知识内容
        </p>
      </div>
      <span class="text-[11px] text-[var(--text-muted)] font-mono">
        共 {{ total }} 条
      </span>
    </div>

    <!-- 表格 -->
    <div class="table-wrap flex-1 min-h-0 flex flex-col">
      <el-table
        :data="items"
        v-loading="loading"
        class="knowledge-table"
        @row-click="(row: any) => viewMarkdown(row)"
      >
        <el-table-column prop="title" label="标题" min-width="220" show-overflow-tooltip />
        <el-table-column prop="url" label="URL" min-width="260" show-overflow-tooltip />
        <el-table-column prop="source" label="来源" width="140" />
        <el-table-column label="采集时间" width="180">
          <template #default="{ row }">
            <span class="tabular-nums">{{ formatDate(row.capturedAt) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <span :class="statusPillClass(row.status)">
              <span class="dot" />
              {{ statusLabel(row.status) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="80" fixed="right">
          <template #default="{ row }">
            <el-popconfirm
              title="确认删除该条知识？"
              @confirm="handleDelete(row)"
              @click.stop
            >
              <template #reference>
                <el-button type="danger" size="small" @click.stop>删除</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 分页 -->
    <div class="mt-3 flex justify-end shrink-0">
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next"
        size="small"
        @current-change="onPageChange"
        @size-change="onSizeChange"
      />
    </div>

    <!-- Markdown 查看弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      :title="currentTitle"
      width="800px"
      top="5vh"
    >
      <div v-if="dialogLoading" class="flex items-center justify-center py-12 text-[var(--text-muted)] text-sm">
        加载中...
      </div>
      <pre
        v-else
        class="whitespace-pre-wrap text-[13px] leading-relaxed max-h-[70vh] overflow-auto bg-[var(--surface-2)] p-5 rounded-lg text-[var(--text-primary)]"
      >{{ currentMarkdown }}</pre>
    </el-dialog>
  </div>
</template>

<style scoped>
/* Table wrapper — matching prototype .table-wrap */
.table-wrap {
  background: var(--surface-2);
  border: 1px solid var(--hairline);
  border-radius: 8px;
  overflow: hidden;
}

/* Table overrides */
:deep(.knowledge-table) {
  background: transparent;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

:deep(.knowledge-table .el-table__inner-wrapper) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

:deep(.knowledge-table .el-table__body-wrapper) {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

:deep(.knowledge-table .el-table__header th) {
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-size: 11px;
}

:deep(.knowledge-table .el-table__body tr) {
  cursor: pointer;
}

/* Cell text sizing */
:deep(.knowledge-table .el-table__cell) {
  font-size: 13px;
}

/* Empty / loading states */
:deep(.el-table__empty-text) {
  color: var(--text-muted);
}
</style>
