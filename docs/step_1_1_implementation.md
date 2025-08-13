# Step 1.1: 项目初始化和基础架构 - 完整实现指南

## 📋 实施概述

**功能**: 创建Hardhat项目结构，配置TypeScript开发环境  
**前置条件**: 无  
**输入依赖**: Node.js 16+, npm/yarn, Git  
**预计用时**: 2-3小时  
**推荐方案**: 使用 @nomicfoundation/hardhat-toolbox (支持ethers v6)  

## 🔧 环境准备

### 1. 验证开发环境

```bash
# 检查Node.js版本 (需要16+)
node --version
# 实际输出: v20.19.4 ✅

# 检查npm版本
npm --version
# 实际输出: 10.8.2 ✅

# 检查Git版本
git --version
# 实际输出: git version 2.33.0 ✅
```

### 2. 创建项目目录

```bash
# 创建项目根目录
mkdir simplified-multi-sig-wallet-solidity
cd simplified-multi-sig-wallet-solidity

# 验证当前目录
pwd
# 应显示项目根目录路径
```

## 🚀 项目初始化

### 3. 初始化npm项目

```bash
# 初始化package.json
npm init -y

# 验证package.json创建成功
ls -la package.json
```

### 4. 安装Hardhat和TypeScript依赖

```bash
# 安装Hardhat和基础依赖
npm install --save-dev hardhat

# 安装TypeScript相关依赖
npm install --save-dev typescript ts-node @types/node

# 🆕 使用新版Hardhat工具包 (推荐方案1)
# 这个包包含了ethers v6、测试框架等所有必需工具
npm install --save-dev @nomicfoundation/hardhat-toolbox

# 安装其他必需插件
npm install --save-dev hardhat-deploy
npm install --save-dev @nomicfoundation/hardhat-verify

# 安装生产依赖
npm install dotenv
npm install @openzeppelin/contracts

# 注意: 不再需要单独安装以下包，因为已包含在toolbox中:
# - @nomiclabs/hardhat-ethers (已弃用)
# - @nomiclabs/hardhat-waffle (已弃用) 
# - @typechain/hardhat
# - ethers (toolbox包含ethers v6)
# - chai, mocha等测试工具
```

### 5. 初始化Hardhat项目

```bash
# 运行Hardhat初始化
npx hardhat

# 选择以下选项:
# ✔ What do you want to do? · Create a TypeScript project
# ✔ Hardhat project root: · /path/to/simplified-multi-sig-wallet-solidity
# ✔ Do you want to add a .gitignore? (Y/n) · y
# ✔ Help us improve Hardhat with anonymous crash reports & basic usage data? (Y/n) · n
```

## 📁 项目结构创建

### 6. 创建标准化目录结构

```bash
# 创建主要目录
mkdir -p contracts/interfaces
mkdir -p contracts/libraries
mkdir -p contracts/mocks
mkdir -p test
mkdir -p scripts
mkdir -p deploy
mkdir -p docs
mkdir -p tasks
mkdir -p typechain-types

# 验证目录结构
tree -L 2 .
```

### 7. 配置文件创建和配置

#### 7.1 创建 `tsconfig.json`

```bash
cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "es2020",
    "module": "commonjs",
    "lib": ["es2020"],
    "outDir": "./dist",
    "rootDir": "./",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "typeRoots": ["./node_modules/@types", "./typechain-types"]
  },
  "include": [
    "./scripts/**/*",
    "./test/**/*",
    "./tasks/**/*",
    "./deploy/**/*",
    "./typechain-types/**/*"
  ],
  "exclude": [
    "node_modules",
    "dist",
    "artifacts",
    "cache"
  ]
}
EOF
```

#### 7.2 创建 `hardhat.config.ts`

