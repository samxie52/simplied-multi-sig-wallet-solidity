# 🌐 GitHub Pages 设置指南

## 📋 概述

本指南将帮助您在GitHub Pages上部署MultiSig Wallet的交互式演示页面，使任何人都可以通过浏览器直接访问测试网交互功能。

## 🚀 快速设置

### 1. 启用GitHub Pages

1. **进入仓库设置**
   - 访问您的GitHub仓库
   - 点击 `Settings` 标签页
   - 在左侧菜单中找到 `Pages`

2. **配置Pages源**
   - 在 `Source` 部分选择 `GitHub Actions`
   - 这将使用我们提供的 `.github/workflows/pages.yml` 配置

3. **保存设置**
   - GitHub将自动开始构建和部署过程
   - 通常需要几分钟时间完成

### 2. 访问演示页面

部署完成后，您可以通过以下URL访问演示页面：

```
https://YOUR_USERNAME.github.io/YOUR_REPO_NAME/interactive-test.html    # 测试网演示
https://YOUR_USERNAME.github.io/YOUR_REPO_NAME/interactive-demo.html    # 本地演示
https://YOUR_USERNAME.github.io/YOUR_REPO_NAME/offline-demo.html        # 离线演示
```

**示例URL**:
```
https://samxie.github.io/simplified-multi-sig-wallet-solidity/interactive-test.html
```

## 🔧 配置测试网演示

### 更新合约地址

在部署合约到Sepolia测试网后，需要更新 `interactive-test.html` 中的合约地址：

1. **获取部署地址**
   ```bash
   # 部署后查看部署信息
   cat deployment-sepolia.json
   ```

2. **更新HTML文件**
   - 编辑 `docs/interactive-test.html`
   - 找到 `CONTRACT_ADDRESS` 变量
   - 替换为实际的合约地址

3. **提交更改**
   ```bash
   git add docs/interactive-test.html
   git commit -m "更新测试网合约地址"
   git push origin main
   ```

### 配置测试账户

为了让用户能够测试不同的Owner账户，您可以：

1. **在页面中显示测试账户信息**
   - 编辑 `interactive-test.html`
   - 添加测试账户的地址和私钥（仅用于测试）
   - 提供导入MetaMask的说明

2. **创建账户导入指南**
   ```javascript
   // 在页面中添加测试账户信息
   const TEST_ACCOUNTS = [
     {
       address: "0x364aB842806cDf35080c204bEAD8eeb0b531eCe2",
       privateKey: "0x52a74ac782906a20a3ec7e0914c31656c99874f453d56c7a6bd844086033d6c2",
       role: "Owner 1"
     },
     // ... 其他账户
   ];
   ```

## 📱 移动端优化

GitHub Pages演示页面已针对移动设备进行优化：

- 响应式设计适配各种屏幕尺寸
- 触摸友好的按钮和输入框
- 简化的移动端界面

## 🔒 安全注意事项

### 测试网安全

- ✅ 测试网ETH没有实际价值
- ✅ 私钥仅用于测试目的
- ⚠️ 不要在主网上使用这些私钥
- ⚠️ 不要发送真实资金到测试账户

### 页面安全

- 所有交互都在用户浏览器中进行
- 不会收集或存储用户数据
- 使用HTTPS确保连接安全

## 🛠️ 自定义配置

### 修改网络配置

如果需要连接到其他测试网，可以修改 `interactive-test.html` 中的网络配置：

```javascript
const NETWORK_CONFIG = {
    chainId: 11155111,  // Sepolia链ID
    name: 'Sepolia',
    rpcUrl: 'https://sepolia.infura.io/v3/YOUR_PROJECT_ID',
    blockExplorer: 'https://sepolia.etherscan.io'
};
```

### 添加新功能

您可以在演示页面中添加新的功能：

1. **批量操作演示**
2. **Gas费用计算器**
3. **交易历史查看器**
4. **合约事件监听器**

## 📊 使用统计

GitHub Pages提供基本的访问统计，您可以在仓库的 `Insights` > `Traffic` 中查看：

- 页面访问量
- 独立访客数
- 引荐来源

## 🚨 故障排除

### 常见问题

1. **页面404错误**
   - 检查GitHub Pages是否已启用
   - 确认文件路径正确
   - 等待部署完成（通常需要5-10分钟）

2. **合约连接失败**
   - 确认合约地址正确
   - 检查用户是否连接到Sepolia网络
   - 验证MetaMask是否已安装

3. **交易失败**
   - 检查账户是否有足够的测试ETH
   - 确认账户是否为合约Owner
   - 查看浏览器控制台错误信息

### 调试技巧

1. **启用控制台日志**
   ```javascript
   // 在浏览器中按F12打开开发者工具
   // 查看Console标签页的错误信息
   ```

2. **网络检查**
   ```javascript
   // 检查当前网络
   console.log(await provider.getNetwork());
   ```

3. **合约状态验证**
   ```javascript
   // 验证合约是否正确部署
   console.log(await contract.getOwnerCount());
   ```

## 📞 技术支持

如果遇到问题，请检查：

1. **GitHub Pages状态**
   - 访问 [GitHub Status](https://www.githubstatus.com/)
   - 检查Pages服务是否正常

2. **浏览器兼容性**
   - 推荐使用Chrome、Firefox、Safari最新版本
   - 确保启用JavaScript

3. **网络连接**
   - 确保能够访问GitHub和以太坊RPC节点
   - 检查防火墙设置

---

## 🎉 完成设置

设置完成后，您的MultiSig Wallet演示将可以通过以下方式访问：

- 🌐 **在线访问**: GitHub Pages URL
- 📱 **移动设备**: 响应式设计支持
- 🔗 **分享链接**: 可直接分享给其他用户测试
- 📊 **实时数据**: 连接真实的Sepolia测试网

现在任何人都可以通过浏览器直接体验您的MultiSig Wallet功能了！
