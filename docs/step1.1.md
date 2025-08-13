# Step 1.1: 环境配置与工具链实施指南

## 📋 概述

本文档详细说明如何建立现代化的Hardhat开发环境，配置企业级工具链，为多签名钱包项目奠定坚实的技术基础。

## 🎯 实施目标

- 建立标准化的Hardhat TypeScript开发环境
- 配置完整的代码质量检查工具链
- 设置多网络部署配置
- 建立自动化测试和CI/CD基础

## 🛠️ 技术栈规范

| 组件 | 版本 | 用途 |
|------|------|------|
| **Node.js** | >=16.0.0 | JavaScript运行环境 |
| **Hardhat** | ^2.26.3 | 开发框架和测试环境 |
| **@nomicfoundation/hardhat-toolbox** | ^6.1.0 | 集成开发工具包 |
| **OpenZeppelin** | ^5.4.0 | 安全合约库 |
| **TypeScript** | ^5.0.0 | 类型安全的脚本开发 |
| **Ethers.js** | ^6.x | 区块链交互库 |

## 🚀 实施步骤

### 步骤1: 项目初始化

#### 1.1 创建项目目录
```bash
# 创建项目目录
mkdir simplified-multi-sig-wallet-solidity
cd simplified-multi-sig-wallet-solidity

# 初始化Git仓库
git init
```

#### 1.2 初始化Hardhat项目
```bash
# 初始化Hardhat项目（选择TypeScript项目）
npx hardhat init

# 选择: Create a TypeScript project
# 选择: Yes to install dependencies
```

#### 1.3 安装核心依赖
```bash
# 安装Hardhat工具箱（包含所有必要工具）
npm install --save-dev @nomicfoundation/hardhat-toolbox

# 安装OpenZeppelin合约库
npm install @openzeppelin/contracts

# 安装额外的开发依赖
npm install --save-dev @types/node
npm install --save-dev ts-node
npm install --save-dev typescript
```

### 步骤2: 代码质量工具配置

#### 2.1 安装代码格式化工具
```bash
# 安装Prettier和Solidity插件
npm install --save-dev prettier
npm install --save-dev prettier-plugin-solidity

# 安装Solidity代码检查工具
npm install --save-dev solhint
npm install --save-dev @typescript-eslint/parser
npm install --save-dev @typescript-eslint/eslint-plugin
```

#### 2.2 创建配置文件

**创建 `.prettierrc` 文件**:
```json
{
  "semi": true,
  "singleQuote": false,
  "printWidth": 100,
  "tabWidth": 2,
  "trailingComma": "es5",
  "overrides": [
    {
      "files": "*.sol",
      "options": {
        "printWidth": 120,
        "tabWidth": 4,
        "useTabs": false,
        "singleQuote": false,
        "bracketSpacing": false
      }
    }
  ]
}
```

**创建 `.solhint.json` 文件**:
```json
{
  "extends": "solhint:recommended",
  "rules": {
    "compiler-version": ["error", "^0.8.0"],
    "func-visibility": ["warn", {"ignoreConstructors": true}],
    "max-line-length": ["error", 120],
    "not-rely-on-time": "off",
    "avoid-low-level-calls": "off",
    "no-inline-assembly": "off"
  }
}
```

**创建 `.eslintrc.js` 文件**:
```javascript
module.exports = {
  env: {
    browser: false,
    es6: true,
    mocha: true,
    node: true,
  },
  plugins: ["@typescript-eslint"],
  extends: [
    "@nomicfoundation/eslint-config-hardhat",
    "@nomicfoundation/eslint-config-hardhat/mixins/typescript",
  ],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: "module",
  },
  rules: {},
};
```

### 步骤3: Hardhat配置

#### 3.1 配置 `hardhat.config.ts`
```typescript
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
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
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
    gasPrice: 20,
    coinmarketcap: process.env.COINMARKETCAP_API_KEY,
  },
  etherscan: {
    apiKey: {
      mainnet: process.env.ETHERSCAN_API_KEY || "",
      sepolia: process.env.ETHERSCAN_API_KEY || "",
      polygon: process.env.POLYGONSCAN_API_KEY || "",
    },
  },
  typechain: {
    outDir: "typechain-types",
    target: "ethers-v6",
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};

export default config;
```

#### 3.2 配置 `tsconfig.json`
```json
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
    "sourceMap": true
  },
  "include": [
    "./scripts",
    "./test",
    "./tasks",
    "./typechain-types"
  ],
  "exclude": [
    "node_modules",
    "dist",
    "artifacts",
    "cache"
  ]
}
```