```bash
cat > hardhat.config.ts << 'EOF'
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-verify";
import "hardhat-deploy";
import * as dotenv from "dotenv";

// 注意: @nomicfoundation/hardhat-toolbox 包含了:
// - @nomicfoundation/hardhat-ethers (ethers v6)
// - @nomicfoundation/hardhat-chai-matchers
// - @typechain/hardhat
// - hardhat-gas-reporter
// - solidity-coverage

// 加载环境变量
dotenv.config();

const config: HardhatUserConfig = {
  // Solidity版本配置
  solidity: {
    version: "0.8.19",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
    },
  },

  // 网络配置
  networks: {
    hardhat: {
      chainId: 31337,
      gas: 12000000,
      blockGasLimit: 12000000,
      allowUnlimitedContractSize: true,
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 11155111,
    },
    mumbai: {
      url: process.env.MUMBAI_RPC_URL || "",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 80001,
    },
    mainnet: {
      url: process.env.MAINNET_RPC_URL || "",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 1,
    },
    polygon: {
      url: process.env.POLYGON_RPC_URL || "",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 137,
    },
  },

  // 🆕 使用新的验证配置 (替代etherscan)
  sourcify: {
    enabled: true
  },
  
  // Etherscan验证配置 (向后兼容)
  etherscan: {
    apiKey: {
      mainnet: process.env.ETHERSCAN_API_KEY || "",
      sepolia: process.env.ETHERSCAN_API_KEY || "",
      polygon: process.env.POLYGONSCAN_API_KEY || "",
      polygonMumbai: process.env.POLYGONSCAN_API_KEY || "",
    },
  },

  // Gas报告配置
  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency: "USD",
    gasPrice: 20,
    coinmarketcap: process.env.COINMARKETCAP_API_KEY,
    outputFile: "gas-report.txt",
    noColors: true,
  },

  // 🆕 TypeChain配置 (ethers v6)
  typechain: {
    outDir: "typechain-types",
    target: "ethers-v6",
    alwaysGenerateOverloads: false,
    externalArtifacts: ["externalArtifacts/*.json"],
  },

  // Hardhat Deploy配置
  namedAccounts: {
    deployer: {
      default: 0,
    },
    owner1: {
      default: 1,
    },
    owner2: {
      default: 2,
    },
    owner3: {
      default: 3,
    },
  },

  // 路径配置
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
    deploy: "./deploy",
  },

  // Mocha测试配置
  mocha: {
    timeout: 40000,
  },
};

export default config;
EOF
```

#### 7.3 更新 `package.json` 脚本

```bash
cat > package.json << 'EOF'
{
  "name": "simplified-multi-sig-wallet-solidity",
  "version": "1.0.0",
  "description": "🏦 企业级多签名钱包智能合约系统，实现安全的多方资金管理和企业级审批工作流程",
  "main": "index.js",
  "scripts": {
    "compile": "npx hardhat compile",
    "test": "npx hardhat test",
    "test:coverage": "npx hardhat coverage",
    "test:gas": "REPORT_GAS=true npx hardhat test",
    "clean": "npx hardhat clean",
    "node": "npx hardhat node",
    "deploy:local": "npx hardhat deploy --network localhost",
    "deploy:sepolia": "npx hardhat deploy --network sepolia",
    "deploy:mumbai": "npx hardhat deploy --network mumbai",
    "deploy:mainnet": "npx hardhat deploy --network mainnet",
    "deploy:polygon": "npx hardhat deploy --network polygon",
    "verify:sepolia": "npx hardhat verify --network sepolia",
    "verify:mumbai": "npx hardhat verify --network mumbai",
    "verify:mainnet": "npx hardhat verify --network mainnet",
    "verify:polygon": "npx hardhat verify --network polygon",
    "lint": "npx solhint 'contracts/**/*.sol'",
    "lint:fix": "npx solhint 'contracts/**/*.sol' --fix",
    "format": "npx prettier --write 'contracts/**/*.sol'",
    "size": "npx hardhat size-contracts",
    "analyze": "slither .",
    "flatten": "npx hardhat flatten",
    "docgen": "npx hardhat docgen"
  },
  "keywords": [
    "solidity",
    "ethereum",
    "smart-contracts",
    "multisig",
    "wallet",
    "defi",
    "hardhat",
    "typescript"
  ],
  "author": "Your Name <your.email@example.com>",
  "license": "MIT",
  "devDependencies": {
    "@nomiclabs/hardhat-ethers": "^2.2.3",
    "@nomiclabs/hardhat-etherscan": "^3.1.7",
    "@nomiclabs/hardhat-waffle": "^2.0.6",
    "@typechain/ethers-v5": "^10.2.1",
    "@typechain/hardhat": "^6.1.6",
    "@types/chai": "^4.3.5",
    "@types/mocha": "^10.0.1",
    "@types/node": "^20.3.1",
    "chai": "^4.3.7",
    "ethereum-waffle": "^4.0.10",
    "hardhat": "^2.17.0",
    "hardhat-deploy": "^0.11.30",
    "hardhat-gas-reporter": "^1.0.9",
    "solidity-coverage": "^0.8.2",
    "ts-node": "^10.9.1",
    "typescript": "^5.1.3"
  },
  "dependencies": {
    "@openzeppelin/contracts": "^4.9.0",
    "dotenv": "^16.1.4",
    "ethers": "^5.7.2"
  }
}
EOF
```

