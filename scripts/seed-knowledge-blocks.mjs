import crypto from 'crypto'

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

async function getJson(url, token) {
  const headers = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(url, { headers })
  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`HTTP ${res.status} from ${url}: ${errorText}`)
  }
  return res.json()
}

const KNOWLEDGE_CATALOG = {
  '高等数学': {
    blocks: [
      {
        title: '微积分基本定理 (Newton-Leibniz 公式)',
        summary: '建立了定积分与不定积分之间的核心桥梁，使得积分计算转化为寻找原函数。',
        content: `### 微积分基本定理 (Newton-Leibniz Formula)

设函数 $f(x)$ 在闭区间 $[a, b]$ 上连续，且 $F(x)$ 是 $f(x)$ 在 $[a, b]$ 上的一个原函数，则：

$$\\int_{a}^{b} f(x)\\,dx = F(b) - F(a)$$

#### 核心意义
1. **理论价值**：统一了微分学（切线与瞬时变化率）和积分学（曲边梯形面积与累积效应）；
2. **应用方法**：彻底避免了按黎曼和极限求解定积分的繁重运算。`,
        tags: ['高数', '微积分', '核心定理']
      },
      {
        title: '泰勒公式与展开定理 (Taylor Expansion)',
        summary: '用多项式函数逼近一般可导函数，广泛应用于误差分析与极限求解。',
        content: `### 泰勒公式 (Taylor's Formula)

若函数 $f(x)$ 在包含 $x_0$ 的某个开区间内具有直到 $n+1$ 阶导数，则对区间内任意 $x$：

$$f(x) = \\sum_{k=0}^{n} \\frac{f^{(k)}(x_0)}{k!}(x - x_0)^k + R_n(x)$$

#### 常见麦克劳林展开 ($x_0=0$)
- $e^x = 1 + x + \\frac{x^2}{2!} + \\cdots + \\frac{x^n}{n!} + o(x^n)$
- $\\sin x = x - \\frac{x^3}{3!} + \\frac{x^5}{5!} - \\cdots$
- $\\cos x = 1 - \\frac{x^2}{2!} + \\frac{x^4}{4!} - \\cdots$`,
        tags: ['高数', '级数', '近似计算']
      },
      {
        title: '拉格朗日中值定理与柯西中值定理',
        summary: '微分学的核心理论基石，联系局部导数特征与整体函数增量。',
        content: `### 微分中值定理体系

1. **罗尔定理**：连续、可导、端点值相等 $\\implies \\exists \\xi \\in (a, b), f'(\\xi) = 0$
2. **拉格朗日中值定理**：
   $$f(b) - f(a) = f'(\\xi)(b - a)$$
3. **柯西中值定理**：
   $$\\frac{f(b) - f(a)}{g(b) - g(a)} = \\frac{f'(\\xi)}{g'(\\xi)}$$`,
        tags: ['高数', '中值定理', '理论推导']
      },
      {
        title: '矩阵的秩与其几何意义',
        summary: '行向量组或列向量组的最大线性无关组容量，刻画线性映射的值域维度。',
        content: `### 矩阵的秩 (Rank of Matrix)

设 $A \\in \\mathbb{R}^{m \\times n}$：
- $\\text{rank}(A)$ 为矩阵行空间或列空间的维数；
- 满秩矩阵对应双射线性变换，行列式非零；
- 齐次线性方程组 $Ax = 0$ 的解空间维数为 $n - \\text{rank}(A)$。`,
        tags: ['线性代数', '矩阵秩', '空间维数']
      }
    ]
  },
  '数据结构与算法': {
    blocks: [
      {
        title: '红黑树五大核心性质与自平衡机制',
        summary: '自平衡二叉查找树，保证任意节点查找、插入与删除最坏时间复杂度为 O(log N)。',
        content: `### 红黑树 (Red-Black Tree) 五大不变式

1. **节点属性**：每个节点要么是红色，要么是黑色；
2. **根节点约束**：根节点必为黑色；
3. **叶子节点约束**：所有叶子节点（NIL 节点）均为黑色；
4. **红节点约束**：如果一个节点是红色，则其两个子节点必为黑色（不出现连续红节点）；
5. **黑高一致性**：从任意节点到其可达叶节点的每条简单路径上，黑色节点总数相同。`,
        tags: ['数据结构', '红黑树', '平衡二叉树']
      },
      {
        title: 'Dijkstra 单源最短路径算法与堆优化',
        summary: '贪心策略解决非负权图单源最短路径，二叉堆优化后复杂度达到 O((V+E)log V)。',
        content: `### Dijkstra 算法原理

- **核心思想**：维护已确定最短距离的点集 $S$ 和未确定点集 $V - S$，每次选取距离源点最近的未确定节点松弛其邻接边；
- **限制条件**：不能处理包含负权边的图（需使用 Bellman-Ford 或 SPFA）；
- **优化技巧**：使用优先队列（最小堆）存储候选节点及其暂定距离。`,
        tags: ['图论', '最短路径', '贪心算法']
      },
      {
        title: '动态规划：背包问题状态转移方程总览',
        summary: '0-1背包、完全背包与多重背包的状态定义与一维空间优化。',
        content: `### 常见背包问题状态转移

1. **0-1 背包**：每件物品最多选一次
   $$dp[j] = \\max(dp[j], dp[j - w_i] + v_i) \\quad (倒序遍历容量)$$
2. **完全背包**：每件物品可选无限次
   $$dp[j] = \\max(dp[j], dp[j - w_i] + v_i) \\quad (正序遍历容量)$$
3. **多重背包**：每件物品最多 $c_i$ 件，采用二进制拆分优化为 0-1 背包。`,
        tags: ['算法', '动态规划', '背包问题']
      },
      {
        title: '哈希表原理与冲突处理策略对比',
        summary: '开放寻址法（线性/二次探测）与链地址法的空间利用率与缓存局部性对比。',
        content: `### 哈希冲突解决策略

- **链地址法 (Chaining)**：在发生冲突的槽位维护单向链表或红黑树（如 Java HashMap），删除方便，对高负载容忍度好；
- **开放寻址法 (Open Addressing)**：所有元素存储在连续桶数组中，缓存局部性极佳，但高装载因子下集群效应严重；
- **一致性哈希 (Consistent Hashing)**：在分布式节点增删时最小化数据重分布。`,
        tags: ['数据结构', '哈希表', '冲突解决']
      }
    ]
  },
  '计算机网络': {
    blocks: [
      {
        title: 'TCP 三次握手与四次挥手全生命周期状态机',
        summary: '面向连接的可靠传输协议的连接建立、序列号同步与连接安全终止机制。',
        content: `### TCP 连接管理流程

#### 三次握手 (Handshake)
1. **客户端 $\\to$ 服务端**：\`SYN=1, seq=x\` $\\to$ 客户端进入 \`SYN_SENT\`
2. **服务端 $\\to$ 客户端**：\`SYN=1, ACK=1, seq=y, ack=x+1\` $\\to$ 服务端进入 \`SYN_RCVD\`
3. **客户端 $\\to$ 服务端**：\`ACK=1, seq=x+1, ack=y+1\` $\\to$ 双方进入 \`ESTABLISHED\`

#### 四次挥手 (Teardown)
- 客户端发送 \`FIN\` 并进入 \`FIN_WAIT_1\`；
- 服务端回复 \`ACK\` 进入 \`CLOSE_WAIT\`，客户端收到后进入 \`FIN_WAIT_2\`；
- 服务端完成数据发送，发送 \`FIN\` 并进入 \`LAST_ACK\`；
- 客户端回复 \`ACK\`，进入 **TIME_WAIT (2MSL)** 后彻底关闭连接。`,
        tags: ['计算机网络', 'TCP/IP', '状态机']
      },
      {
        title: 'HTTPS 与 TLS 1.3 握手流程深度剖析',
        summary: '结合非对称加密与对称加密，实现 1-RTT 甚至 0-RTT 的端到端安全通信通道。',
        content: `### TLS 1.3 关键改进与流程

- **1-RTT 快速握手**：客户端在 ClientHello 中直接预测支持的密钥交换算法（ECDHE）并附带公钥份额；
- **弃用不安全算法**：移除了 RSA 密钥交换（不具备前向安全 PFS）、RC4、SHA-1 与 CBC 模式；
- **AEAD 认证加密**：强制使用带关联数据的认证加密（如 AES-GCM, ChaCha20-Poly1305）。`,
        tags: ['信息安全', '网络协议', 'TLS']
      },
      {
        title: 'TCP 拥塞控制四大算法 (RFC 5681)',
        summary: '慢启动、拥塞避免、快重传与快恢复的运行机制与拥塞窗口动态演进。',
        content: `### 拥塞控制经典机制

1. **慢启动 (Slow Start)**：$cwnd < ssthresh$ 时，每收到一个 ACK，cwnd 指数翻倍；
2. **拥塞避免 (Congestion Avoidance)**：$cwnd \\ge ssthresh$ 时，加法增大，每个 RTT 增加 1 MSS；
3. **快重传 (Fast Retransmit)**：收到 3 个连续冗余 ACK 时，立即重传缺失段，无需等待 RTO 超时；
4. **快恢复 (Fast Recovery)**：将 ssthresh 减半并进入线性恢复，避免直接重置回 1 MSS。`,
        tags: ['TCP', '流控与拥塞', '算法']
      }
    ]
  },
  '数据库系统': {
    blocks: [
      {
        title: 'ACID 特性与事务隔离级别深度对照',
        summary: '脏读、不可重复读、幻读的定义与读未提交、读已提交、可重复读、串行化标准。',
        content: `### 事务 ACID 语义与隔离级别

- **Atomicity (原子性)**：Undo Log 保障，事务操作要么全完成，要么全回滚；
- **Consistency (一致性)**：应用与数据库约束协同维持；
- **Isolation (隔离性)**：锁机制与 MVCC 保障；
- **Durability (持久性)**：Redo Log (WAL) 保证崩溃安全。

| 隔离级别 | 脏读 | 不可重复读 | 幻读 |
| :--- | :---: | :---: | :---: |
| 读未提交 (Read Uncommitted) | 存在 | 存在 | 存在 |
| 读已提交 (Read Committed) | 无 | 存在 | 存在 |
| 可重复读 (Repeatable Read) | 无 | 无 | 存在(MySQL通过间隙锁避免) |
| 可串行化 (Serializable) | 无 | 无 | 无 |`,
        tags: ['数据库', '事务', '并发控制']
      },
      {
        title: 'B+ 树索引原理与覆盖索引优化',
        summary: '多路平衡搜索树结构为何远优于 B 树、哈希与红黑树作为磁盘存储索引。',
        content: `### 为什么数据库存储引擎青睐 B+ 树？

1. **高扇出低树高**：通常 3~4 层即可存储上千万行数据，显著减少磁盘 I/O 次数；
2. **叶子节点双向链表**：非常高效地支持范围查询（Range Scan）与分页；
3. **非叶节点仅存索引键**：单个磁盘页（如 16KB）能容纳更多路由项；
4. **覆盖索引 (Covering Index)**：查询字段全在辅助索引中，无需发生“回表”查聚簇索引。`,
        tags: ['存储引擎', 'B+树', '索引优化']
      },
      {
        title: 'MVCC 多版本并发控制与 ReadView 原理',
        summary: '读写互不阻塞的核心支撑：隐藏列（DB_TRX_ID, DB_ROLL_PTR）与版本链比对逻辑。',
        content: `### MySQL InnoDB MVCC 实现机制

- **记录隐藏字段**：
  - \`DB_TRX_ID\`：最近修改或插入该行的事务 ID；
  - \`DB_ROLL_PTR\`：指向 undo log 中上一个旧版本的指针；
- **ReadView 关键属性**：
  - \`m_ids\`：生成 ReadView 时当前活跃未提交事务列表；
  - \`min_trx_id\` / \`max_trx_id\`：活跃事务最小与预分配下一个事务 ID；
- **可见性判断**：已提交事务修改可见，正在执行或未来的事务修改不可见。`,
        tags: ['MySQL', 'MVCC', '并发架构']
      }
    ]
  },
  '操作系统': {
    blocks: [
      {
        title: '虚拟内存管理与多级页表机制',
        summary: 'MMU 地址翻译、TLB 快表加速与多级页表如何极大压缩空闲虚拟地址空间的内存开销。',
        content: `### 虚拟内存与地址映射

- **分页机制**：将虚拟地址划分为虚拟页号 (VPN) 和页内偏移 (Offset)；
- **多级页表优势**：不需要为未映射的巨大稀疏地址空间连续分配页表物理内存；
- **TLB (Translation Lookaside Buffer)**：硬件快表缓存高频 VPN $\\to$ PPN 映射，未命中时触发硬件 Page Table Walk 或缺页异常 (Page Fault)。`,
        tags: ['操作系统', '虚拟内存', '分页机制']
      },
      {
        title: '进程状态模型、上下文切换与调度算法',
        summary: '就绪、运行、阻塞状态流转，内核态保存寄存器现场与 CFS 完全公平调度器。',
        content: `### 进程上下文切换核心开销

1. **直接开销**：保存和恢复 CPU 寄存器（PC, SP, 通用寄存器）、切换页表基址寄存器（CR3）；
2. **间接开销**：TLB 缓存失效刷新、CPU L1/L2 Cache 局部性破坏导致短期 Cache Miss 激增；
3. **Linux CFS 调度**：基于红黑树组织进程，追踪 \`vruntime\`（虚拟运行时间），调度最饥饿的任务。`,
        tags: ['进程管理', '上下文切换', '调度器']
      },
      {
        title: '死锁的四个必要条件与银行家算法',
        summary: '互斥、占有且等待、不可抢占、循环等待条件，死锁预防、避免与检测。',
        content: `### 死锁发生的 Coffman 四大必要条件

1. **互斥 (Mutual Exclusion)**：资源不能同时被多个进程占用；
2. **占有并等待 (Hold and Wait)**：进程持有一个资源同时等待新资源；
3. **不可抢占 (No Preemption)**：已被持有的资源不能被强行剥夺；
4. **循环等待 (Circular Wait)**：存在包含各进程首尾相接的闭环等待链。`,
        tags: ['并发安全', '死锁', '算法']
      }
    ]
  },
  '软件工程': {
    blocks: [
      {
        title: 'SOLID 面向对象设计五大原则',
        summary: 'SRP单一职责、OCP开闭原则、LSP里氏替换、ISP接口隔离、DIP依赖倒置。',
        content: `### SOLID 原则精要

- **S (Single Responsibility)**：一个类应当仅因单一原因而变更；
- **O (Open/Closed)**：对扩展开放，对修改关闭；
- **L (Liskov Substitution)**：子类必须能替换其基类且保持程序正确性；
- **I (Interface Segregation)**：客户端不应被迫依赖它们不使用的接口；
- **D (Dependency Inversion)**：高层模块不应依赖低层模块，二者均应依赖抽象。`,
        tags: ['软件工程', '设计模式', 'SOLID']
      },
      {
        title: '领域驱动设计 (DDD) 核心战术模式',
        summary: '实体 (Entity)、值对象 (Value Object)、聚合根 (Aggregate Root) 与领域事件。',
        content: `### DDD 战术模式体系

1. **实体 (Entity)**：拥有唯一全局身份标识，状态随生命周期持续改变；
2. **值对象 (Value Object)**：无身份标识，仅由其属性描述，不可变对象；
3. **聚合根 (Aggregate Root)**：事务与一致性边界的唯一访问入口，保护内部不变量；
4. **仓储 (Repository)**：模拟领域对象集合在内存中的持久化抽象。`,
        tags: ['架构设计', 'DDD', '领域建模']
      }
    ]
  },
  '信息安全': {
    blocks: [
      {
        title: '现代身份认证：OAuth 2.0 与 JWT 架构最佳实践',
        summary: '授权码模式（PKCE 增强）与非对称签名 JWT 无状态 Token 验证。',
        content: `### OAuth 2.0 + JWT 架构要点

- **授权码流程 (Authorization Code with PKCE)**：移动端与 SPA 避免客户端密钥泄露的行业标准；
- **JWT 结构**：\`Header.Payload.Signature\`，服务端使用公钥校验验签，无需查库；
- **安全防范**：
  - 避免将敏感数据存入 Payload（Base64 仅编码未加密）；
  - 设置合理的 Access Token 有效期（如 15 分钟），配合 Refresh Token 轮转机制。`,
        tags: ['信息安全', 'OAuth2', 'JWT']
      },
      {
        title: '常见 Web 漏洞与纵深防御方案 (OWASP Top 10)',
        summary: 'SQL 注入预编译、XSS 输入过滤与 CSP 策略、CSRF SameSite Cookie 防护。',
        content: `### 核心漏洞防御规范

1. **SQL 注入**：严禁字符串拼接 SQL，强制采用参数化预编译查询 (PreparedStatement)；
2. **XSS 跨站脚本**：对用户输入执行严格 HTML 实体编码或采用 DOMPurify 净化，配置 Content-Security-Policy (CSP)；
3. **CSRF 跨站请求伪造**：Cookie 启用 \`SameSite=Lax/Strict\`，关键接口附带 Anti-CSRF Token。`,
        tags: ['Web安全', 'OWASP', '漏洞防御']
      }
    ]
  },
  '编译原理': {
    blocks: [
      {
        title: '词法分析与有限自动机 (DFA 与 NFA)',
        summary: '正则表达式转化为非确定有限自动机 (Thompson 算法) 与子集构造法转化为确定自动机。',
        content: `### 词法分析核心理论

- **正规表达式 (Regex)** $\\xrightarrow{\\text{Thompson 算法}}$ **NFA**；
- **子集构造法 (Subset Construction)**：消除 $\\epsilon$ 转移，将 NFA 转化为等价的 **DFA**；
- **Hopcroft 算法**：对 DFA 进行状态最小化化简，得到最紧凑的词法分析状态跳转表。`,
        tags: ['编译原理', '自动机', '词法分析']
      },
      {
        title: 'LLVM 架构与中间表示 (LLVM IR)',
        summary: '静态单赋值形式 (SSA)、三段式编译器架构与现代优化流水线。',
        content: `### LLVM 现代编译器架构

- **三段式架构**：前端（Clang/Rustc）$\\to$ 统一优化器（LLVM Opt）$\\to$ 目标后端（x86/ARM/Wasm）；
- **SSA 形式**：每个变量仅被赋值一次，大幅简化数据流分析（如死代码消除、常量传播）；
- **Phi 节点**：在控制流汇合点解决不同分支赋值歧义。`,
        tags: ['LLVM', '编译器', 'IR代码优化']
      }
    ]
  },
  '英语阅读': {
    blocks: [
      {
        title: '学术长难句五大核心破题结构',
        summary: '拆解分隔定语从句、分词短语作状语、同位语从句与倒装句型。',
        content: `### 学术英语长难句剖析法

1. **抓主干**：迅速过滤括号、插入语、多重介词短语，锁定核心“主-谓-宾”；
2. **识从句标志词**：which/that 引导的限制与非限制性定语从句；
3. **识别独立主格结构**：名词 + 分词短语构成伴随状语；
4. **否定倒装与强调结构**：\`Not only... but also...\`, \`It is ... that ...\`。`,
        tags: ['英语学习', '长难句', '学术阅读']
      },
      {
        title: '学术论文 IMRAD 经典架构与阅读策略',
        summary: 'Introduction、Methods、Results、And Discussion 模块功能与高效精读路径。',
        content: `### IMRAD 论文阅读方法论

- **Introduction (引言)**：研究背景、既有文献局限、本研究核心假设；
- **Methods (方法)**：实验设计与数据来源，用于验证研究的可重复性；
- **Results (结果)**：图表与统计分析，聚焦主要发现；
- **Discussion (讨论)**：研究意义、反常结果解释、潜在局限性及未来展望。`,
        tags: ['学术写作', '论文结构', '阅读方法']
      }
    ]
  },
  '机器学习基础': {
    blocks: [
      {
        title: '过拟合与欠拟合的成因与正则化对策',
        summary: '模型复杂度、样本数量、L1 Lasso 稀疏性与 L2 Ridge 权重衰减原理。',
        content: `### 偏差-方差权衡 (Bias-Variance Tradeoff)

- **欠拟合 (高偏差)**：模型表达能力不足，需增加特征维度或改用更复杂模型；
- **过拟合 (高方差)**：在训练集表现极佳但在验证集急剧恶化；
- **正则化应对**：
  - **L1 正则 (Lasso)**：惩罚项 $\\lambda \\sum |w_i|$，诱导参数稀疏化，可用于特征选择；
  - **L2 正则 (Ridge)**：惩罚项 $\\frac{\\lambda}{2} \\sum w_i^2$，平滑权重，防止单一特征权重过大。`,
        tags: ['机器学习', '正则化', '偏差方差']
      },
      {
        title: '分类模型综合评估指标体系',
        summary: '混淆矩阵、准确率 (Accuracy)、精确率 (Precision)、召回率 (Recall)、F1-Score 与 ROC-AUC。',
        content: `### 混淆矩阵与核心指标

- **精确率 (Precision)**：$TP / (TP + FP)$ —— 预测为正例中真正为正的比例；
- **召回率 (Recall)**：$TP / (TP + FN)$ —— 所有真实正例中被召回的比例；
- **F1-Score**：精确率与召回率的调和平均数：$2 \\times \\frac{P \\times R}{P + R}$；
- **ROC-AUC**：以假正率 (FPR) 为横轴，真正率 (TPR) 为纵轴绘制曲线，对不平衡样本鲁棒。`,
        tags: ['机器学习', '评估指标', '模型评价']
      }
    ]
  },
  '概率统计': {
    blocks: [
      {
        title: '全概率公式与贝叶斯定理 (Bayes Theorem)',
        summary: '先验概率与后验概率的转化，现代统计推断与朴素贝叶斯算法的基础。',
        content: `### 贝叶斯公式与逆概率计算

设 $A_1, A_2, \\dots, A_n$ 为样本空间的一个划分：

$$P(A_i | B) = \\frac{P(A_i) P(B | A_i)}{\\sum_{j=1}^{n} P(A_j) P(B | A_j)}$$

- $P(A_i)$：**先验概率** (Prior Probability)；
- $P(B | A_i)$：**似然度** (Likelihood)；
- $P(A_i | B)$：**后验概率** (Posterior Probability)。`,
        tags: ['概率论', '贝叶斯', '统计推断']
      },
      {
        title: '中心极限定理与大数定律的工程直觉',
        summary: '独立同分布随机变量序列和的极限分布收敛于正态分布的条件与意义。',
        content: `### 极限定理的核心意义

1. **辛钦大数定律**：样本均值依概率收敛于总体数学期望 $\\bar{X}_n \\xrightarrow{P} \\mu$；
2. **Lindeberg-Lévy 中心极限定理**：
   $$\\frac{\\sum_{i=1}^n X_i - n\\mu}{\\sigma \\sqrt{n}} \\xrightarrow{d} N(0, 1)$$
   大量微小独立随机扰动的总效应近似服从正态分布。`,
        tags: ['概率论', '中心极限', '正态分布']
      }
    ]
  },
  '项目管理': {
    blocks: [
      {
        title: '关键路径法 (CPM) 与进度网络分析',
        summary: '计算活动最早/最迟开始与结束时间，识别对总工期有决定性影响的关键路径。',
        content: `### 关键路径法 (Critical Path Method)

- **总浮动时间 (Total Float)**：在不延误总工期前提下，活动允许推迟的最大时间：\`LS - ES\` 或 \`LF - EF\`；
- **自由浮动时间 (Free Float)**：在不影响任何紧后活动最早开始的前提下允许推迟的时间；
- **关键路径**：总浮动时间为 0 的活动序列，是网络图中持续时间最长的一条路径。`,
        tags: ['项目管理', 'CPM', '敏捷开发']
      },
      {
        title: '敏捷 Scrum 框架的核心角色、工件与事件',
        summary: '3-3-5 结构：产品负责人、Scrum Master、开发团队；Backlog 与增量；规划、站会、评审与复盘。',
        content: `### Scrum 敏捷协同框架

- **三大角色**：Product Owner (定义做什么), Scrum Master (流程教练), Developers (如何做)；
- **三大工件**：Product Backlog, Sprint Backlog, Product Increment；
- **五大事件**：Sprint Planning (排期), Daily Scrum (15分钟站会), Sprint Review (成果演示), Sprint Retrospective (流程改进), Sprint 迭代本身。`,
        tags: ['项目管理', 'Scrum', '敏捷实践']
      }
    ]
  }
}

