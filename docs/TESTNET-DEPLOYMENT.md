# 🌐 测试网部署完整指南

## 📋 概述

本文档提供了MultiSig Wallet智能合约在测试网（Sepolia）上的完整部署指南，包括环境配置、账户创建、合约部署、验证和交互测试的详细步骤。

## 🔧 环境准备

### 1. 安装必要工具

```bash
# 安装Node.js依赖
npm install

# 安装Hardhat CLI (如果尚未安装)
npm install -g hardhat

# 验证安装
npx hardhat --version
```

### 2. 配置环境变量

创建 `.env` 文件：

```bash
# 在项目根目录创建.env文件
touch .env
```

在 `.env` 文件中添加以下配置：

```env
# Sepolia测试网RPC URL (推荐使用Alchemy或Infura)
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_API_KEY

# 主部署账户私钥 (用于部署合约)
PRIVATE_KEY=your_private_key_here

# Etherscan API Key (用于合约验证)
ETHERSCAN_API_KEY=your_etherscan_api_key

# 测试网络标识
NETWORK=sepolia
```

### 3. 获取测试网RPC URL

**选择1: Alchemy (推荐)**
1. 访问 [Alchemy](https://www.alchemy.com/)
2. 注册账户并创建新应用
3. 选择Ethereum网络和Sepolia测试网
4. 复制HTTP URL到 `SEPOLIA_RPC_URL`

**选择2: Infura**
1. 访问 [Infura](https://infura.io/)
2. 注册账户并创建新项目
3. 在项目设置中找到Sepolia端点
4. 复制URL到 `SEPOLIA_RPC_URL`

## 👥 创建测试账户

### 自动生成10个测试账户

创建账户生成脚本：

```javascript
// scripts/generate-accounts.js
const { ethers } = require("hardhat");
const fs = require('fs');

async function main() {
    console.log("🔑 生成10个测试账户...\n");
    
    const accounts = [];
    
    for (let i = 0; i < 10; i++) {
        const wallet = ethers.Wallet.createRandom();
        const account = {
            index: i,
            address: wallet.address,
            privateKey: wallet.privateKey,
            mnemonic: wallet.mnemonic.phrase,
            role: i < 5 ? "Owner" : "User"
        };
        accounts.push(account);
        
        console.log(`账户 ${i + 1} (${account.role}):`);
        console.log(`  地址: ${account.address}`);
        console.log(`  私钥: ${account.privateKey}`);
        console.log(`  助记词: ${account.mnemonic}`);
        console.log("");
    }
    
    // 保存到文件
    const accountsData = {
        network: "sepolia",
        generated: new Date().toISOString(),
        accounts: accounts
    };
    
    fs.writeFileSync('test-accounts.json', JSON.stringify(accountsData, null, 2));
    console.log("✅ 账户信息已保存到 test-accounts.json");
    
    // 生成环境变量模板
    let envTemplate = "\n# 测试账户私钥\n";
    accounts.forEach((account, index) => {
        envTemplate += `TEST_ACCOUNT_${index + 1}_PRIVATE_KEY=${account.privateKey}\n`;
    });
    
    fs.writeFileSync('.env.accounts', envTemplate);
    console.log("✅ 环境变量模板已保存到 .env.accounts");
    
    // 生成Owner地址列表
    const ownerAddresses = accounts.slice(0, 5).map(acc => acc.address);
    console.log("\n🏛️ Owner地址列表 (用于合约部署):");
    console.log(JSON.stringify(ownerAddresses, null, 2));
    
    return accounts;
}

if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}

module.exports = { main };
```

运行账户生成脚本：

```bash
# 生成测试账户
npx hardhat run scripts/generate-accounts.js

# 查看生成的账户
cat test-accounts.json
```

### 为测试账户获取测试ETH

**方法1: Sepolia水龙头 (推荐)**

访问以下水龙头为前5个Owner账户获取测试ETH：

1. **Alchemy Sepolia Faucet**: https://sepoliafaucet.com/
2. **Chainlink Faucet**: https://faucets.chain.link/sepolia
3. **Ethereum Sepolia Faucet**: https://sepolia-faucet.pk910.de/

每个Owner账户建议获取至少 **0.5 ETH** 用于测试。

**方法2: 使用脚本批量申请**

```javascript
// scripts/fund-accounts.js
const { ethers } = require("hardhat");
const accounts = require('../test-accounts.json');

async function main() {
    console.log("💰 为测试账户申请测试ETH...\n");
    
    const ownerAccounts = accounts.accounts.slice(0, 5);
    
    console.log("请手动为以下Owner账户申请测试ETH:");
    console.log("推荐水龙头: https://sepoliafaucet.com/\n");
    
    ownerAccounts.forEach((account, index) => {
        console.log(`Owner ${index + 1}: ${account.address}`);
    });
    
    console.log("\n建议每个账户获取 0.5 ETH 用于测试");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
```

## 🚀 部署到测试网

### 1. 配置部署脚本

创建测试网专用部署脚本：

```javascript
// scripts/deploy-testnet.js
const { ethers } = require("hardhat");
const fs = require('fs');

async function main() {
    console.log("🚀 开始部署到Sepolia测试网...\n");
    
    // 获取部署账户
    const [deployer] = await ethers.getSigners();
    console.log("部署账户:", deployer.address);
    
    const balance = await deployer.getBalance();
    console.log("账户余额:", ethers.utils.formatEther(balance), "ETH\n");
    
    if (balance.lt(ethers.utils.parseEther("0.1"))) {
        throw new Error("部署账户余额不足，请先获取测试ETH");
    }
    
    // 读取测试账户
    const accountsData = JSON.parse(fs.readFileSync('test-accounts.json', 'utf8'));
    const ownerAddresses = accountsData.accounts.slice(0, 5).map(acc => acc.address);
    
    console.log("🏛️ Owner地址列表:");
    ownerAddresses.forEach((addr, index) => {
        console.log(`  Owner ${index + 1}: ${addr}`);
    });
    
    // 部署合约
    console.log("\n📦 部署MultiSigWallet合约...");
    const MultiSigWallet = await ethers.getContractFactory("MultiSigWallet");
    
    const requiredConfirmations = 3; // 需要3个确认
    const contract = await MultiSigWallet.deploy(ownerAddresses, requiredConfirmations);
    
    console.log("⏳ 等待部署确认...");
    await contract.deployed();
    
    console.log("✅ 合约部署成功!");
    console.log("合约地址:", contract.address);
    console.log("交易哈希:", contract.deployTransaction.hash);
    console.log("Gas使用:", contract.deployTransaction.gasLimit.toString());
    
    // 保存部署信息
    const deploymentInfo = {
        network: "sepolia",
        contractAddress: contract.address,
        deploymentTx: contract.deployTransaction.hash,
        deployer: deployer.address,
        owners: ownerAddresses,
        requiredConfirmations: requiredConfirmations,
        deployedAt: new Date().toISOString(),
        gasUsed: contract.deployTransaction.gasLimit.toString()
    };
    
    fs.writeFileSync('deployment-sepolia.json', JSON.stringify(deploymentInfo, null, 2));
    console.log("✅ 部署信息已保存到 deployment-sepolia.json");
    
    // 验证合约状态
    console.log("\n🔍 验证合约状态:");
    console.log("Owner数量:", await contract.getOwnerCount());
    console.log("所需确认数:", await contract.required());
    console.log("合约余额:", ethers.utils.formatEther(await ethers.provider.getBalance(contract.address)), "ETH");
    
    return deploymentInfo;
}

if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}

module.exports = { main };
```

### 2. 执行部署

```bash
# 部署到Sepolia测试网
npx hardhat run scripts/deploy-testnet.js --network sepolia

# 查看部署结果
cat deployment-sepolia.json
```

### 3. 验证合约 (可选)

```bash
# 在Etherscan上验证合约
npx hardhat verify --network sepolia DEPLOYED_CONTRACT_ADDRESS "OWNER_ADDRESSES_ARRAY" REQUIRED_CONFIRMATIONS

# 示例
npx hardhat verify --network sepolia 0x1234567890123456789012345678901234567890 '["0xOwner1","0xOwner2","0xOwner3","0xOwner4","0xOwner5"]' 3
```

## 🧪 测试网功能测试

### 1. 基础功能测试脚本

```javascript
// scripts/test-deployed-contract.js
const { ethers } = require("hardhat");
const fs = require('fs');

async function main() {
    console.log("🧪 开始测试已部署的合约...\n");
    
    // 读取部署信息
    const deploymentInfo = JSON.parse(fs.readFileSync('deployment-sepolia.json', 'utf8'));
    const accountsData = JSON.parse(fs.readFileSync('test-accounts.json', 'utf8'));
    
    console.log("合约地址:", deploymentInfo.contractAddress);
    
    // 连接到合约
    const MultiSigWallet = await ethers.getContractFactory("MultiSigWallet");
    const contract = MultiSigWallet.attach(deploymentInfo.contractAddress);
    
    // 使用第一个Owner账户
    const ownerWallet = new ethers.Wallet(accountsData.accounts[0].privateKey, ethers.provider);
    const contractWithOwner = contract.connect(ownerWallet);
    
    console.log("测试账户:", ownerWallet.address);
    console.log("账户余额:", ethers.utils.formatEther(await ownerWallet.getBalance()), "ETH\n");
    
    // 测试1: 提交交易
    console.log("📝 测试1: 提交交易");
    const recipient = accountsData.accounts[5].address; // 使用非Owner账户作为接收者
    const value = ethers.utils.parseEther("0.01"); // 发送0.01 ETH
    
    try {
        const tx = await contractWithOwner.submitTransaction(recipient, value, "0x");
        console.log("交易哈希:", tx.hash);
        
        const receipt = await tx.wait();
        console.log("✅ 交易提交成功");
        
        // 获取交易ID
        const event = receipt.events?.find(e => e.event === 'TransactionSubmitted');
        const transactionId = event.args.transactionId.toString();
        console.log("交易ID:", transactionId);
        
        // 测试2: 确认交易
        console.log("\n✅ 测试2: 确认交易");
        const confirmTx = await contractWithOwner.confirmTransaction(transactionId);
        await confirmTx.wait();
        console.log("✅ 交易确认成功");
        
        // 检查交易状态
        const txInfo = await contract.getTransaction(transactionId);
        console.log("交易确认数:", txInfo.confirmations.toString());
        console.log("是否已执行:", txInfo.executed);
        
    } catch (error) {
        console.error("❌ 测试失败:", error.message);
    }
    
    // 显示合约状态
    console.log("\n📊 合约当前状态:");
    console.log("Owner数量:", await contract.getOwnerCount());
    console.log("交易总数:", await contract.getTransactionCount());
    console.log("合约余额:", ethers.utils.formatEther(await ethers.provider.getBalance(contract.address)), "ETH");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
```

### 2. 运行测试

```bash
# 运行功能测试
npx hardhat run scripts/test-deployed-contract.js --network sepolia
```

## 📋 部署检查清单

### 部署前检查
- [ ] ✅ 环境变量配置完成 (.env文件)
- [ ] ✅ 测试账户生成完成 (10个账户)
- [ ] ✅ Owner账户获取测试ETH (至少0.5 ETH)
- [ ] ✅ RPC URL配置正确
- [ ] ✅ 网络配置验证

### 部署过程检查
- [ ] ✅ 合约编译成功
- [ ] ✅ 部署交易确认
- [ ] ✅ 合约地址获取
- [ ] ✅ 部署信息保存

### 部署后验证
- [ ] ✅ 合约状态验证
- [ ] ✅ Owner列表正确
- [ ] ✅ 所需确认数正确
- [ ] ✅ 基础功能测试通过
- [ ] ✅ 在Etherscan上查看合约

## 🔗 有用链接

### Sepolia测试网信息
- **网络名称**: Sepolia
- **RPC URL**: https://sepolia.infura.io/v3/YOUR_PROJECT_ID
- **链ID**: 11155111
- **区块浏览器**: https://sepolia.etherscan.io/
- **水龙头**: https://sepoliafaucet.com/

### 开发工具
- **Hardhat文档**: https://hardhat.org/docs
- **Ethers.js文档**: https://docs.ethers.io/
- **OpenZeppelin**: https://openzeppelin.com/contracts/

## 🚨 注意事项

### 安全提醒
1. **私钥安全**: 测试网私钥也要妥善保管，不要提交到代码仓库
2. **环境隔离**: 测试网和主网环境要严格分离
3. **资金管理**: 测试网ETH没有实际价值，但要合理使用

### 常见问题
1. **Gas费不足**: 确保部署账户有足够的测试ETH
2. **RPC限制**: 免费RPC可能有请求限制，建议使用Alchemy或Infura
3. **网络延迟**: 测试网可能比主网慢，要有耐心等待确认

### 故障排除
1. **部署失败**: 检查网络连接和账户余额
2. **交易卡住**: 可能是Gas价格设置过低
3. **合约验证失败**: 检查构造函数参数是否正确

---

## 📞 技术支持

如果在部署过程中遇到问题，请检查：
1. 网络配置是否正确
2. 账户余额是否充足
3. RPC URL是否可访问
4. 合约代码是否编译成功

完成部署后，您就可以使用 `interactive-test.html` 页面与测试网上的合约进行交互了！