### 步骤4: 环境变量配置

#### 4.1 创建 `.env.example` 文件
```bash
# 开发环境配置
REPORT_GAS=false

# 网络RPC配置
SEPOLIA_RPC_URL=https://rpc.sepolia.org
MAINNET_RPC_URL=https://eth-mainnet.alchemyapi.io/v2/YOUR-API-KEY
POLYGON_RPC_URL=https://polygon-rpc.com

# API密钥配置（用于合约验证）
ETHERSCAN_API_KEY=your_etherscan_api_key
POLYGONSCAN_API_KEY=your_polygonscan_api_key
COINMARKETCAP_API_KEY=your_coinmarketcap_api_key

# 部署私钥（仅测试网使用）
PRIVATE_KEY=your_private_key_for_testnet_only
```

#### 4.2 创建 `.env` 文件
```bash
# 复制示例文件
cp .env.example .env

# 编辑.env文件，填入实际配置
# 注意：生产环境请使用硬件钱包或安全密钥管理
```

### 步骤5: 项目结构创建

#### 5.1 创建标准目录结构
```bash
# 创建合约目录结构
mkdir -p contracts/interfaces
mkdir -p contracts/libraries
mkdir -p contracts/mocks

# 创建测试目录
mkdir -p test

# 创建脚本目录
mkdir -p scripts

# 创建任务目录
mkdir -p tasks

# 创建文档目录
mkdir -p docs

# 创建部署配置目录
mkdir -p deploy
```

#### 5.2 创建 `.gitignore` 文件
```gitignore
# Dependencies
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Hardhat
artifacts/
cache/
coverage/
coverage.json
typechain-types/

# Environment variables
.env

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Logs
logs/
*.log

# Runtime data
pids/
*.pid
*.seed
*.pid.lock

# Build outputs
dist/
build/

# Test outputs
.nyc_output/
```

### 步骤6: Package.json脚本配置

#### 6.1 更新 `package.json` 脚本
```json
{
  "scripts": {
    "compile": "hardhat compile",
    "test": "hardhat test",
    "test:coverage": "hardhat coverage",
    "test:gas": "REPORT_GAS=true hardhat test",
    "deploy:local": "hardhat run scripts/deploy.ts --network localhost",
    "deploy:sepolia": "hardhat run scripts/deploy.ts --network sepolia",
    "deploy:mainnet": "hardhat run scripts/deploy.ts --network mainnet",
    "deploy:polygon": "hardhat run scripts/deploy.ts --network polygon",
    "verify:sepolia": "hardhat verify --network sepolia",
    "verify:mainnet": "hardhat verify --network mainnet",
    "verify:polygon": "hardhat verify --network polygon",
    "node": "hardhat node",
    "console": "hardhat console",
    "clean": "hardhat clean",
    "size": "hardhat size-contracts",
    "lint:sol": "solhint 'contracts/**/*.sol'",
    "lint:ts": "eslint --ext .js,.ts .",
    "lint": "npm run lint:sol && npm run lint:ts",
    "format:sol": "prettier --write 'contracts/**/*.sol'",
    "format:ts": "prettier --write '**/*.{js,ts}'",
    "format": "npm run format:sol && npm run format:ts",
    "analyze": "slither ."
  }
}
```

### 步骤7: 基础合约创建

#### 7.1 创建基础接口文件

**创建 `contracts/interfaces/IMultiSigWallet.sol`**:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title IMultiSigWallet
 * @dev 多签名钱包接口定义
 * @notice 定义多签名钱包的核心功能接口
 */
interface IMultiSigWallet {
    // 事件定义
    event TransactionSubmitted(
        uint256 indexed transactionId,
        address indexed submitter,
        address indexed to,
        uint256 value,
        bytes data
    );
    
    event TransactionConfirmed(
        uint256 indexed transactionId,
        address indexed owner
    );
    
    event TransactionExecuted(
        uint256 indexed transactionId
    );
    
    event TransactionFailed(
        uint256 indexed transactionId,
        bytes reason
    );
    
    event OwnerAddition(address indexed owner);
    event OwnerRemoval(address indexed owner);
    event RequirementChange(uint256 required);

    // 核心功能
    function submitTransaction(
        address to,
        uint256 value,
        bytes calldata data
    ) external returns (uint256);
    
    function confirmTransaction(uint256 transactionId) external;
    function executeTransaction(uint256 transactionId) external;
    function revokeConfirmation(uint256 transactionId) external;
    
    // 所有者管理
    function addOwner(address owner) external;
    function removeOwner(address owner) external;
    function changeRequirement(uint256 required) external;
    
