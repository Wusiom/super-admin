import { defineStore } from 'pinia'
import { ref } from 'vue'
import { fetchTools, type ToolInfo } from '../api/tools'

export const useToolsStore = defineStore('tools', () => {
  const tools = ref<ToolInfo[]>([])
  const loading = ref(false)

  async function load() {
    loading.value = true
    try {
      const { data } = await fetchTools()
      tools.value = data
    } finally {
      loading.value = false
    }
  }

  return { tools, loading, load }
})
