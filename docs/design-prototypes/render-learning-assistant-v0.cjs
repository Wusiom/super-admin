const { chromium } = require('playwright')
const path = require('node:path')

async function main() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  })

  const prototypePath = path.join(__dirname, 'learning-assistant-v0.html')
  const browserProblems = []
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') browserProblems.push(`${message.type()}: ${message.text()}`)
  })
  page.on('pageerror', (error) => browserProblems.push(`pageerror: ${error.message}`))
  await page.goto(`file:///${prototypePath.replace(/\\/g, '/')}`)
  await page.waitForTimeout(250)

  const views = [
    ['auth', 'auth-flow-v0.png', 'user'],
    ['home', 'learning-home-v0.png', 'user'],
    ['source', 'source-detail-v0.png', 'user'],
    ['contract', 'learning-contract-v0.png', 'user'],
    ['session', 'focus-session-v0.png', 'user'],
    ['report', 'learning-report-v0.png', 'user'],
    ['notes', 'atomic-notes-v0.png', 'user'],
    ['profile', 'learner-profile-v0.png', 'user'],
    ['admin', 'platform-admin-v0.png', 'admin'],
    ['users', 'admin-users-v0.png', 'admin'],
    ['tools', 'admin-tools-v0.png', 'admin'],
    ['models', 'admin-models-v0.png', 'admin'],
    ['quotas', 'admin-quotas-v0.png', 'admin'],
    ['jobs', 'admin-jobs-v0.png', 'admin'],
    ['audit', 'admin-audit-v0.png', 'admin'],
  ]

  for (const [screen, filename, role] of views) {
    await page.evaluate(({ name, screenRole }) => {
      window.setRole(screenRole)
      window.setUiState('default')
      window.setScreen(name)
      document.getElementById('prototypeControls').classList.add('collapsed')
    }, { name: screen, screenRole: role })
    const uiState = await page.evaluate(() => ({
      brand: document.querySelector('.brand span').textContent,
      topTitle: document.getElementById('topTitle').textContent,
      sidebarWidth: document.querySelector('.sidebar').getBoundingClientRect().width,
      activeScreen: document.querySelector('.screen.active').id,
    }))
    console.log(screen, uiState)
    await page.screenshot({ path: path.join(__dirname, filename), fullPage: false })
  }

  await page.evaluate(() => {
    window.setRole('user')
    window.setScreen('home')
    window.openModal('import')
  })
  await page.screenshot({ path: path.join(__dirname, 'import-material-v0.png'), fullPage: false })
  await page.evaluate(() => {
    window.closeModal(null, 'import')
    window.setScreen('session')
    window.submitAnswer()
  })
  await page.screenshot({ path: path.join(__dirname, 'session-feedback-v0.png'), fullPage: false })

  const interactionChecks = await page.evaluate(() => {
    window.setRole('user')
    window.setScreen('home')
    const adminHiddenForUser = getComputedStyle(document.querySelector('[data-nav="admin"]')).display === 'none'
    window.setUiState('error')
    const errorStateVisible = getComputedStyle(document.getElementById('uiStateBanner')).display === 'grid'
    window.setUiState('default')
    window.setRole('admin')
    window.setScreen('users')
    const adminVisibleForAdmin = getComputedStyle(document.querySelector('[data-nav="admin"]')).display !== 'none'
    return { adminHiddenForUser, adminVisibleForAdmin, errorStateVisible }
  })
  if (Object.values(interactionChecks).some((passed) => !passed)) {
    throw new Error(`Interaction check failed: ${JSON.stringify(interactionChecks)}`)
  }
  console.log('interaction-checks', interactionChecks)

  if (browserProblems.length) throw new Error(`Browser problems:\n${browserProblems.join('\n')}`)

  await browser.close()
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
