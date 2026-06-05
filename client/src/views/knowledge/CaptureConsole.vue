<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { ElMessage } from 'element-plus';
import {
  fetchJobs,
  fetchJobsMetrics,
  retryJob,
  type JobInfo,
  type JobsMetrics,
} from '../../api/jobs';
import {
  captureUrl,
  fetchKnowledgeItem,
  deleteKnowledgeItem,
  type CapturePayload,
} from '../../api/knowledge';

// ---- Dashboard metrics ----
const metrics = ref<JobsMetrics>({
  totalItems: 0,
  todayItems: 0,
  runningCount: 0,
  successRate: null,
  failedCount: 0,
});

async function loadMetrics() {
  try {
    const { data } = await fetchJobsMetrics({ toolKey: 'knowledge-capture' });
    metrics.value = data;
  } catch {
    // 静默失败，保留上次数据
  }
}

// ---- Task list ----
const jobs = ref<JobInfo[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const loading = ref(false);
const filterStatus = ref('');
const expandedId = ref<string | null>(null);

let pollTimer: ReturnType<typeof setInterval> | null = null;

function hasRunningOrPending() {
  return jobs.value.some(
    (j) => j.status === 'pending' || j.status === 'running',
  );
}

async function loadJobs() {
  loading.value = true;
  try {
    const params: Record<string, string | number> = {
      page: page.value,
      pageSize: pageSize.value,
      toolKey: 'knowledge-capture',
    };
    if (filterStatus.value) params.status = filterStatus.value;
    const { data } = await fetchJobs(params);
    jobs.value = data.jobs;
    total.value = data.total;
  } catch {
    ElMessage.error('加载任务列表失败');
  } finally {
    loading.value = false;
  }
}

function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(() => {
    if (hasRunningOrPending()) {
      loadJobs();
      loadMetrics();
    }
  }, 3000);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function onFilterChange(status: string) {
  filterStatus.value = status;
  page.value = 1;
  loadJobs();
}

function onPageChange(p: number) {
  page.value = p;
  loadJobs();
}

function onSizeChange(s: number) {
  pageSize.value = s;
  page.value = 1;
  loadJobs();
}

function toggleExpand(jobId: string) {
  expandedId.value = expandedId.value === jobId ? null : jobId;
}

// ---- Actions ----
async function handleRetry(row: JobInfo) {
  try {
    await retryJob(row.id);
    ElMessage.success('已重新入队');
    loadJobs();
    loadMetrics();
  } catch {
    ElMessage.error('重试失败');
  }
}

async function handleDeleteItem(row: JobInfo) {
  const itemId = row.diagnostics?.itemId;
  if (!itemId) {
    ElMessage.error('无法找到关联的知识条目');
    return;
  }
  try {
    await deleteKnowledgeItem(itemId);
    ElMessage.success('删除成功');
    loadJobs();
    loadMetrics();
  } catch {
    ElMessage.error('删除失败');
  }
}

// ---- Markdown 查看 ----
const markdownVisible = ref(false);
const markdownTitle = ref('');
const markdownContent = ref('');
const markdownLoading = ref(false);

async function viewMarkdown(row: JobInfo) {
  const itemId = row.diagnostics?.itemId;
  if (!itemId) {
    ElMessage.error('无法找到关联的知识条目');
    return;
  }
  markdownTitle.value =
    row.diagnostics?.itemTitle || row.diagnostics?.url || '';
  markdownVisible.value = true;
  markdownLoading.value = true;
  try {
    const { data } = await fetchKnowledgeItem(itemId);
    markdownContent.value = data.contentMarkdown || '(无内容)';
  } catch {
    markdownContent.value = '(加载失败)';
  } finally {
    markdownLoading.value = false;
  }
}

// ---- 手动 URL 采集（隐藏的高级功能） ----
const showManualCapture = ref(false);
const manualUrl = ref('');
const manualCookies = ref('');
const manualLocalStorage = ref('');
const manualLoading = ref(false);

function validateJSON(val: string, expectArray: boolean): boolean {
  if (!val.trim()) return true;
  try {
    const parsed = JSON.parse(val);
    if (expectArray && !Array.isArray(parsed)) {
      ElMessage.error('格式错误：需要 JSON 数组');
      return false;
    }
    if (!expectArray && (Array.isArray(parsed) || typeof parsed !== 'object')) {
      ElMessage.error('格式错误：需要 JSON 对象');
      return false;
    }
    return true;
  } catch {
    ElMessage.error('格式错误：不是合法的 JSON');
    return false;
  }
}

async function handleManualCapture() {
  if (!manualUrl.value.trim()) {
    ElMessage.warning('请输入 URL');
    return;
  }
  try {
    new URL(manualUrl.value);
  } catch {
    ElMessage.error('URL 格式不正确，请以 http:// 或 https:// 开头');
    return;
  }

  if (!validateJSON(manualCookies.value, true)) return;
  if (!validateJSON(manualLocalStorage.value, false)) return;

  manualLoading.value = true;
  try {
    const payload: CapturePayload = { url: manualUrl.value.trim() };
    if (manualCookies.value.trim())
      payload.cookies = manualCookies.value.trim();
    if (manualLocalStorage.value.trim())
      payload.localStorage = manualLocalStorage.value.trim();
    const { data } = await captureUrl(payload);
    ElMessage.success(`采集任务已提交，任务 ID：${data.jobId}`);
    manualUrl.value = '';
    manualCookies.value = '';
    manualLocalStorage.value = '';
    showManualCapture.value = false;
    loadJobs();
    loadMetrics();
  } catch (e: any) {
    const msg = e.response?.data?.message || e.message || '提交失败';
    ElMessage.error(msg);
  } finally {
    manualLoading.value = false;
  }
}

// ---- Helpers ----
function statusPillClass(status: string): string {
  const map: Record<string, string> = {
    pending: 'pill pill-pending',
    running: 'pill pill-running',
    active: 'pill pill-running',
    success: 'pill pill-success',
    completed: 'pill pill-success',
    failed: 'pill pill-failed',
  };
  return map[status] || 'pill pill-draft';
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    pending: '等待中',
    running: '采集中',
    active: '采集中',
    success: '成功',
    completed: '成功',
    failed: '失败',
  };
  return map[status] || status;
}

