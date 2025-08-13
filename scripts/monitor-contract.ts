import hre from "hardhat";
import fs from "fs";
import path from "path";

interface MonitoringConfig {
  contractAddress: string;
  network: string;
  alertThresholds: {
    largeTransactionValue: string; // ETH
    maxDailyTransactions: number;
    suspiciousGasUsage: number;
  };
  notifications: {
    email?: string;
    webhook?: string;
    discord?: string;
  };
}

interface TransactionEvent {
  transactionId: number;
  to: string;
  value: string;
  data: string;
  submitter: string;
  blockNumber: number;
  timestamp: number;
}

class ContractMonitor {
  private contract: any;
  private config: MonitoringConfig;
  private isMonitoring: boolean = false;

  constructor(contract: any, config: MonitoringConfig) {
    this.contract = contract;
    this.config = config;
  }

  async startMonitoring() {
    console.log("🔍 Starting Contract Monitoring...");
    console.log(`📡 Network: ${this.config.network}`);
    console.log(`📄 Contract: ${this.config.contractAddress}`);
    
    this.isMonitoring = true;

    // 监听所有重要事件
    await this.setupEventListeners();
    
    // 定期状态检查
    this.startPeriodicChecks();
    
    console.log("✅ Monitoring started successfully!");
  }

  async stopMonitoring() {
    this.isMonitoring = false;
    console.log("🛑 Monitoring stopped");
  }

  private async setupEventListeners() {
    console.log("📡 Setting up event listeners...");

    // 监听交易提交事件
    this.contract.on("TransactionSubmitted", async (transactionId: number, to: string, value: bigint, data: string, submitter: string, event: any) => {
      const transactionEvent: TransactionEvent = {
        transactionId,
        to,
        value: hre.ethers.formatEther(value),
        data,
        submitter,
        blockNumber: event.blockNumber,
        timestamp: Date.now()
      };

      await this.handleTransactionSubmitted(transactionEvent);
    });

    // 监听交易确认事件
    this.contract.on("TransactionConfirmed", async (transactionId: number, owner: string, event: any) => {
      await this.handleTransactionConfirmed(transactionId, owner, event);
    });

    // 监听交易执行事件
    this.contract.on("TransactionExecuted", async (transactionId: number, event: any) => {
      await this.handleTransactionExecuted(transactionId, event);
    });

    // 监听所有者变更事件
    this.contract.on("OwnerAddition", async (owner: string, event: any) => {
      await this.handleOwnerAddition(owner, event);
    });

    this.contract.on("OwnerRemoval", async (owner: string, event: any) => {
      await this.handleOwnerRemoval(owner, event);
    });

    // 监听暂停事件
    this.contract.on("Paused", async (account: string, event: any) => {
      await this.handleEmergencyPause(account, event);
    });

    this.contract.on("Unpaused", async (account: string, event: any) => {
      await this.handleEmergencyUnpause(account, event);
    });

    console.log("✅ Event listeners configured");
  }

  private async handleTransactionSubmitted(transaction: TransactionEvent) {
    console.log(`\n🔄 Transaction Submitted:`);
    console.log(`   ID: ${transaction.transactionId}`);
    console.log(`   To: ${transaction.to}`);
    console.log(`   Value: ${transaction.value} ETH`);
    console.log(`   Submitter: ${transaction.submitter}`);

    // 检查大额交易告警
    const valueThreshold = parseFloat(this.config.alertThresholds.largeTransactionValue);
    if (parseFloat(transaction.value) > valueThreshold) {
      await this.sendAlert(`🚨 Large Transaction Alert`, 
        `Transaction #${transaction.transactionId} with value ${transaction.value} ETH submitted by ${transaction.submitter}`);
    }

    // 记录交易
    await this.logTransaction(transaction);
  }

  private async handleTransactionConfirmed(transactionId: number, owner: string, event: any) {
    console.log(`\n✅ Transaction Confirmed:`);
    console.log(`   ID: ${transactionId}`);
    console.log(`   Owner: ${owner}`);
    console.log(`   Block: ${event.blockNumber}`);

    // 检查确认状态
    const confirmationCount = await this.contract.getConfirmationCount(transactionId);
    const required = await this.contract.required();
    
    console.log(`   Confirmations: ${confirmationCount}/${required}`);

    if (confirmationCount >= required) {
      await this.sendNotification(`🎯 Transaction Ready`, 
        `Transaction #${transactionId} has reached required confirmations and is ready for execution`);
    }
  }

  private async handleTransactionExecuted(transactionId: number, event: any) {
    console.log(`\n🚀 Transaction Executed:`);
    console.log(`   ID: ${transactionId}`);
    console.log(`   Block: ${event.blockNumber}`);
    console.log(`   Gas Used: ${event.gasUsed || 'N/A'}`);

    await this.sendNotification(`✅ Transaction Executed`, 
      `Transaction #${transactionId} has been successfully executed`);
  }

  private async handleOwnerAddition(owner: string, event: any) {
    console.log(`\n👥 Owner Added:`);
    console.log(`   Address: ${owner}`);
    console.log(`   Block: ${event.blockNumber}`);

    await this.sendAlert(`🔐 Owner Addition Alert`, 
      `New owner ${owner} has been added to the wallet`);
  }

  private async handleOwnerRemoval(owner: string, event: any) {
    console.log(`\n👤 Owner Removed:`);
    console.log(`   Address: ${owner}`);
    console.log(`   Block: ${event.blockNumber}`);

    await this.sendAlert(`🚨 Owner Removal Alert`, 
      `Owner ${owner} has been removed from the wallet`);
  }

