import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { loginApi, getUserInfoApi, type LoginParams } from '../api/auth'
import { ElMessage } from 'element-plus'

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string>(localStorage.getItem('token') || '')
  const user = ref<{ id: number; username: string; avatar?: string } | null>(null)

  const isLoggedIn = computed(() => !!token.value)

  async function login(params: LoginParams) {
    const { data } = await loginApi(params)
    token.value = data.token
    localStorage.setItem('token', data.token)
    user.value = data.user
    ElMessage.success('登录成功')
  }

  async function fetchUserInfo() {
    try {
      const { data } = await getUserInfoApi()
      user.value = data
    } catch {
      logout()
    }
  }

  function logout() {
    token.value = ''
    user.value = null
    localStorage.removeItem('token')
  }

  return { token, user, isLoggedIn, login, fetchUserInfo, logout }
})