### 8. Git配置

#### 8.1 更新 `.gitignore`

```bash
cat > .gitignore << 'EOF'
# Dependencies
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Hardhat files
cache/
artifacts/
typechain-types/

# Coverage reports
coverage/
coverage.json
.nyc_output/

# Gas reports
gas-report.txt

# Environment variables
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# IDE files
.vscode/
.idea/
*.swp
*.swo
*~

# OS files
.DS_Store
.DS_Store?
._*
.Spotlight-V100
.Trashes
ehthumbs.db
Thumbs.db

# Logs
logs
*.log

# Build outputs
dist/
build/
out/

# Temporary files
*.tmp
*.temp

# Solidity compiler outputs
*.abi
*.bin

# Hardhat network files
deployments/localhost/
deployments/hardhat/

# Flatten contracts
flattened/

# Documentation
docs/generated/
EOF
```

#### 8.2 初始化Git仓库

```bash
# 初始化Git仓库
git init

# 添加所有文件到暂存区
git add .

# 创建初始提交
git commit -m "feat: initialize Hardhat project with TypeScript support

- Setup Hardhat development environment with TypeScript
- Configure comprehensive project structure
- Add essential dependencies and plugins
- Create development scripts and configurations
- Setup Git repository with appropriate .gitignore"

# 验证Git状态
git status
```

### 9. 环境变量配置

#### 9.1 创建 `.env.example` 模板

```bash
cat > .env.example << 'EOF'
# Private Keys (DO NOT commit actual private keys)
PRIVATE_KEY=your_private_key_here

# RPC URLs
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/your_infura_project_id
MUMBAI_RPC_URL=https://polygon-mumbai.g.alchemy.com/v2/your_alchemy_api_key
MAINNET_RPC_URL=https://mainnet.infura.io/v3/your_infura_project_id
POLYGON_RPC_URL=https://polygon-mainnet.g.alchemy.com/v2/your_alchemy_api_key

# API Keys for contract verification
ETHERSCAN_API_KEY=your_etherscan_api_key
POLYGONSCAN_API_KEY=your_polygonscan_api_key

# Gas reporting
REPORT_GAS=false
COINMARKETCAP_API_KEY=your_coinmarketcap_api_key

# Deployment settings
INITIAL_OWNERS=owner1_address,owner2_address,owner3_address
REQUIRED_CONFIRMATIONS=2
EOF
```

#### 9.2 创建开发用 `.env` 文件

```bash
cat > .env << 'EOF'
# 开发环境配置
REPORT_GAS=false

# 测试网配置 (可以使用公开的RPC)
SEPOLIA_RPC_URL=https://rpc.sepolia.org
MUMBAI_RPC_URL=https://rpc-mumbai.maticvigil.com

# 注意: 在生产环境中，请使用环境特定的配置
EOF
```

### 10. 基础合约文件创建

#### 10.1 创建示例合约