  private async handleEmergencyPause(account: string, event: any) {
    console.log(`\n🛑 Emergency Pause Activated:`);
    console.log(`   Triggered by: ${account}`);
    console.log(`   Block: ${event.blockNumber}`);

    await this.sendAlert(`🚨 EMERGENCY PAUSE ACTIVATED`, 
      `Contract has been paused by ${account}. All operations are suspended.`);
  }

  private async handleEmergencyUnpause(account: string, event: any) {
    console.log(`\n✅ Emergency Pause Deactivated:`);
    console.log(`   Triggered by: ${account}`);
    console.log(`   Block: ${event.blockNumber}`);

    await this.sendNotification(`✅ Contract Resumed`, 
      `Contract has been unpaused by ${account}. Operations are now active.`);
  }

  private startPeriodicChecks() {
    // 每5分钟检查一次合约状态
    setInterval(async () => {
      if (!this.isMonitoring) return;
      
      try {
        await this.performHealthCheck();
      } catch (error) {
        console.error("Health check failed:", error);
        await this.sendAlert("🚨 Health Check Failed", `Contract health check failed: ${error}`);
      }
    }, 5 * 60 * 1000); // 5分钟

    // 每小时生成状态报告
    setInterval(async () => {
      if (!this.isMonitoring) return;
      
      try {
        await this.generateStatusReport();
      } catch (error) {
        console.error("Status report generation failed:", error);
      }
    }, 60 * 60 * 1000); // 1小时
  }

  private async performHealthCheck() {
    const owners = await this.contract.getOwners();
    const required = await this.contract.required();
    const transactionCount = await this.contract.getTransactionCount();
    const isPaused = await this.contract.paused();
    const balance = await hre.ethers.provider.getBalance(this.config.contractAddress);

    console.log(`\n💓 Health Check (${new Date().toISOString()}):`);
    console.log(`   Owners: ${owners.length}`);
    console.log(`   Required: ${required}`);
    console.log(`   Transactions: ${transactionCount}`);
    console.log(`   Status: ${isPaused ? 'Paused' : 'Active'}`);
    console.log(`   Balance: ${hre.ethers.formatEther(balance)} ETH`);

    // 检查异常状态
    if (isPaused) {
      await this.sendAlert("⚠️ Contract Paused", "Contract is currently in paused state");
    }

    if (owners.length < 2) {
      await this.sendAlert("🚨 Critical: Insufficient Owners", `Only ${owners.length} owners remaining`);
    }
  }

  private async generateStatusReport() {
    const owners = await this.contract.getOwners();
    const required = await this.contract.required();
    const transactionCount = await this.contract.getTransactionCount();
    const isPaused = await this.contract.paused();
    const balance = await hre.ethers.provider.getBalance(this.config.contractAddress);

    const report = {
      timestamp: new Date().toISOString(),
      network: this.config.network,
      contractAddress: this.config.contractAddress,
      status: {
        owners: owners.length,
        required: required.toString(),
        transactions: transactionCount.toString(),
        paused: isPaused,
        balance: hre.ethers.formatEther(balance)
      }
    };

    // 保存报告
    const reportsDir = path.join(__dirname, "..", "monitoring", "reports");
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const reportPath = path.join(reportsDir, `status-${timestamp}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log(`📊 Status report saved: ${reportPath}`);
  }

  private async logTransaction(transaction: TransactionEvent) {
    const logsDir = path.join(__dirname, "..", "monitoring", "logs");
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    const today = new Date().toISOString().split('T')[0];
    const logPath = path.join(logsDir, `transactions-${today}.json`);

    let logs: TransactionEvent[] = [];
    if (fs.existsSync(logPath)) {
      logs = JSON.parse(fs.readFileSync(logPath, "utf8"));
    }

    logs.push(transaction);
    fs.writeFileSync(logPath, JSON.stringify(logs, null, 2));
  }

  private async sendAlert(title: string, message: string) {
    console.log(`🚨 ALERT: ${title}`);
    console.log(`   ${message}`);

    // 这里可以集成实际的通知服务
    // 例如: Discord, Slack, Email, SMS等
    if (this.config.notifications.webhook) {
      // await this.sendWebhookNotification(title, message);
    }

    if (this.config.notifications.email) {
      // await this.sendEmailNotification(title, message);
    }
  }

  private async sendNotification(title: string, message: string) {
    console.log(`📢 NOTIFICATION: ${title}`);
    console.log(`   ${message}`);
  }
}

async function main() {
  console.log("🚀 Starting MultiSig Wallet Monitor...");

  // 加载监控配置
  const configPath = path.join(__dirname, "..", "monitoring", "config.json");
  if (!fs.existsSync(configPath)) {
    throw new Error("Monitoring configuration not found. Please create monitoring/config.json");
  }

  const config: MonitoringConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));

  // 获取合约实例
  const contract = await hre.ethers.getContractAt("MultiSigWallet", config.contractAddress);

  // 创建监控器
  const monitor = new ContractMonitor(contract, config);

  // 启动监控
  await monitor.startMonitoring();

  // 优雅关闭处理
  process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down monitor...');
    await monitor.stopMonitoring();
    process.exit(0);
  });

  // 保持进程运行
  console.log("📡 Monitor is running... Press Ctrl+C to stop");
  process.stdin.resume();
}

// 如果直接运行此脚本
if (require.main === module) {
  main().catch((error) => {
    console.error("❌ Monitor failed to start:", error);
    process.exitCode = 1;
  });
}

export { ContractMonitor, MonitoringConfig };
