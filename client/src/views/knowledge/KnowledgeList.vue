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

onMounted(loadItems)
</script>

<template>
  <div>
    <h2 class="text-xl font-semibold mb-4">知识列表</h2>

    <el-table :data="items" v-loading="loading" stripe @row-click="viewMarkdown" class="cursor-pointer">
      <el-table-column prop="title" label="标题" min-width="200" show-overflow-tooltip />
      <el-table-column prop="url" label="URL" min-width="250" show-overflow-tooltip />
      <el-table-column prop="source" label="来源" width="120" />
      <el-table-column label="采集时间" width="180">
        <template #default="{ row }">
          {{ formatDate(row.capturedAt) }}
        </template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="row.status === 'published' ? 'success' : 'info'" size="small">
            {{ row.status === 'published' ? '已发布' : '草稿' }}
          </el-tag>
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

    <div class="mt-4 flex justify-end">
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next"
        @current-change="onPageChange"
        @size-change="onSizeChange"
      />
    </div>

    <!-- Markdown 查看弹窗 -->
    <el-dialog v-model="dialogVisible" :title="currentTitle" width="800px" top="5vh">
      <div v-if="dialogLoading" class="text-center text-gray-400 py-10">加载中...</div>
      <pre v-else class="whitespace-pre-wrap text-sm leading-relaxed max-h-[70vh] overflow-auto bg-gray-50 p-4 rounded">{{ currentMarkdown }}</pre>
    </el-dialog>
  </div>
</template>
