<template>
  <div class="dark flex min-h-full h-screen">
    <!-- 左侧品牌区 -->
    <div class="relative hidden lg:block flex-1">
      <div class="absolute inset-0 size-full dark:bg-[#070709]">
        <div class="login-background absolute top-0 left-0 size-full"></div>
        <div class="mr-20 h-full flex flex-col items-center justify-center">
          <img src="/peo.svg" alt="peo" class="w-2/5 h-64 animate-float" />
          <p class="text-2xl font-bold text-white mt-2">工具管理后台系统</p>
        </div>
      </div>
    </div>

    <!-- 右侧登录表单 -->
    <div
      class="relative flex flex-col items-center justify-center w-2/5 px-6 py-10 lg:flex-initial lg:px-8 dark:bg-background-deep"
    >
      <div class="mt-6 w-full sm:mx-auto md:max-w-md">
        <h2
          class="mb-3 text-3xl/9 font-bold tracking-tight text-foreground lg:text-4xl"
        >
          Welcome 登录
        </h2>
        <p class="mb-8 text-sm text-muted-foreground">
          请输入您的账号信息登录系统
        </p>

        <el-form
          ref="formRef"
          :model="form"
          :rules="rules"
          label-position="top"
          @submit.prevent="handleLogin"
        >
          <el-form-item prop="username">
            <el-input
              v-model="form.username"
              placeholder="请输入用户名"
              :prefix-icon="User"
              size="large"
              clearable
            />
          </el-form-item>

          <el-form-item prop="password">
            <el-input
              v-model="form.password"
              type="password"
              placeholder="请输入密码"
              :prefix-icon="Lock"
              size="large"
              show-password
              clearable
              @keyup.enter="handleLogin"
            />
          </el-form-item>

          <el-form-item>
            <div class="flex items-center justify-between w-full">
              <el-checkbox v-model="form.remember" label="记住密码" />
            </div>
          </el-form-item>

          <el-form-item>
            <el-button
              type="primary"
              size="large"
              class="w-full"
              :loading="loading"
              @click="handleLogin"
            >
              {{ loading ? '登录中...' : '登 录' }}
            </el-button>
          </el-form-item>
        </el-form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { User, Lock } from '@element-plus/icons-vue';
import type { FormInstance, FormRules } from 'element-plus';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '../../stores/auth';

const router = useRouter();
const authStore = useAuthStore();
const formRef = ref<FormInstance>();
const loading = ref(false);

const form = reactive({
  username: '',
  password: '',
  remember: false,
});

const rules: FormRules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    {
      min: 2,
      max: 32,
      message: '用户名长度在 2 到 32 个字符',
      trigger: 'blur',
    },
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, max: 32, message: '密码长度在 6 到 32 个字符', trigger: 'blur' },
  ],
};

async function handleLogin() {
  if (!formRef.value) return;

  const valid = await formRef.value.validate().catch(() => false);
  if (!valid) return;

  loading.value = true;
  try {
    await authStore.login({
      username: form.username,
      password: form.password,
    });

    if (form.remember) {
      localStorage.setItem('rememberedUser', form.username);
    } else {
      localStorage.removeItem('rememberedUser');
    }

    router.push('/');
  } catch (error: any) {
    const msg =
      error?.response?.data?.message || '登录失败，请检查用户名和密码';
    ElMessage.error(msg);
  } finally {
    loading.value = false;
  }
}

// 记住的用户名回填
const rememberedUser = localStorage.getItem('rememberedUser');
if (rememberedUser) {
  form.username = rememberedUser;
  form.remember = true;
}
</script>

<style scoped>
:deep(.el-input__wrapper) {
  background-color: hsl(var(--input-background));
  box-shadow: 0 0 0 1px hsl(var(--border)) inset;
}

:deep(.el-input__wrapper:hover) {
  box-shadow: 0 0 0 1px hsl(var(--border)) inset;
}

:deep(.el-input__inner) {
  color: hsl(var(--foreground));
}

:deep(.el-input__inner::placeholder) {
  color: hsl(var(--input-placeholder));
}

:deep(.el-checkbox__label) {
  color: hsl(var(--muted-foreground));
}

:deep(.el-form-item__label) {
  color: hsl(var(--foreground));
}
</style>