async function main() {
  console.log(`1. Authenticating as ${testUsername}...`)
  const auth = await postJson(`${baseUrl}/api/auth/login`, {
    username: testUsername,
    password: testPassword,
    clientDeviceKey: deviceKey,
    deviceName: 'Codex 测试设备',
    platform: 'WINDOWS'
  })
  const token = auth.tokens.accessToken
  console.log(`Authenticated as ${auth.user.id}`)

  console.log('2. Fetching subjects...')
  const subjectListRes = await getJson(`${baseUrl}/api/subjects`, token)
  const subjectMap = new Map(subjectListRes.items.map((s) => [s.name, s.id]))
  console.log(`Found ${subjectMap.size} subjects.`)

  let totalBlocks = 0

  for (const [subjectName, catalog] of Object.entries(KNOWLEDGE_CATALOG)) {
    const subjectId = subjectMap.get(subjectName)
    if (!subjectId) {
      console.warn(`Subject not found in DB: ${subjectName}`)
      continue
    }

    console.log(`\n=== Processing [${subjectName}] (${subjectId}) ===`)
    for (const blk of catalog.blocks) {
      console.log(`  Creating KnowledgeBlock: ${blk.title}`)
      await postJson(`${baseUrl}/api/knowledge-blocks`, {
        baseVersion: 0,
        subjectId,
        sourceId: null,
        title: blk.title,
        summary: blk.summary,
        content: blk.content,
        tags: blk.tags,
        colorOverride: null
      }, token)
      totalBlocks++
    }
  }

  console.log(`\n========================================`)
  console.log(`Seeding complete!`)
  console.log(`Created ${totalBlocks} Knowledge Blocks (0 fake files/sources).`)
  console.log(`========================================`)
}

main().catch((err) => {
  console.error('Seeding failed:', err.message || err)
  process.exit(1)
})