function formatDate(iso: string) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('zh-CN');
}

function formatNumber(n: number | undefined | null): string {
  if (n == null) return '-';
  return n.toLocaleString('zh-CN');
}

function formatRate(rate: number | null | undefined): string {
  if (rate == null) return '-';
  return rate + '%';
}

function diagnosticsLabel(row: JobInfo): string {
  if (row.diagnosticsSummary) return row.diagnosticsSummary;
  return '采集中';
}

function diagnosticsLabelType(
  row: JobInfo,
): 'info' | 'success' | 'danger' | 'warning' {
  if (!row.diagnostics) return 'info';
  if (row.status === 'completed') return 'success';
  if (row.status === 'failed') return 'danger';
  if (row.status === 'running' || row.status === 'pending') return 'warning';
  return 'info';
}

const expandedJob = computed(() => {
  if (!expandedId.value) return null;
  return jobs.value.find((j) => j.id === expandedId.value) || null;
});

onMounted(() => {
  loadMetrics();
  loadJobs();
  startPolling();
});

onUnmounted(stopPolling);
</script>

<template>
  <div class="h-full flex flex-col overflow-hidden">
    <!-- 页面标题 -->
    <div class="mb-4 shrink-0">
      <h2
        class="text-[24px] font-semibold text-[var(--text-primary)] tracking-[-0.01em] font-[Space_Grotesk]"
      >
        知识采集
      </h2>
      <p class="text-[13px] text-[var(--text-muted)] mt-0.5">
        打开目标网页并确认正文完整显示后，点击 Chrome 扩展按钮采集。
      </p>
    </div>

    <!-- 仪表盘卡片 -->
    <div class="grid grid-cols-4 gap-3 mb-4 shrink-0">
      <div class="stat-card">
        <p class="stat-label">总采集</p>
        <p class="stat-value text-[var(--text-primary)]">
          {{ formatNumber(metrics.totalItems) }}
        </p>
        <p class="stat-sub">今日 +{{ formatNumber(metrics.todayItems) }}</p>
      </div>
      <div class="stat-card">
        <p class="stat-label">进行中</p>
        <p class="stat-value text-[#60a5fa]">
          {{ formatNumber(metrics.runningCount) }}
        </p>
        <p class="stat-sub">采集中</p>
      </div>
      <div class="stat-card">
        <p class="stat-label">成功率</p>
        <p class="stat-value text-[#34d399]">
          {{ formatRate(metrics.successRate) }}
        </p>
        <p class="stat-sub">过去 24h</p>
      </div>
      <div class="stat-card">
        <p class="stat-label">失败</p>
        <p class="stat-value text-[#f87171]">
          {{ formatNumber(metrics.failedCount) }}
        </p>
        <p class="stat-sub">待处理</p>
      </div>
    </div>

    <!-- 任务表格区域 -->
    <div class="table-wrap flex-1 min-h-0 flex flex-col">
      <!-- 筛选 + 表头 -->
      <div
        class="flex items-center justify-between px-4 py-3 border-b border-[var(--hairline)]"
      >
        <div class="flex items-center gap-3">
          <span class="text-[13px] font-medium text-[hsl(44,16%,88%)]"
            >采集任务</span
          >
          <el-radio-group
            :model-value="filterStatus"
            size="small"
            @change="onFilterChange"
          >
            <el-radio-button value="">全部</el-radio-button>
            <el-radio-button value="running">进行中</el-radio-button>
            <el-radio-button value="completed">成功</el-radio-button>
            <el-radio-button value="failed">失败</el-radio-button>
          </el-radio-group>
        </div>
        <el-button
          text
          size="small"
          @click="
            loadJobs();
            loadMetrics();
          "
        >
          刷新
        </el-button>
      </div>

      <!-- 任务表格 -->
      <el-table
        :data="jobs"
        v-loading="loading"
        class="capture-table"
        row-class-name="capture-row"
        @row-click="(row: any) => toggleExpand(row.id)"
      >
        <el-table-column label="任务" width="80">
          <template #default="{ row }">
            <span class="text-[hsl(44,7%,50%)] tabular-nums"
              >#{{ row.id }}</span
            >
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <span :class="statusPillClass(row.status)">
              <span class="dot" />
              {{ statusLabel(row.status) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column
          label="标题 / URL"
          min-width="280"
          show-overflow-tooltip
        >
          <template #default="{ row }">
            <span
              v-if="row.diagnostics?.itemTitle"
              class="text-[var(--text-primary)] text-[13px]"
            >
              {{ row.diagnostics.itemTitle }}
            </span>
            <span
              v-else
              class="text-[var(--text-secondary)] text-[13px] break-all"
            >
              {{ row.diagnostics?.url || '-' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="诊断" width="140">
          <template #default="{ row }">
            <span
              class="text-[13px]"
              :class="{
                'text-[hsl(157,40%,52%)]':
                  diagnosticsLabelType(row) === 'success',
                'text-[hsl(0,55%,52%)]': diagnosticsLabelType(row) === 'danger',
                'text-[hsl(212,40%,55%)]':
                  diagnosticsLabelType(row) === 'warning',
                'text-[hsl(44,7%,47%)]': diagnosticsLabelType(row) === 'info',
              }"
            >
              {{ diagnosticsLabel(row) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="170">
          <template #default="{ row }">
            <span class="text-[13px] text-[hsl(44,7%,47%)] tabular-nums">
              {{ formatDate(row.createdAt) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <div class="flex gap-2" @click.stop>
              <el-button
                v-if="row.status === 'failed'"
                type="primary"
                size="small"
                @click="handleRetry(row)"
              >
                重试
              </el-button>
              <el-button
                v-if="row.status === 'success' || row.status === 'completed'"
                size="small"
                @click="viewMarkdown(row)"
              >
                查看
              </el-button>
              <el-popconfirm
                v-if="row.status === 'success' || row.status === 'completed'"
                title="确认删除该条知识？"
                @confirm="handleDeleteItem(row)"
              >
                <template #reference>
                  <el-button type="danger" size="small">删除</el-button>
                </template>
              </el-popconfirm>
              <el-button size="small" @click="toggleExpand(row.id)">
                {{ expandedId === row.id ? '收起' : '详情' }}
              </el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>

      <!-- 内联展开详情 -->
      <div
        v-if="expandedJob"
        class="border-t border-[var(--hairline)] bg-[var(--surface-1)] px-4 py-4"
      >
        <!-- 失败任务详情 -->
        <template v-if="expandedJob.status === 'failed'">
          <div class="flex items-center justify-between mb-3">
            <p class="text-sm font-medium text-[hsl(44,16%,88%)]">
              任务 #{{ expandedJob.id }}
              <span class="pill pill-failed ml-2"
                ><span class="dot" />失败</span
              >
            </p>
            <div class="flex gap-2">
              <el-button
                type="primary"
                size="small"
                @click="handleRetry(expandedJob)"
              >
                重试
              </el-button>
              <el-button size="small" @click="expandedId = null"
                >收起</el-button
              >
            </div>
          </div>

          <p class="text-[13px] text-[hsl(44,7%,47%)] mb-3">
            URL：<span class="text-[hsl(44,7%,67%)]">{{
              expandedJob.diagnostics?.url || '-'
            }}</span>
          </p>

          <div class="mb-3">
            <p
              class="text-xs font-medium text-[hsl(44,7%,50%)] mb-2 tracking-wide"
            >
              诊断信息
            </p>
            <div class="grid grid-cols-2 gap-x-6 gap-y-1.5 text-[13px]">
              <div class="flex justify-between">
                <span class="text-[hsl(44,7%,47%)]">页面快照</span>
                <span
                  :class="
                    expandedJob.diagnostics?.hasPageHtml
                      ? 'text-[hsl(157,40%,52%)]'
                      : 'text-[hsl(0,45%,52%)]'
                  "
                >
                  {{
                    expandedJob.diagnostics?.hasPageHtml ? '已收到' : '未收到'
                  }}
                </span>
              </div>
              <div class="flex justify-between">
                <span class="text-[hsl(44,7%,47%)]">快照大小</span>
                <span class="text-[hsl(44,7%,67%)] tabular-nums">
                  {{
                    expandedJob.diagnostics?.pageHtmlSize
                      ? (expandedJob.diagnostics.pageHtmlSize / 1024).toFixed(
                          1,
                        ) + ' KB'
                      : '-'
                  }}
                </span>
              </div>
              <div class="flex justify-between">
                <span class="text-[hsl(44,7%,47%)]">Cookie</span>
                <span
                  :class="
                    expandedJob.diagnostics?.cookieCount
                      ? 'text-[hsl(157,40%,52%)]'
                      : 'text-[hsl(44,7%,47%)]'
                  "
                  class="tabular-nums"
                >
                  {{ expandedJob.diagnostics?.cookieCount || 0 }} 个
                </span>
              </div>
              <div class="flex justify-between">
                <span class="text-[hsl(44,7%,47%)]">localStorage</span>
                <span
                  :class="
                    expandedJob.diagnostics?.localStorageKeyCount
                      ? 'text-[hsl(157,40%,52%)]'
                      : 'text-[hsl(44,7%,47%)]'
                  "
                  class="tabular-nums"
                >
                  {{ expandedJob.diagnostics?.localStorageKeyCount || 0 }} 项
                </span>
              </div>
              <div class="col-span-2 flex justify-between">
                <span class="text-[hsl(44,7%,47%)]">错误</span>
                <span class="text-[hsl(0,45%,55%)] text-right max-w-[320px]">
                  {{
                    expandedJob.error || expandedJob.diagnostics?.error || '-'
                  }}
                </span>
              </div>
            </div>
          </div>

          <div
            v-if="expandedJob.diagnostics?.suggestion"
            class="bg-[hsl(43,50%,8%)] border border-[var(--accent-gold-soft)] rounded p-3"
          >
            <p class="text-xs font-medium text-[hsl(43,60%,58%)] mb-1">
              建议操作
            </p>
            <p class="text-[13px] text-[hsl(44,16%,88%)]">
              {{ expandedJob.diagnostics.suggestion }}
            </p>
          </div>
        </template>

        <!-- 成功任务详情 -->
        <template
          v-else-if="
            expandedJob.status === 'success' ||
            expandedJob.status === 'completed'
          "
        >
          <div class="flex items-center justify-between mb-3">
            <p class="text-sm font-medium text-[hsl(44,16%,88%)]">
              任务 #{{ expandedJob.id }}
              <span class="pill pill-success ml-2"
                ><span class="dot" />成功</span
              >
            </p>
            <div class="flex gap-2">
              <el-button
                type="primary"
                size="small"
                @click="viewMarkdown(expandedJob)"
              >
                查看 Markdown
              </el-button>
              <el-popconfirm
                title="确认删除该条知识？"
                @confirm="handleDeleteItem(expandedJob)"
              >
                <template #reference>
                  <el-button type="danger" size="small">删除</el-button>
                </template>
              </el-popconfirm>
              <el-button size="small" @click="expandedId = null"
                >收起</el-button
              >
            </div>
          </div>

          <p class="text-[13px] text-[hsl(44,7%,50%)] mb-1">
            标题：<span class="text-[hsl(44,16%,88%)]">
              {{ expandedJob.diagnostics?.itemTitle || '-' }}
            </span>
          </p>
          <p class="text-[13px] text-[hsl(44,7%,47%)] mb-3">
            URL：<span class="text-[hsl(44,7%,67%)]">
              {{ expandedJob.diagnostics?.url || '-' }}
            </span>
          </p>

          <div>
            <p
              class="text-xs font-medium text-[hsl(44,7%,50%)] mb-2 tracking-wide"
            >
              内容信息
            </p>
            <div class="grid grid-cols-2 gap-x-6 gap-y-1.5 text-[13px]">
              <div class="flex justify-between">
                <span class="text-[hsl(44,7%,47%)]">Markdown 长度</span>
                <span class="text-[hsl(44,7%,67%)] tabular-nums">
                  {{
                    formatNumber(expandedJob.diagnostics?.markdownLength)
                  }}
                  字符
                </span>
              </div>
              <div class="flex justify-between">
                <span class="text-[hsl(44,7%,47%)]">HTML 长度</span>
                <span class="text-[hsl(44,7%,67%)] tabular-nums">
                  {{ formatNumber(expandedJob.diagnostics?.htmlLength) }} 字符
                </span>
              </div>
              <div class="flex justify-between">
                <span class="text-[hsl(44,7%,47%)]">采集时间</span>
                <span class="text-[hsl(44,7%,67%)] tabular-nums">
                  {{
                    expandedJob.diagnostics?.capturedAt
                      ? formatDate(expandedJob.diagnostics.capturedAt)
                      : '-'
                  }}
                </span>
              </div>
            </div>
          </div>
        </template>

        <!-- 进行中/等待中任务详情 -->
        <template v-else>
          <div class="flex items-center justify-between mb-3">
            <p class="text-sm font-medium text-[hsl(44,16%,88%)]">
              任务 #{{ expandedJob.id }}
              <span :class="statusPillClass(expandedJob.status)" class="ml-2">
                <span class="dot" />{{ statusLabel(expandedJob.status) }}
              </span>
            </p>
            <el-button size="small" @click="expandedId = null">收起</el-button>
          </div>
          <p class="text-[13px] text-[hsl(44,7%,47%)] mb-3">
            URL：<span class="text-[hsl(44,7%,67%)]">{{
              expandedJob.diagnostics?.url || '-'
            }}</span>
          </p>
          <div class="grid grid-cols-2 gap-x-6 gap-y-1.5 text-[13px]">
            <div class="flex justify-between">
              <span class="text-[hsl(44,7%,47%)]">页面快照</span>
              <span
                :class="
                  expandedJob.diagnostics?.hasPageHtml
                    ? 'text-[hsl(157,40%,52%)]'
                    : 'text-[hsl(44,7%,47%)]'
                "
              >
                {{ expandedJob.diagnostics?.hasPageHtml ? '已收到' : '未收到' }}
              </span>
            </div>
            <div class="flex justify-between">
              <span class="text-[hsl(44,7%,47%)]">Cookie</span>
              <span class="text-[hsl(44,7%,67%)] tabular-nums">
                {{ expandedJob.diagnostics?.cookieCount || 0 }} 个
              </span>
            </div>
          </div>
        </template>
      </div>

      <!-- 分页 -->
      <div class="px-4 py-3 border-t border-[var(--hairline)] flex justify-end">
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
    </div>

    <!-- 高级：手动 URL 采集（公开页面专用） -->
    <!-- <div class="mt-4 shrink-0">
      <el-button text size="small" @click="showManualCapture = !showManualCapture">
        {{ showManualCapture ? '收起' : '展开' }} 手动采集（仅限无需登录的公开页面）
      </el-button>
      <div v-show="showManualCapture" class="mt-3 bg-[var(--surface-2)] border border-[var(--hairline)] rounded-lg p-4 max-w-2xl">
        <p class="text-xs text-[hsl(44,7%,47%)] mb-3">
          此功能仅适用于无需登录的公开网页。需要登录、付费或订阅的内容请使用 Chrome 扩展采集。
        </p>
        <div class="flex gap-2 mb-3">
          <el-input
            v-model="manualUrl"
            placeholder="请输入公开网页 URL"
            size="default"
            clearable
          />
          <el-button
            type="primary"
            size="default"
            :loading="manualLoading"
            @click="handleManualCapture"
          >
            采集
          </el-button>
        </div>
        <el-collapse>
          <el-collapse-item title="认证设置（可选）">
            <div class="space-y-3 py-1">
              <div>
                <p class="text-xs text-[hsl(44,7%,47%)] mb-1">
                  localStorage — F12 Console 运行：
                  <code class="text-xs bg-[hsl(234,10%,14%)] px-1 rounded">copy(JSON.stringify(localStorage))</code>
                </p>
                <el-input
                  v-model="manualLocalStorage"
                  type="textarea"
                  :rows="3"
                  placeholder='{"token":"xxx",...}'
                />
              </div>
              <div>
                <p class="text-xs text-[hsl(44,7%,47%)] mb-1">Cookie（可选）</p>
                <el-input
                  v-model="manualCookies"
                  type="textarea"
                  :rows="2"
                  placeholder='[{"name":"session","value":"abc",...}]'
                />
              </div>
            </div>
          </el-collapse-item>
        </el-collapse>
      </div>
    </div> -->

    <!-- Markdown 查看弹窗 -->
    <el-dialog
      v-model="markdownVisible"
      :title="markdownTitle"
      width="800px"
      top="5vh"
    >
      <div
        v-if="markdownLoading"
        class="text-center text-[hsl(44,7%,47%)] py-10"
      >
        加载中...
      </div>
      <pre
        v-else
        class="whitespace-pre-wrap text-[13px] leading-relaxed max-h-[70vh] overflow-auto bg-[var(--surface-1)] p-5 rounded-lg text-[var(--text-primary)]"
        >{{ markdownContent }}</pre
      >
    </el-dialog>
  </div>
</template>

<style scoped>
/* ---- Stat cards (matching prototype .stat-card) ---- */
.stat-card {
  background: var(--surface-2);
  border: 1px solid var(--hairline);
  border-radius: 8px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stat-label {
  font-size: 11px;
  color: var(--text-muted);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.stat-value {
  font-family: 'Space Grotesk', system-ui, sans-serif;
  font-weight: 600;
  font-size: 24px;
}

.stat-sub {
  font-size: 11px;
  color: var(--text-secondary);
  font-family: 'JetBrains Mono', 'Consolas', monospace;
}

/* ---- Table wrapper ---- */
.table-wrap {
  background: var(--surface-2);
  border: 1px solid var(--hairline);
  border-radius: 8px;
  overflow: hidden;
}

/* ---- Table overrides ---- */
:deep(.capture-table) {
  background: transparent;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

:deep(.capture-table .el-table__inner-wrapper) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

:deep(.capture-table .el-table__body-wrapper) {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

:deep(.capture-row) {
  cursor: pointer;
}

:deep(.capture-table .el-table__header th) {
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

/* ---- Pagination ---- */
:deep(.el-pagination) {
  --el-text-color-regular: var(--text-secondary);
}
</style>
