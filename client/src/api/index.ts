import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
})

api.interceptors.response.use(
  (res) => res,
  (error) => {
    const msg = error.response?.data?.message || error.message || '请求失败'
    // 可在此处接入 toast 通知
    console.error('[API Error]', msg)
    return Promise.reject(error)
  },
)

export default api
