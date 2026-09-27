const baseUrl = 'http://127.0.0.1:8080'
const testUsername = 'pc-ai-test-20260918@example.com'
const testPassword = 'AuralisPcTest#2026'
const deviceKey = 'codex-test-seed-20260918'

async function postJson(url, body, token) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`HTTP ${res.status} from ${url}: ${errorText}`)
  }
  return res.json()
}

async function run() {
  console.log(`1. Authenticating test account: ${testUsername}...`)
  let auth
  try {
    auth = await postJson(`${baseUrl}/api/auth/register`, {
      username: testUsername,
      password: testPassword,
      displayName: 'Auralis 时间轴测试账号',
      clientDeviceKey: deviceKey,
      deviceName: 'Codex 测试设备',
      platform: 'WINDOWS'
    })
    console.log('Registered successfully.')
  } catch (err) {
    console.log('Registration failed or user exists, attempting login...', err.message)
    auth = await postJson(`${baseUrl}/api/auth/login`, {
      username: testUsername,
      password: testPassword,
      clientDeviceKey: deviceKey,
      deviceName: 'Codex 测试设备',
      platform: 'WINDOWS'
    })
    console.log('Logged in successfully.')
  }

  const token = auth.tokens.accessToken
  console.log(`Authenticated as user ${auth.user.id}`)


  const subjects = [
    { name: '高等数学', description: '极限、微积分、线性代数与概率基础' },
    { name: '数据结构与算法', description: '复杂度、树、图、查找与排序' },
    { name: '计算机网络', description: 'TCP/IP、HTTP、路由与网络安全' },
    { name: '英语阅读', description: '学术阅读、词汇、长难句与写作素材' },
    { name: '数据库系统', description: '关系模型、SQL、索引、事务与并发' },
    { name: '操作系统', description: '进程、线程、内存、文件系统与并发控制' },
    { name: '编译原理', description: '词法分析、语法分析、语义检查与代码生成' },
    { name: '软件工程', description: '需求、设计、测试、版本控制与交付' },
    { name: '概率统计', description: '概率模型、随机变量、估计与假设检验' },
    { name: '机器学习基础', description: '特征、回归、分类、评估与过拟合' },
    { name: '信息安全', description: '身份认证、密码学、Web 安全与风险分析' },
    { name: '项目管理', description: '范围、进度、风险、协作与复盘' },
  ]

  console.log('2. Creating 12 subjects...')
  const subjectIds = {}
  for (let i = 0; i < subjects.length; i++) {
    const item = subjects[i]
    const data = await postJson(`${baseUrl}/api/subjects`, {
      baseVersion: 0,
      name: item.name,
      description: item.description,
      iconKey: 'book-open',
      sortKey: String(i).padStart(3, '0')
    }, token)
    subjectIds[item.name] = data.id
  }
  console.log('Created 12 subjects successfully.')

  const taskTemplates = [
    '整理本章核心概念并写出一页复习提纲',
    '完成一组基础练习并记录错误原因',
    '阅读资料，提取三个关键定义',
    '用自己的话解释一个容易混淆的知识点',
    '完成一次限时训练并复盘耗时',
    '整理公式、命令或 API 的使用边界',
    '对比两个相近概念并制作判断清单',
    '完成本周资料的阶段性总结',
    '回顾已完成内容并标记待复习部分',
    '整理取消任务的后续补做计划',
    '把本节内容改写成五道自测题',
    '找出一个反例并解释它为什么成立',
    '完成一次错题归因并提出改进动作',
    '整理本主题与前置知识的依赖关系',
    '用表格比较三种方案的优缺点',
    '完成一页术语卡片并标注易错点',
    '阅读一份补充资料并写出摘要',
    '对本周学习结果做一次自评',
    '准备一次三分钟口头讲解',
    '把知识点应用到一个小型案例',
  ]

  // 任务时长严格约束为整半小时（30、60、90、120 分钟），严禁 45 分钟或非整半小时任务
  const durations = [30, 60, 90, 120]
  // 时间轴有效可视窗口为每日 08:00 至 22:30；定义每日有效槽位列表，确保不注入到时间轴没有的位置（如凌晨或深夜）：
  const dailyTimeSlots = ['08:30', '10:30', '14:00', '16:00', '19:00', '21:00']

  console.log('3. Injecting 240 tasks (durations strictly multiples of 30m, 0 knowledge blocks)...')
  let taskCount = 0
  let scheduleSlotIndex = 0

  // Reference base date: today at 00:00:00 local time
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  for (let subjectIndex = 0; subjectIndex < subjects.length; subjectIndex++) {
    const subjectName = subjects[subjectIndex].name
    for (let taskIndex = 0; taskIndex < 20; taskIndex++) {
      let status = 'TODO'
      if (taskIndex >= 16 && taskIndex < 18) {
        status = 'DONE'
      } else if (taskIndex >= 18) {
        status = 'CANCELLED'
      } else if ((taskIndex + subjectIndex) % 7 === 0) {
        status = 'IN_PROGRESS'
      }

      let scheduledAt = null
      let dueAt = null

      if (taskIndex < 4) {
        // 每个学科 4 项排期（共 48 项），严格约束在时间轴有效可视范围（08:00~22:30）内，每天最多安排 6 个任务：
        const dayOffset = 1 + Math.floor(scheduleSlotIndex / dailyTimeSlots.length)
        const timeStr = dailyTimeSlots[scheduleSlotIndex % dailyTimeSlots.length]
        const [hours, minutes] = timeStr.split(':').map(Number)
        const targetDate = new Date(today)
        targetDate.setDate(today.getDate() + dayOffset)
        targetDate.setHours(hours, minutes, 0, 0)
        scheduledAt = targetDate.toISOString()
        scheduleSlotIndex++
      } else if (taskIndex >= 4 && taskIndex < 16) {
        // 每个学科 12 项待办（共 144 项未排期活跃任务）：
        // 其中奇数项设置未来截止日期（用于验证 DDL 徽标和到期提醒），偶数项 dueAt = null（无截止日期的纯待办任务）
        if (taskIndex % 2 === 1) {
          const dueDayOffset = 1 + ((taskIndex + subjectIndex) % 7)
          const targetDueDate = new Date(today)
          targetDueDate.setDate(today.getDate() + dueDayOffset)
          targetDueDate.setHours(20, 0, 0, 0)
          dueAt = targetDueDate.toISOString()
        }
      }

      const body = {
        baseVersion: 0,
        subjectId: subjectIds[subjectName],
        title: `${subjectName}：${taskTemplates[taskIndex]}`,
        description: `测试数据：${subjectName} 第 ${taskIndex + 1} 项学习任务，用于验证时间轴、状态筛选和任务详情。`,
        status,
        scheduledAt,
        dueAt,
        durationMinutes: durations[taskCount % durations.length],
        sortKey: String(taskCount).padStart(3, '0')
      }

      await postJson(`${baseUrl}/api/tasks`, body, token)
      taskCount++
    }
  }

  console.log(`Seeding complete: ${taskCount} tasks created (${scheduleSlotIndex} scheduled, ${taskCount - scheduleSlotIndex - 48} unscheduled active, 24 done, 24 cancelled).`)
}

run().catch((err) => {
  console.error('Error during seeding:', err.message || err)
  process.exit(1)
})
