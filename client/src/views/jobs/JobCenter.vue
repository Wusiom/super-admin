<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { ElMessage } from 'element-plus';
import { fetchJobs, retryJob, type JobInfo } from '../../api/jobs';
import { fetchTools, type ToolInfo } from '../../api/tools';

const jobs = ref<JobInfo[]>([]);
const tools = ref<ToolInfo[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(10);
const loading = ref(false);

const filterToolKey = ref('');
const filterStatus = ref('');
let pollTimer: ReturnType<typeof setInterval> | null = null;

function hasRunningOrPending() {
    return jobs.value.some(
        j => j.status === 'pending' || j.status === 'running',
    );
}

async function loadJobs() {
    loading.value = true;
    try {
        const params: Record<string, string | number> = {
            page: page.value,
            pageSize: pageSize.value,
        };
        if (filterToolKey.value) params.toolKey = filterToolKey.value;
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

async function loadTools() {
    try {
        const { data } = await fetchTools();
        tools.value = data;
    } catch {
        /* 静默失败 */
    }
}

function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(() => {
        if (hasRunningOrPending()) {
            loadJobs();
        }
    }, 3000);
}

function stopPolling() {
    if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
    }
}

function onFilterChange() {
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

async function handleRetry(row: JobInfo) {
    try {
        await retryJob(row.id);
        ElMessage.success('已重新入队');
        loadJobs();
    } catch (e: any) {
        ElMessage.error('重试失败');
    }
}

function statusType(status: string): 'info' | '' | 'success' | 'danger' {
    const map: Record<string, 'info' | '' | 'success' | 'danger'> = {
        pending: 'info',
        running: '',
        active: '',
        success: 'success',
        completed: 'success',
        failed: 'danger',
    };
    return map[status] || 'info';
}

function statusLabel(status: string): string {
    const map: Record<string, string> = {
        pending: '等待中',
        running: '运行中',
        active: '运行中',
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

onMounted(() => {
    loadJobs();
    loadTools();
    startPolling();
});

onUnmounted(stopPolling);
</script>

<template>
    <div>
        <h2 class="text-xl font-semibold mb-4">任务中心</h2>

        <!-- 筛选栏 -->
        <div class="flex gap-3 mb-4">
            <el-select
                v-model="filterToolKey"
                placeholder="按工具筛选"
                clearable
                @change="onFilterChange"
                class="w-44"
            >
                <el-option
                    v-for="t in tools"
                    :key="t.key"
                    :label="t.name"
                    :value="t.key"
                />
            </el-select>
            <el-select
                v-model="filterStatus"
                placeholder="按状态筛选"
                clearable
                @change="onFilterChange"
                class="w-36"
            >
                <el-option label="等待中" value="pending" />
                <el-option label="运行中" value="running" />
                <el-option label="成功" value="completed" />
                <el-option label="失败" value="failed" />
            </el-select>
        </div>

        <!-- 任务表格 -->
        <el-table :data="jobs" v-loading="loading" stripe>
            <el-table-column prop="toolKey" label="工具" width="140" />
            <el-table-column label="状态" width="100">
                <template #default="{ row }">
                    <el-tag :type="statusType(row.status)" size="small">
                        {{ statusLabel(row.status) }}
                    </el-tag>
                </template>
            </el-table-column>
            <el-table-column label="创建时间" width="180">
                <template #default="{ row }">
                    {{ formatDate(row.createdAt) }}
                </template>
            </el-table-column>
            <el-table-column label="错误信息" min-width="200">
                <template #default="{ row }">
                    <template v-if="row.error">
                        <el-tooltip
                            :content="row.error"
                            placement="top"
                            :show-after="300"
                        >
                            <span
                                class="text-red-500 truncate block max-w-xs cursor-help"
                                >{{ row.error }}</span
                            >
                        </el-tooltip>
                    </template>
                    <span v-else class="text-gray-400">-</span>
                </template>
            </el-table-column>
            <el-table-column label="操作" width="100" fixed="right">
                <template #default="{ row }">
                    <el-button
                        v-if="row.status === 'failed'"
                        type="primary"
                        size="small"
                        @click="handleRetry(row)"
                    >
                        重试
                    </el-button>
                    <span v-else class="text-gray-400">-</span>
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
    </div>
</template>