```bash
# 创建基础合约文件
cat > contracts/MultiSigWallet.sol << 'EOF'
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title MultiSigWallet
 * @dev 企业级多签名钱包合约
 * @author Your Name
 * @notice 这是一个基础的多签名钱包合约框架
 */
contract MultiSigWallet {
    // 版本信息
    string public constant VERSION = "1.0.0";
    
    // 基础事件
    event WalletInitialized(address[] owners, uint256 required);
    
    // 构造函数
    constructor() {
        // 基础初始化逻辑将在后续步骤中实现
    }
    
    /**
     * @dev 获取合约版本
     * @return 版本字符串
     */
    function getVersion() public pure returns (string memory) {
        return VERSION;
    }
}
EOF
```

#### 10.2 创建基础测试文件

```bash
# 创建基础测试文件
cat > test/MultiSigWallet.test.ts << 'EOF'
import { expect } from "chai";
import { ethers } from "hardhat";
import { MultiSigWallet } from "../typechain-types";

describe("MultiSigWallet", function () {
  let multiSigWallet: MultiSigWallet;

  beforeEach(async function () {
    const MultiSigWalletFactory = await ethers.getContractFactory("MultiSigWallet");
    multiSigWallet = await MultiSigWalletFactory.deploy();
    await multiSigWallet.deployed();
  });

  describe("Deployment", function () {
    it("Should deploy successfully", async function () {
      expect(multiSigWallet.address).to.be.properAddress;
    });

    it("Should return correct version", async function () {
      expect(await multiSigWallet.getVersion()).to.equal("1.0.0");
    });
  });
});
EOF
```

### 11. README基础框架

```bash
cat > README.md << 'EOF'
# 🏦 简化多签名钱包 (Simplified Multi-Sig Wallet)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Solidity](https://img.shields.io/badge/Solidity-0.8.19-blue.svg)](https://soliditylang.org/)
[![Hardhat](https://img.shields.io/badge/Framework-Hardhat-orange.svg)](https://hardhat.org/)

> 🚀 **企业级多签名钱包** - 生产就绪的智能合约系统，实现安全的多方资金管理和企业级审批工作流程。

## 🚀 快速开始

### 前置要求

- Node.js 16+ 
- npm 或 yarn
- Git

### 安装

```bash
# 克隆仓库
git clone <repository-url>
cd simplified-multi-sig-wallet-solidity

# 安装依赖
npm install

# 编译合约
npm run compile

# 运行测试
npm run test
```

## 📁 项目结构

```
simplified-multi-sig-wallet-solidity/
├── contracts/              # 智能合约
├── test/                   # 测试文件
├── scripts/                # 部署脚本
├── deploy/                 # Hardhat Deploy脚本
├── docs/                   # 项目文档
└── tasks/                  # 自定义Hardhat任务
```

## 🛠️ 开发命令

```bash
npm run compile         # 编译合约
npm run test           # 运行测试
npm run test:coverage  # 测试覆盖率
npm run deploy:local   # 部署到本地网络
```

## 📄 许可证

MIT License - 查看 [LICENSE](LICENSE) 文件了解详情。

---

**开发中** - 更多功能和文档即将推出！
EOF
```

## ✅ 验证步骤

### 12. 执行验证命令

```bash
# 1. 验证npm安装
echo "🔍 验证npm安装..."
npm install
if [ $? -eq 0 ]; then
    echo "✅ npm install 执行成功"
else
    echo "❌ npm install 执行失败"
    exit 1
fi

# 2. 验证合约编译
echo "🔍 验证合约编译..."
npx hardhat compile
if [ $? -eq 0 ]; then
    echo "✅ 合约编译成功"
else
    echo "❌ 合约编译失败"
    exit 1
fi

# 3. 验证测试运行
echo "🔍 验证测试运行..."
npm run test
if [ $? -eq 0 ]; then
    echo "✅ 测试运行成功"
else
    echo "❌ 测试运行失败"
    exit 1
fi

# 4. 验证Git状态
echo "🔍 验证Git状态..."
if [ -d ".git" ]; then
    echo "✅ Git仓库初始化成功"
    git log --oneline -1
else
    echo "❌ Git仓库初始化失败"
fi

# 5. 验证项目结构
echo "🔍 验证项目结构..."
if [ -f "hardhat.config.ts" ] && [ -f "tsconfig.json" ] && [ -f "package.json" ]; then
    echo "✅ 主要配置文件创建成功"
else
    echo "❌ 主要配置文件缺失"
fi

echo "🎉 Step 1.1 验证完成！"
```