    // 查询功能
    function getOwners() external view returns (address[] memory);
    function getTransactionCount() external view returns (uint256);
    function isConfirmed(uint256 transactionId) external view returns (bool);
    function getConfirmationCount(uint256 transactionId) external view returns (uint256);
    function getTransaction(uint256 transactionId) external view returns (
        address to,
        uint256 value,
        bytes memory data,
        bool executed
    );
}
```

**创建 `contracts/interfaces/IERC20.sol`**:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title IERC20
 * @dev ERC20标准接口
 */
interface IERC20 {
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
}
```

#### 7.2 创建基础测试文件

**创建 `test/MultiSigWallet.test.ts`**:
```typescript
import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

describe("MultiSigWallet", function () {
  // 测试夹具
  async function deployMultiSigWalletFixture() {
    const [owner1, owner2, owner3, addr1, addr2] = await ethers.getSigners();
    
    // 部署合约的代码将在后续步骤中实现
    // const MultiSigWallet = await ethers.getContractFactory("MultiSigWallet");
    // const wallet = await MultiSigWallet.deploy([owner1.address, owner2.address, owner3.address], 2);
    
    return { owner1, owner2, owner3, addr1, addr2 };
  }

  describe("Deployment", function () {
    it("Should be able to compile", async function () {
      // 基础编译测试
      expect(true).to.be.true;
    });
  });
});
```

#### 7.3 创建基础部署脚本

**创建 `scripts/deploy.ts`**:
```typescript
import { ethers, network } from "hardhat";

async function main() {
  console.log(`Deploying to network: ${network.name}`);
  
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", (await deployer.getBalance()).toString());

  // 多签名钱包参数
  const owners = [
    deployer.address,
    // 添加其他所有者地址
  ];
  const requiredConfirmations = 1; // 根据需要调整

  // 部署逻辑将在后续步骤中实现
  console.log("MultiSigWallet deployment script ready");
  console.log("Owners:", owners);
  console.log("Required confirmations:", requiredConfirmations);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
```

## ✅ 验证步骤

### 验证1: 项目编译
```bash
# 清理并编译项目
npm run clean
npm run compile
```
**期望结果**: 编译成功，无错误信息

### 验证2: 测试框架运行
```bash
# 运行基础测试
npm test
```
**期望结果**: 测试通过，框架正常运行

### 验证3: 代码质量工具
```bash
# 运行代码检查
npm run lint

# 运行代码格式化
npm run format
```
**期望结果**: 代码检查通过，格式化正常

### 验证4: 网络连接测试
```bash
# 启动本地节点
npm run node

# 在另一个终端运行部署脚本
npm run deploy:local
```
**期望结果**: 本地网络正常，部署脚本运行无错误

## 📚 输出交付物

### 配置文件
- [x] `hardhat.config.ts` - Hardhat主配置
- [x] `tsconfig.json` - TypeScript配置
- [x] `package.json` - 项目依赖和脚本
- [x] `.prettierrc` - 代码格式化规则
- [x] `.solhint.json` - Solidity代码检查规则
- [x] `.eslintrc.js` - TypeScript代码检查规则
- [x] `.gitignore` - Git忽略规则
- [x] `.env.example` - 环境变量示例

### 项目结构
- [x] 完整的目录结构
- [x] 基础接口文件
- [x] 测试框架搭建
- [x] 部署脚本模板

### 开发工具
- [x] 代码质量检查工具
- [x] 自动化脚本配置
- [x] 多网络部署配置
- [x] TypeScript类型支持

## 🔧 故障排除

### 常见问题1: 依赖冲突
```bash
# 解决方案
rm -rf node_modules package-lock.json
npm install --legacy-peer-deps
```

### 常见问题2: TypeScript编译错误
```bash
# 检查TypeScript配置
npx tsc --noEmit

# 重新生成类型
npm run compile
```

### 常见问题3: 网络连接问题
```bash
# 检查环境变量
cat .env

# 测试网络连接
curl -X POST -H "Content-Type: application/json" --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' $SEPOLIA_RPC_URL
```

## 📈 下一步骤

完成Step 1.1后，项目具备了：
- ✅ 现代化的开发环境
- ✅ 完整的工具链配置
- ✅ 标准化的项目结构
- ✅ 基础的接口定义

**准备进入Step 1.2**: 智能合约架构设计，开始实现多签名钱包的核心逻辑。

---

**完成时间**: 预计2-4小时  
**技能要求**: Node.js基础、Git操作、命令行使用  
**质量标准**: 所有验证步骤通过，代码质量工具配置正确
