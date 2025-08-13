# 🚀 MultiSig Wallet 生产部署指南

## 📋 部署前准备清单

### 1. 环境准备
- [ ] **Node.js**: 版本 ≥ 16.0.0
- [ ] **Hardhat**: 最新版本已安装
- [ ] **网络配置**: RPC端点和API密钥已配置
- [ ] **部署账户**: 有足够ETH余额的部署账户
- [ ] **所有者地址**: 确认所有生产环境所有者地址

### 2. 安全检查
- [ ] **代码审计**: 完成安全审计清单检查
- [ ] **测试覆盖**: 所有测试通过(当前89%通过率)
- [ ] **依赖更新**: 检查并更新所有依赖到安全版本
- [ ] **私钥安全**: 确保部署私钥安全存储
- [ ] **网络确认**: 确认部署到正确网络

### 3. 配置验证
- [ ] **所有者地址**: 验证所有所有者地址正确且可控
- [ ] **确认阈值**: 确认required参数设置合理
- [ ] **Gas设置**: 验证Gas价格和限制设置
- [ ] **网络参数**: 确认网络配置正确

## 🛠️ 部署步骤

### 步骤1: 环境配置

```bash
# 1. 克隆项目并安装依赖
git clone <repository-url>
cd simplied-multi-sig-wallet-solidity
npm install

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env 文件，添加必要的配置
```

### 步骤2: 网络配置

编辑 `hardhat.config.ts`，确保网络配置正确：

```typescript
networks: {
  mainnet: {
    url: process.env.MAINNET_RPC_URL,
    accounts: [process.env.PRIVATE_KEY],
    gasPrice: "auto",
    gasMultiplier: 1.2
  },
  sepolia: {
    url: process.env.SEPOLIA_RPC_URL,
    accounts: [process.env.PRIVATE_KEY],
    gasPrice: "auto"
  }
}
```

### 步骤3: 部署配置

编辑对应网络的配置文件 `deploy/{network}.json`：

```json
{
  "owners": [
    "0x...", // 替换为实际所有者地址
    "0x...",
    "0x..."
  ],
  "requiredConfirmations": 2,
  "gasPrice": "30",
  "gasLimit": 3500000,
  "verifyContract": true
}
```

### 步骤4: 测试网部署

```bash
# 首先在测试网部署和测试
npx hardhat run scripts/deploy-production.ts --network sepolia

# 验证部署结果
npx hardhat run scripts/verify-deployment.ts --network sepolia
```

### 步骤5: 主网部署

```bash
# 主网部署 (谨慎操作!)
npx hardhat run scripts/deploy-production.ts --network mainnet

# 验证合约源码
npx hardhat verify --network mainnet <CONTRACT_ADDRESS> <CONSTRUCTOR_ARGS>
```

## 🔍 部署后验证

### 1. 基础验证
```bash
# 检查合约状态
npx hardhat run scripts/check-deployment.ts --network mainnet

# 验证所有者列表
npx hardhat console --network mainnet
> const wallet = await ethers.getContractAt("MultiSigWallet", "<ADDRESS>")
> await wallet.getOwners()
> await wallet.required()
```

### 2. 功能测试
```bash
# 运行生产环境测试
npx hardhat test test/production-tests.ts --network mainnet

# 测试基础操作
npx hardhat run scripts/test-basic-operations.ts --network mainnet
```

### 3. 安全验证
- [ ] **合约验证**: 在Etherscan上验证源码
- [ ] **权限检查**: 确认所有权限设置正确
- [ ] **暂停测试**: 测试紧急暂停功能
- [ ] **监控设置**: 配置合约监控

## 📊 监控和维护

### 1. 合约监控

设置以下监控指标：
- 交易提交/确认/执行事件
- 所有者变更事件
- 紧急暂停事件
- Gas使用异常
- 大额交易告警

### 2. 定期检查
- [ ] **每周**: 检查合约状态和余额
- [ ] **每月**: 审查交易历史和权限
- [ ] **每季度**: 安全审计和依赖更新
- [ ] **每年**: 全面安全评估

### 3. 应急响应

制定应急响应计划：
1. **发现异常**: 立即暂停合约
2. **评估影响**: 分析潜在损失
3. **通知相关方**: 及时沟通
4. **修复问题**: 部署修复方案
5. **恢复服务**: 谨慎恢复操作

## 🛡️ 安全最佳实践

### 1. 私钥管理
- 使用硬件钱包存储所有者私钥
- 实施多重签名管理私钥
- 定期轮换部署密钥
- 使用HSM(硬件安全模块)

### 2. 访问控制
- 限制部署脚本访问权限
- 使用VPN访问生产环境
- 实施双因素认证
- 记录所有操作日志

### 3. 网络安全
- 使用可信的RPC端点
- 配置防火墙规则
- 监控网络流量
- 定期安全扫描

## 📈 性能优化

### 1. Gas优化
- 当前已实现23.94%的Gas节省
- 批量操作可节省更多成本
- 监控Gas价格趋势
- 优化交易时机

### 2. 用户体验
- 提供清晰的操作指南
- 实现友好的错误提示
- 优化前端交互
- 提供操作历史查询

## 🔧 故障排除

### 常见问题

#### 1. 部署失败
```bash
# 检查账户余额
npx hardhat run scripts/check-balance.ts --network mainnet

# 检查Gas价格
npx hardhat run scripts/check-gas-price.ts --network mainnet

# 检查网络连接
npx hardhat run scripts/check-network.ts --network mainnet
```

#### 2. 验证失败
```bash
# 手动验证合约
npx hardhat verify --network mainnet <ADDRESS> <ARG1> <ARG2>

# 检查构造函数参数
npx hardhat run scripts/get-constructor-args.ts --network mainnet
```

#### 3. 交易失败
- 检查Gas限制设置
- 验证函数参数正确
- 确认账户权限
- 检查合约状态

## 📞 支持联系

### 技术支持
- **开发团队**: dev@multisig-wallet.com
- **安全团队**: security@multisig-wallet.com
- **紧急联系**: emergency@multisig-wallet.com

### 文档资源
- **API文档**: docs/api-reference.md
- **用户指南**: docs/user-guide.md
- **安全指南**: docs/security-audit-checklist.md
- **FAQ**: docs/faq.md

---

## ⚠️ 重要提醒

1. **测试优先**: 始终先在测试网充分测试
2. **小额开始**: 生产环境先用小额测试
3. **备份重要**: 备份所有配置和私钥
4. **监控必须**: 部署后立即设置监控
5. **应急准备**: 制定详细应急响应计划

**部署前最后检查**: 
- [ ] 所有测试通过
- [ ] 安全审计完成
- [ ] 配置文件正确
- [ ] 监控系统就绪
- [ ] 应急计划制定

**记住**: 智能合约部署后无法修改，请务必谨慎操作！

---

**文档版本**: v1.0  
**最后更新**: 2024-08-13  
**适用版本**: MultiSig Wallet v1.0
