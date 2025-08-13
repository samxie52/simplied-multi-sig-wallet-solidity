import { expect } from "chai";
import { ethers } from "hardhat";

describe("MultiSigWallet Performance and Stress Tests", function () {
  let multiSigWallet: any;
  let mockTarget: any;
  let mockERC20: any;
  let owners: any[];
  let nonOwners: any[];

  // 增加测试超时时间用于压力测试
  this.timeout(300000); // 5分钟

  beforeEach(async function () {
    // 获取更多测试账户用于压力测试
    const signers = await ethers.getSigners();
    owners = signers.slice(0, 10); // 前10个作为所有者
    nonOwners = signers.slice(10, 15); // 后5个作为非所有者

    // 设置多签名钱包参数
    const ownerAddresses = owners.slice(0, 5).map(owner => owner.address); // 使用5个所有者
    const required = 3;

    // 部署MultiSigWallet合约
    const MultiSigWallet = await ethers.getContractFactory("MultiSigWallet");
    multiSigWallet = await MultiSigWallet.deploy(ownerAddresses, required);

    // 部署测试用的MockTarget合约
    const MockTarget = await ethers.getContractFactory("MockTarget");
    mockTarget = await MockTarget.deploy();

    // 部署ERC20测试代币
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockERC20 = await MockERC20.deploy("Test Token", "TEST", ethers.parseEther("1000000"));

    // 为钱包充值
    await owners[0].sendTransaction({
      to: multiSigWallet.target,
      value: ethers.parseEther("1000.0")
    });

    // 为钱包转入ERC20代币
    await mockERC20.transfer(multiSigWallet.target, ethers.parseEther("100000"));
  });

  describe("High Volume Transaction Processing", function () {
    it("Should handle 100 sequential transactions efficiently", async function () {
      console.log("Starting 100 sequential transactions test...");
      const startTime = Date.now();
      
      // 提交100个交易
      for (let i = 0; i < 100; i++) {
        const data = mockTarget.interface.encodeFunctionData("setValue", [i]);
        await multiSigWallet.connect(owners[0]).submitTransaction(
          mockTarget.target,
          0,
          data
        );
        
        if (i % 20 === 19) {
          console.log(`Submitted ${i + 1} transactions`);
        }
      }

      const submitTime = Date.now();
      console.log(`100 transactions submitted in ${submitTime - startTime}ms`);

      // 验证交易数量
      expect(await multiSigWallet.getTransactionCount()).to.equal(100);

      // 批量确认前50个交易
      const firstBatch = Array.from({length: 20}, (_, i) => i);
      const secondBatch = Array.from({length: 20}, (_, i) => i + 20);
      const thirdBatch = Array.from({length: 10}, (_, i) => i + 40);

      await multiSigWallet.connect(owners[1]).batchConfirm(firstBatch);
      await multiSigWallet.connect(owners[1]).batchConfirm(secondBatch);
      await multiSigWallet.connect(owners[1]).batchConfirm(thirdBatch);

      const confirmTime = Date.now();
      console.log(`50 transactions confirmed in ${confirmTime - submitTime}ms`);

      // 验证执行状态
      for (let i = 0; i < 50; i++) {
        const [, , , executed] = await multiSigWallet.getTransaction(i);
        expect(executed).to.be.true;
      }

      const totalTime = Date.now() - startTime;
      console.log(`Total test time: ${totalTime}ms`);
      
      // 性能基准：应该在合理时间内完成
      expect(totalTime).to.be.lessThan(60000); // 60秒内完成
    });

    it("Should handle maximum batch size operations", async function () {
      console.log("Testing maximum batch size operations...");
      
      const maxBatchSize = 20;
      const targets = Array(maxBatchSize).fill(mockTarget.target);
      const values = Array(maxBatchSize).fill(0);
      const dataArray = Array(maxBatchSize).fill(
        mockTarget.interface.encodeFunctionData("setValue", [42])
      );

      const startTime = Date.now();

      // 批量提交最大数量的交易
      const submitTx = await multiSigWallet.connect(owners[0]).batchSubmit(targets, values, dataArray);
      const submitReceipt = await submitTx.wait();

      const submitTime = Date.now();
      console.log(`Batch submit ${maxBatchSize} transactions: ${submitTime - startTime}ms, Gas: ${submitReceipt.gasUsed}`);

      // 批量确认
      const transactionIds = Array.from({length: maxBatchSize}, (_, i) => i);
      const confirmTx = await multiSigWallet.connect(owners[1]).batchConfirm(transactionIds);
      const confirmReceipt = await confirmTx.wait();

      const confirmTime = Date.now();
      console.log(`Batch confirm ${maxBatchSize} transactions: ${confirmTime - submitTime}ms, Gas: ${confirmReceipt.gasUsed}`);

      // 第三个确认以执行交易
      const executeTx = await multiSigWallet.connect(owners[2]).batchConfirm(transactionIds);
      const executeReceipt = await executeTx.wait();

      const executeTime = Date.now();
      console.log(`Batch execute ${maxBatchSize} transactions: ${executeTime - confirmTime}ms, Gas: ${executeReceipt.gasUsed}`);

      // 验证所有交易都执行成功
      for (let i = 0; i < maxBatchSize; i++) {
        const [, , , executed] = await multiSigWallet.getTransaction(i);
        expect(executed).to.be.true;
      }

      const totalTime = executeTime - startTime;
      console.log(`Total batch operation time: ${totalTime}ms`);
      
      // Gas效率验证
      expect(submitReceipt.gasUsed).to.be.lessThan(5000000); // 5M gas limit
      expect(confirmReceipt.gasUsed).to.be.lessThan(3000000); // 3M gas limit
    });

    it("Should handle concurrent transaction submissions", async function () {
      console.log("Testing concurrent transaction submissions...");
      
      const concurrentCount = 10;
      const startTime = Date.now();

      // 并发提交交易
      const promises = [];
      for (let i = 0; i < concurrentCount; i++) {
        const data = mockTarget.interface.encodeFunctionData("setValue", [i]);
        promises.push(
          multiSigWallet.connect(owners[i % 5]).submitTransaction(
            mockTarget.target,
            0,
            data
          )
        );
      }

      await Promise.all(promises);

      const submitTime = Date.now();
      console.log(`${concurrentCount} concurrent submissions completed in ${submitTime - startTime}ms`);

      // 验证所有交易都正确提交
      expect(await multiSigWallet.getTransactionCount()).to.equal(concurrentCount);

      // 验证交易状态一致性
      for (let i = 0; i < concurrentCount; i++) {
        const confirmationCount = await multiSigWallet.getConfirmationCount(i);
        expect(confirmationCount).to.equal(1);
      }
    });
  });

  describe("Memory and Storage Stress Tests", function () {
    it("Should handle large data payloads efficiently", async function () {
      console.log("Testing large data payload handling...");
      
      // 创建大数据负载 (接近区块gas限制)
      const largeDataSizes = [1000, 5000, 10000]; // bytes
      
      for (const size of largeDataSizes) {
        const largeData = "0x" + "ab".repeat(size);
        const startTime = Date.now();

        await multiSigWallet.connect(owners[0]).submitTransaction(
          mockTarget.target,
          0,
          largeData
        );

        const submitTime = Date.now();
        console.log(`Submitted ${size * 2} bytes data in ${submitTime - startTime}ms`);

        // 验证数据正确存储
        const [, , storedData] = await multiSigWallet.getTransaction(await multiSigWallet.getTransactionCount() - 1n);
        expect(storedData).to.equal(largeData);
      }
    });

    it("Should maintain performance with many stored transactions", async function () {
      console.log("Testing performance with many stored transactions...");
      
      // 创建大量交易以测试存储性能
      const transactionCount = 200;
      const batchSize = 20;
      
      for (let batch = 0; batch < transactionCount / batchSize; batch++) {
        const targets = Array(batchSize).fill(mockTarget.target);
        const values = Array(batchSize).fill(0);
        const dataArray = Array(batchSize).fill("0x");

        const startTime = Date.now();
        await multiSigWallet.connect(owners[0]).batchSubmit(targets, values, dataArray);
        const endTime = Date.now();

        console.log(`Batch ${batch + 1}: ${endTime - startTime}ms`);
        
        // 验证性能不会随着交易数量增加而显著下降
        expect(endTime - startTime).to.be.lessThan(5000); // 5秒内完成
      }

      // 验证总交易数量
      expect(await multiSigWallet.getTransactionCount()).to.equal(transactionCount);

      // 测试查询性能
      const queryStart = Date.now();
      const lastTransaction = await multiSigWallet.getTransaction(transactionCount - 1);
      const queryEnd = Date.now();

      console.log(`Query last transaction: ${queryEnd - queryStart}ms`);
      expect(queryEnd - queryStart).to.be.lessThan(1000); // 1秒内完成查询
    });
  });

  describe("Gas Optimization Under Load", function () {
    it("Should maintain gas efficiency under heavy load", async function () {
      console.log("Testing gas efficiency under heavy load...");
      
      const loadTestRounds = 5;
      const transactionsPerRound = 20;
      const gasUsageHistory: bigint[] = [];

      for (let round = 0; round < loadTestRounds; round++) {
        const targets = Array(transactionsPerRound).fill(mockTarget.target);
        const values = Array(transactionsPerRound).fill(0);
        const dataArray = Array(transactionsPerRound).fill("0x");

        const tx = await multiSigWallet.connect(owners[0]).batchSubmit(targets, values, dataArray);
        const receipt = await tx.wait();
        
        gasUsageHistory.push(receipt.gasUsed);
        console.log(`Round ${round + 1} gas usage: ${receipt.gasUsed}`);
      }

      // 验证gas使用量保持稳定
      const avgGas = gasUsageHistory.reduce((a, b) => a + b, 0n) / BigInt(gasUsageHistory.length);
      const maxDeviation = avgGas / 10n; // 允许10%的偏差

      for (const gasUsed of gasUsageHistory) {
        const deviation = gasUsed > avgGas ? gasUsed - avgGas : avgGas - gasUsed;
        expect(deviation).to.be.lessThan(maxDeviation);
      }

      console.log(`Average gas usage: ${avgGas}`);
    });

    it("Should optimize gas for repeated operations", async function () {
      console.log("Testing gas optimization for repeated operations...");
      
      // 测试重复操作的gas优化
      const operationTypes = [
        { name: "Submit", operation: () => multiSigWallet.connect(owners[0]).submitTransaction(mockTarget.target, 0, "0x") },
        { name: "Confirm", operation: (txId: number) => multiSigWallet.connect(owners[1]).confirmTransaction(txId) },
        { name: "Revoke", operation: (txId: number) => multiSigWallet.connect(owners[1]).revokeConfirmation(txId) }
      ];

      for (const opType of operationTypes) {
        const gasUsages: bigint[] = [];
        
        for (let i = 0; i < 5; i++) {
          let tx;
          if (opType.name === "Submit") {
            tx = await opType.operation();
          } else {
            // 为确认和撤销操作准备交易
            if (opType.name === "Confirm") {
              await multiSigWallet.connect(owners[0]).submitTransaction(mockTarget.target, 0, "0x");
              const txCount = await multiSigWallet.getTransactionCount();
              tx = await opType.operation(Number(txCount) - 1);
            } else { // Revoke
              await multiSigWallet.connect(owners[0]).submitTransaction(mockTarget.target, 0, "0x");
              const txCount = await multiSigWallet.getTransactionCount();
              await multiSigWallet.connect(owners[1]).confirmTransaction(Number(txCount) - 1);
              tx = await opType.operation(Number(txCount) - 1);
            }
          }
          
          const receipt = await tx.wait();
          gasUsages.push(receipt.gasUsed);
        }

        const avgGas = gasUsages.reduce((a, b) => a + b, 0n) / BigInt(gasUsages.length);
        console.log(`${opType.name} average gas: ${avgGas}`);
        
        // 验证gas使用量的一致性
        const maxGas = gasUsages.reduce((a, b) => a > b ? a : b, 0n);
        const minGas = gasUsages.reduce((a, b) => a < b ? a : b, gasUsages[0]);
        const variance = maxGas - minGas;
        
        expect(variance).to.be.lessThan(avgGas / 5n); // 变化不超过平均值的20%
      }
    });
  });

  describe("Network Congestion Simulation", function () {
    it("Should handle high gas price scenarios", async function () {
      console.log("Testing high gas price scenario handling...");
      
      // 模拟网络拥堵时的高gas价格
      const highGasPrice = ethers.parseUnits("100", "gwei");
      
      const tx = await multiSigWallet.connect(owners[0]).submitTransaction(
        mockTarget.target,
        0,
        "0x",
        { gasPrice: highGasPrice }
      );

      const receipt = await tx.wait();
      console.log(`High gas price transaction gas used: ${receipt.gasUsed}`);
      
      // 验证交易仍然成功
      expect(await multiSigWallet.getTransactionCount()).to.equal(1);
    });

    it("Should handle gas limit edge cases", async function () {
      console.log("Testing gas limit edge cases...");
      
      // 测试接近gas限制的操作
      const nearLimitData = "0x" + "00".repeat(20000); // 大数据负载
      
      try {
        await multiSigWallet.connect(owners[0]).submitTransaction(
          mockTarget.target,
          0,
          nearLimitData,
          { gasLimit: 30000000 } // 设置高gas限制
        );
        
        console.log("Large transaction submitted successfully");
        expect(await multiSigWallet.getTransactionCount()).to.equal(1);
      } catch (error: any) {
        console.log("Large transaction failed as expected:", error.message);
        // 如果因为gas限制失败，这是预期的
        expect(error.message).to.include("gas");
      }
    });
  });

  describe("Scalability Tests", function () {
    it("Should scale with increasing number of owners", async function () {
      console.log("Testing scalability with increasing owners...");
      
      const ownerCounts = [3, 5, 10, 20];
      const performanceMetrics: any[] = [];

      for (const ownerCount of ownerCounts) {
        const testOwners = owners.slice(0, ownerCount).map(owner => owner.address);
        const required = Math.ceil(ownerCount / 2);

        const MultiSigWallet = await ethers.getContractFactory("MultiSigWallet");
        const testWallet = await MultiSigWallet.deploy(testOwners, required);

        // 测试基本操作性能
        const startTime = Date.now();
        
        await testWallet.connect(owners[0]).submitTransaction(mockTarget.target, 0, "0x");
        
        // 获得足够的确认
        for (let i = 1; i < required; i++) {
          await testWallet.connect(owners[i]).confirmTransaction(0);
        }

        const endTime = Date.now();
        const operationTime = endTime - startTime;

        performanceMetrics.push({
          ownerCount,
          required,
          operationTime
        });

        console.log(`${ownerCount} owners (${required} required): ${operationTime}ms`);
      }

      // 验证性能随所有者数量的增长是线性的，而不是指数的
      for (let i = 1; i < performanceMetrics.length; i++) {
        const prev = performanceMetrics[i - 1];
        const curr = performanceMetrics[i];
        
        const ownerRatio = curr.ownerCount / prev.ownerCount;
        const timeRatio = curr.operationTime / prev.operationTime;
        
        // 时间增长应该不超过所有者数量增长的2倍
        expect(timeRatio).to.be.lessThan(ownerRatio * 2);
      }
    });

    it("Should handle complex multi-step workflows", async function () {
      console.log("Testing complex multi-step workflows...");
      
      const workflowSteps = [
        "Add new owner",
        "Change requirement", 
        "Execute business transaction",
        "Emergency pause",
        "Emergency unpause",
        "Remove owner"
      ];

      const startTime = Date.now();

      // Step 1: 添加新所有者
      await multiSigWallet.connect(owners[0]).submitAddOwner(owners[5].address);
      await multiSigWallet.connect(owners[1]).confirmTransaction(0);
      await multiSigWallet.connect(owners[2]).confirmTransaction(0);

      // Step 2: 更改要求数量
      await multiSigWallet.connect(owners[0]).submitChangeRequirement(4);
      await multiSigWallet.connect(owners[1]).confirmTransaction(1);
      await multiSigWallet.connect(owners[2]).confirmTransaction(1);

      // Step 3: 执行业务交易
      await multiSigWallet.connect(owners[0]).submitTransaction(
        mockTarget.target,
        0,
        mockTarget.interface.encodeFunctionData("setValue", [999])
      );
      await multiSigWallet.connect(owners[1]).confirmTransaction(2);
      await multiSigWallet.connect(owners[2]).confirmTransaction(2);
      await multiSigWallet.connect(owners[5]).confirmTransaction(2);

      // Step 4: 紧急暂停
      const pauseData = multiSigWallet.interface.encodeFunctionData("emergencyPause");
      await multiSigWallet.connect(owners[0]).submitTransaction(multiSigWallet.target, 0, pauseData);
      await multiSigWallet.connect(owners[1]).confirmTransaction(3);
      await multiSigWallet.connect(owners[2]).confirmTransaction(3);
      await multiSigWallet.connect(owners[5]).confirmTransaction(3);

      // Step 5: 紧急解除暂停
      const unpauseData = multiSigWallet.interface.encodeFunctionData("emergencyUnpause");
      await multiSigWallet.connect(owners[0]).submitTransaction(multiSigWallet.target, 0, unpauseData);
      await multiSigWallet.connect(owners[1]).confirmTransaction(4);
      await multiSigWallet.connect(owners[2]).confirmTransaction(4);
      await multiSigWallet.connect(owners[5]).confirmTransaction(4);

      // Step 6: 移除所有者
      await multiSigWallet.connect(owners[0]).submitRemoveOwner(owners[4].address);
      await multiSigWallet.connect(owners[1]).confirmTransaction(5);
      await multiSigWallet.connect(owners[2]).confirmTransaction(5);
      await multiSigWallet.connect(owners[5]).confirmTransaction(5);

      const endTime = Date.now();
      const totalWorkflowTime = endTime - startTime;

      console.log(`Complete workflow executed in ${totalWorkflowTime}ms`);
      
      // 验证最终状态
      const finalOwners = await multiSigWallet.getOwners();
      expect(finalOwners).to.include(owners[5].address);
      expect(finalOwners).to.not.include(owners[4].address);
      expect(await multiSigWallet.required()).to.equal(4);
      expect(await multiSigWallet.paused()).to.be.false;
      
      // 性能验证
      expect(totalWorkflowTime).to.be.lessThan(30000); // 30秒内完成
    });
  });

  describe("Resource Exhaustion Tests", function () {
    it("Should handle memory pressure gracefully", async function () {
      console.log("Testing memory pressure handling...");
      
      // 创建大量小交易来测试内存使用
      const smallTransactionCount = 500;
      const batchSize = 20;
      
      for (let i = 0; i < smallTransactionCount / batchSize; i++) {
        const targets = Array(batchSize).fill(mockTarget.target);
        const values = Array(batchSize).fill(0);
        const dataArray = Array(batchSize).fill("0x");

        await multiSigWallet.connect(owners[0]).batchSubmit(targets, values, dataArray);
        
        if (i % 5 === 4) {
          console.log(`Created ${(i + 1) * batchSize} transactions`);
        }
      }

      // 验证所有交易都正确创建
      expect(await multiSigWallet.getTransactionCount()).to.equal(smallTransactionCount);

      // 测试查询性能
      const queryStart = Date.now();
      await multiSigWallet.getTransaction(smallTransactionCount - 1);
      const queryEnd = Date.now();

      console.log(`Query performance with ${smallTransactionCount} transactions: ${queryEnd - queryStart}ms`);
      expect(queryEnd - queryStart).to.be.lessThan(2000); // 2秒内完成
    });

    it("Should maintain functionality under sustained load", async function () {
      console.log("Testing sustained load handling...");
      
      const sustainedLoadDuration = 10; // 10轮操作
      const operationsPerRound = 10;
      
      for (let round = 0; round < sustainedLoadDuration; round++) {
        const roundStart = Date.now();
        
        // 每轮执行多种操作
        for (let op = 0; op < operationsPerRound; op++) {
          await multiSigWallet.connect(owners[op % 5]).submitTransaction(
            mockTarget.target,
            0,
            mockTarget.interface.encodeFunctionData("setValue", [round * operationsPerRound + op])
          );
        }

        const roundEnd = Date.now();
        console.log(`Round ${round + 1}: ${roundEnd - roundStart}ms`);
        
        // 验证性能保持稳定
        expect(roundEnd - roundStart).to.be.lessThan(10000); // 10秒内完成每轮
      }

      // 验证最终状态一致性
      const finalTxCount = await multiSigWallet.getTransactionCount();
      expect(finalTxCount).to.equal(sustainedLoadDuration * operationsPerRound);
    });
  });
});