### 13. 项目结构最终验证

```bash
# 显示完整项目结构
echo "📁 最终项目结构:"
tree -a -L 3 . || ls -la
```

## 📚 创建文档

### 14. 创建项目设置文档

```bash
# 创建docs目录和文档文件
mkdir -p docs

cat > docs/1.1-project-setup.md << 'EOF'
# 1.1 项目初始化和基础架构文档

## 项目概述

本文档详细说明了多签名钱包项目的初始化过程和基础架构配置。

## 项目结构说明

### 目录结构
```
simplified-multi-sig-wallet-solidity/
├── contracts/                  # 智能合约源码
│   ├── interfaces/            # 合约接口定义
│   ├── libraries/             # 工具库合约
│   └── mocks/                 # 测试模拟合约
├── test/                      # 测试套件
├── scripts/                   # 部署和工具脚本
├── deploy/                    # Hardhat Deploy配置
├── docs/                      # 项目文档
├── tasks/                     # 自定义Hardhat任务
└── typechain-types/           # 自动生成的TypeScript类型
```

### 关键配置文件

- **hardhat.config.ts**: Hardhat主配置文件
- **tsconfig.json**: TypeScript配置
- **package.json**: 项目依赖和脚本
- **.env**: 环境变量配置

## 开发环境配置

### 依赖说明

#### 核心开发依赖
- **hardhat**: 以太坊开发框架
- **typescript**: TypeScript支持
- **@typechain/hardhat**: 类型安全的合约交互

#### 测试依赖
- **ethereum-waffle**: 测试框架
- **chai**: 断言库
- **solidity-coverage**: 覆盖率测试

#### 插件依赖
- **hardhat-gas-reporter**: Gas使用报告
- **hardhat-deploy**: 声明式部署系统
- **@nomiclabs/hardhat-etherscan**: 合约验证

### 网络配置

项目配置了以下网络:
- **hardhat**: 本地测试网络
- **localhost**: 本地开发网络
- **sepolia**: 以太坊测试网
- **mumbai**: Polygon测试网
- **mainnet**: 以太坊主网
- **polygon**: Polygon主网

### 开发工作流

1. **编写合约**: 在`contracts/`目录下开发
2. **编写测试**: 在`test/`目录下编写测试
3. **编译验证**: 使用`npm run compile`
4. **运行测试**: 使用`npm run test`
5. **部署合约**: 使用对应网络的部署命令

## 下一步

完成基础架构后，下一步将进行智能合约接口设计(Step 1.2)。

---

**创建时间**: $(date)  
**更新时间**: $(date)
EOF
```

## 🎯 输出总结

### 完成的交付物

✅ **完整的Hardhat项目结构**
- 标准化目录结构 
- 完整的依赖配置

✅ **package.json 和 package-lock.json**
- 完整的依赖管理
- 开发脚本配置

✅ **.gitignore 文件**  
- Solidity项目特定忽略规则
- 开发环境文件忽略

✅ **tsconfig.json 配置文件**
- TypeScript编译配置
- 类型检查设置

✅ **hardhat.config.ts 基础配置**
- 多网络配置
- 插件集成配置

✅ **README.md 基础框架**
- 项目介绍和快速开始
- 基础使用说明

### Git提交信息

```bash
git log --oneline -1
# 应显示: feat: initialize Hardhat project with TypeScript support
```

### 验证成功标志

- ✅ `npm install` 执行成功
- ✅ `npx hardhat compile` 编译通过  
- ✅ `npm run test` 测试通过
- ✅ Git仓库初始化成功
- ✅ 项目结构完整创建

## 🔄 下一步行动

完成Step 1.1后，可以继续执行:
- **Step 1.2**: 智能合约接口设计
- **Step 1.3**: 基本合约框架实现

项目现在已具备完整的开发基础架构，可以开始核心功能开发。