import { expect } from "chai";

describe("MultiSigWallet Extended Test Suite - Priority 3", function () {
  let multiSigWallet: any;
  let mockTarget: any;
  let owner1: any, owner2: any, owner3: any, owner4: any;
  let nonOwner: any;
  let ethers: any;

  beforeEach(async function () {
    const hre = require("hardhat");
    ethers = hre.ethers;
    
    // 获取测试账户
    [owner1, owner2, owner3, owner4, nonOwner] = await ethers.getSigners();

    // 设置多签名钱包参数
    const owners = [owner1.address, owner2.address, owner3.address];
    const required = 2;

    // 部署MultiSigWallet合约
    const MultiSigWallet = await ethers.getContractFactory("MultiSigWallet");
    multiSigWallet = await MultiSigWallet.deploy(owners, required);

    // 部署测试用的MockTarget合约
    const MockTarget = await ethers.getContractFactory("MockTarget");
    mockTarget = await MockTarget.deploy();

    // 为钱包充值
    await owner1.sendTransaction({
      to: multiSigWallet.target,
      value: ethers.parseEther("100.0")
    });
  });

  describe("边界测试 (Boundary Testing)", function () {
    describe("所有者管理边界", function () {
      it("应该处理最小所有者配置(1个)", async function () {
        const singleOwner = [owner1.address];
        const singleRequired = 1;

        const SingleOwnerWallet = await ethers.getContractFactory("MultiSigWallet");
        const singleWallet = await SingleOwnerWallet.deploy(singleOwner, singleRequired);

        expect(await singleWallet.getOwners()).to.deep.equal(singleOwner);
        expect(await singleWallet.required()).to.equal(1);
      });

      it("应该处理大量所有者(10个)", async function () {
        const manyOwners = [];
        for (let i = 0; i < 10; i++) {
          const wallet = ethers.Wallet.createRandom();
          manyOwners.push(wallet.address);
        }
        const manyRequired = 5;

        const ManyOwnerWallet = await ethers.getContractFactory("MultiSigWallet");
        const manyWallet = await ManyOwnerWallet.deploy(manyOwners, manyRequired);

        expect(await manyWallet.getOwners()).to.deep.equal(manyOwners);
        expect(await manyWallet.required()).to.equal(5);
      });

      it("应该拒绝无效的所有者配置", async function () {
        // 空所有者数组
        try {
          const MultiSigWallet = await ethers.getContractFactory("MultiSigWallet");
          await MultiSigWallet.deploy([], 1);
          expect.fail("Should have thrown");
        } catch (error: any) {
          expect(error.message).to.include("owners required");
        }

        // required大于所有者数量
        try {
          const MultiSigWallet = await ethers.getContractFactory("MultiSigWallet");
          await MultiSigWallet.deploy([owner1.address], 2);
          expect.fail("Should have thrown");
        } catch (error: any) {
          expect(error.message).to.include("invalid required number");
        }

        // required为0
        try {
          const MultiSigWallet = await ethers.getContractFactory("MultiSigWallet");
          await MultiSigWallet.deploy([owner1.address, owner2.address], 0);
          expect.fail("Should have thrown");
        } catch (error: any) {
          expect(error.message).to.include("invalid required number");
        }
      });
    });

    describe("交易值边界", function () {
      it("应该处理零值交易", async function () {
        const data = mockTarget.interface.encodeFunctionData("setValue", [42]);
        
        await multiSigWallet.connect(owner1).submitTransaction(
          mockTarget.target,
          0,
          data
        );

        await multiSigWallet.connect(owner2).confirmTransaction(0);

        const [, value, , executed] = await multiSigWallet.getTransaction(0);
        expect(value).to.equal(0);
        expect(executed).to.be.true;
      });

      it("应该处理最大uint96值", async function () {
        const maxValue = "79228162514264337593543950335"; // 2^96 - 1
        const data = mockTarget.interface.encodeFunctionData("setValue", [42]);
        
        await multiSigWallet.connect(owner1).submitTransaction(
          mockTarget.target,
          maxValue,
          data
        );

        const [, value] = await multiSigWallet.getTransaction(0);
        expect(value.toString()).to.equal(maxValue);
      });

      it("应该拒绝超过uint96的值", async function () {
        const overMaxValue = ethers.parseEther("100000000000000000000"); // 超过uint96
        const data = mockTarget.interface.encodeFunctionData("setValue", [42]);
        
        try {
          await multiSigWallet.connect(owner1).submitTransaction(
            mockTarget.target,
            overMaxValue,
            data
          );
          expect.fail("Should have thrown");
        } catch (error: any) {
          expect(error.message).to.include("value exceeds maximum");
        }
      });

      it("应该处理钱包余额边界", async function () {
        const walletBalance = await ethers.provider.getBalance(multiSigWallet.target);
        const data = "0x";
        
        // 尝试发送超过余额的金额
        await multiSigWallet.connect(owner1).submitTransaction(
          owner4.address,
          walletBalance + 1n,
          data
        );
        
        await multiSigWallet.connect(owner2).confirmTransaction(0);
        
        // 验证交易执行失败
        const [, , , executed] = await multiSigWallet.getTransaction(0);
        expect(executed).to.be.false;
      });
    });

    describe("数据大小边界", function () {
      it("应该处理空数据", async function () {
        await multiSigWallet.connect(owner1).submitTransaction(
          owner4.address,
          ethers.parseEther("1.0"),
          "0x"
        );

        await multiSigWallet.connect(owner2).confirmTransaction(0);

        const [, , data, executed] = await multiSigWallet.getTransaction(0);
        expect(data).to.equal("0x");
        expect(executed).to.be.true;
      });

      it("应该处理大数据负载", async function () {
        const largeData = "0x" + "ab".repeat(1000); // 2KB数据
        
        await multiSigWallet.connect(owner1).submitTransaction(
          mockTarget.target,
          0,
          largeData
        );

        const [, , data] = await multiSigWallet.getTransaction(0);
        expect(data).to.equal(largeData);
      });
    });
  });

  describe("安全漏洞测试 (Security Vulnerability Testing)", function () {
    describe("访问控制漏洞", function () {
      it("应该防止未授权的交易提交", async function () {
        try {
          await multiSigWallet.connect(nonOwner).submitTransaction(
            mockTarget.target,
            0,
            "0x"
          );
          expect.fail("Should have thrown");
        } catch (error: any) {
          expect(error.message).to.include("not owner");
        }
      });

      it("应该防止未授权的确认", async function () {
        await multiSigWallet.connect(owner1).submitTransaction(
          mockTarget.target,
          0,
          "0x"
        );

        try {
          await multiSigWallet.connect(nonOwner).confirmTransaction(0);
          expect.fail("Should have thrown");
        } catch (error: any) {
          expect(error.message).to.include("not owner");
        }
      });

      it("应该防止未授权的所有者管理", async function () {
        try {
          await multiSigWallet.connect(nonOwner).addOwner(nonOwner.address);
          expect.fail("Should have thrown");
        } catch (error: any) {
          expect(error.message).to.include("only wallet");
        }
      });

      it("应该防止批量操作的未授权访问", async function () {
        try {
          await multiSigWallet.connect(nonOwner).batchConfirm([0]);
          expect.fail("Should have thrown");
        } catch (error: any) {
          expect(error.message).to.include("not owner");
        }

        try {
          await multiSigWallet.connect(nonOwner).batchSubmit([mockTarget.target], [0], ["0x"]);
          expect.fail("Should have thrown");
        } catch (error: any) {
          expect(error.message).to.include("not owner");
        }
      });
    });

    describe("重放攻击保护", function () {
      it("应该防止交易重放", async function () {
        await multiSigWallet.connect(owner1).submitTransaction(
          mockTarget.target,
          0,
          "0x"
        );
        await multiSigWallet.connect(owner2).confirmTransaction(0);

        // 验证交易已执行
        const [, , , executed] = await multiSigWallet.getTransaction(0);
        expect(executed).to.be.true;

        // 尝试重新执行相同的交易
        try {
          await multiSigWallet.connect(owner1).executeTransaction(0);
          expect.fail("Should have thrown");
        } catch (error: any) {
          expect(error.message).to.include("already executed");
        }
      });

      it("应该防止重复确认", async function () {
        await multiSigWallet.connect(owner1).submitTransaction(
          mockTarget.target,
          0,
          "0x"
        );

        await multiSigWallet.connect(owner2).confirmTransaction(0);

        try {
          await multiSigWallet.connect(owner2).confirmTransaction(0);
          expect.fail("Should have thrown");
        } catch (error: any) {
          expect(error.message).to.include("already confirmed");
        }
      });
    });

    describe("拒绝服务(DoS)保护", function () {
      it("应该处理批量操作中的gas限制攻击", async function () {
        const maxBatchSize = 20;
        const targets = Array(maxBatchSize).fill(mockTarget.target);
        const values = Array(maxBatchSize).fill(0);
        const dataArray = Array(maxBatchSize).fill("0x");

        // 应该成功
        await multiSigWallet.connect(owner1).batchSubmit(targets, values, dataArray);

        // 尝试超过限制
        const oversizedTargets = Array(21).fill(mockTarget.target);
        const oversizedValues = Array(21).fill(0);
        const oversizedDataArray = Array(21).fill("0x");

        try {
          await multiSigWallet.connect(owner1).batchSubmit(oversizedTargets, oversizedValues, oversizedDataArray);
          expect.fail("Should have thrown");
        } catch (error: any) {
          expect(error.message).to.include("too many transactions");
        }
      });

      it("应该防止空批量操作DoS", async function () {
        try {
          await multiSigWallet.connect(owner1).batchConfirm([]);
          expect.fail("Should have thrown");
        } catch (error: any) {
          expect(error.message).to.include("empty transaction list");
        }
      });

      it("应该优雅处理失败的外部调用", async function () {
        const failingData = mockTarget.interface.encodeFunctionData("revertingFunction");
        
        await multiSigWallet.connect(owner1).submitTransaction(
          mockTarget.target,
          0,
          failingData
        );

        await multiSigWallet.connect(owner2).confirmTransaction(0);

        // 验证失败的调用不会阻止钱包操作
        const [, , , executed] = await multiSigWallet.getTransaction(0);
        expect(executed).to.be.false;

        // 钱包应该仍然可以正常操作
        await multiSigWallet.connect(owner1).submitTransaction(
          mockTarget.target,
          0,
          "0x"
        );
        expect(await multiSigWallet.getTransactionCount()).to.equal(2);
      });
    });

    describe("经济攻击", function () {
      it("应该处理余额不足攻击", async function () {
        const walletBalance = await ethers.provider.getBalance(multiSigWallet.target);
        const excessiveAmount = walletBalance + ethers.parseEther("1.0");

        await multiSigWallet.connect(owner1).submitTransaction(
          nonOwner.address,
          excessiveAmount,
          "0x"
        );

        await multiSigWallet.connect(owner2).confirmTransaction(0);

        // 验证交易失败
        const [, , , executed] = await multiSigWallet.getTransaction(0);
        expect(executed).to.be.false;

        // 验证钱包余额未受影响
        const finalBalance = await ethers.provider.getBalance(multiSigWallet.target);
        expect(finalBalance).to.equal(walletBalance);
      });
    });
  });

  describe("性能压力测试 (Performance Stress Testing)", function () {
    it("应该处理大量顺序交易", async function () {
      console.log("开始大量顺序交易测试...");
      const startTime = Date.now();
      
      // 提交50个交易
      for (let i = 0; i < 50; i++) {
        const data = mockTarget.interface.encodeFunctionData("setValue", [i]);
        await multiSigWallet.connect(owner1).submitTransaction(
          mockTarget.target,
          0,
          data
        );
        
        if (i % 10 === 9) {
          console.log(`已提交 ${i + 1} 个交易`);
        }
      }

      const submitTime = Date.now();
      console.log(`50个交易提交耗时: ${submitTime - startTime}ms`);

      // 验证交易数量
      expect(await multiSigWallet.getTransactionCount()).to.equal(50);

      // 批量确认前20个交易
      const batchIds = Array.from({length: 20}, (_, i) => i);
      await multiSigWallet.connect(owner2).batchConfirm(batchIds);

      const confirmTime = Date.now();
      console.log(`20个交易确认耗时: ${confirmTime - submitTime}ms`);

      // 验证执行状态
      for (let i = 0; i < 20; i++) {
        const [, , , executed] = await multiSigWallet.getTransaction(i);
        expect(executed).to.be.true;
      }

      const totalTime = Date.now() - startTime;
      console.log(`总测试时间: ${totalTime}ms`);
      expect(totalTime).to.be.lessThan(30000); // 30秒内完成
    });

    it("应该处理最大批量大小操作", async function () {
      console.log("测试最大批量大小操作...");
      
      const maxBatchSize = 20;
      const targets = Array(maxBatchSize).fill(mockTarget.target);
      const values = Array(maxBatchSize).fill(0);
      const dataArray = Array(maxBatchSize).fill("0x");

      const startTime = Date.now();

      const submitTx = await multiSigWallet.connect(owner1).batchSubmit(targets, values, dataArray);
      const submitReceipt = await submitTx.wait();

      const submitTime = Date.now();
      console.log(`批量提交${maxBatchSize}个交易: ${submitTime - startTime}ms, Gas: ${submitReceipt.gasUsed}`);

      const transactionIds = Array.from({length: maxBatchSize}, (_, i) => i);
      const confirmTx = await multiSigWallet.connect(owner2).batchConfirm(transactionIds);
      const confirmReceipt = await confirmTx.wait();

      const confirmTime = Date.now();
      console.log(`批量确认${maxBatchSize}个交易: ${confirmTime - submitTime}ms, Gas: ${confirmReceipt.gasUsed}`);

      // 验证所有交易都执行成功
      for (let i = 0; i < maxBatchSize; i++) {
        const [, , , executed] = await multiSigWallet.getTransaction(i);
        expect(executed).to.be.true;
      }

      // Gas效率验证
      expect(submitReceipt.gasUsed).to.be.lessThan(5000000); // 5M gas limit
      expect(confirmReceipt.gasUsed).to.be.lessThan(3000000); // 3M gas limit
    });

    it("应该在负载下保持gas效率", async function () {
      console.log("测试负载下的gas效率...");
      
      const gasUsageHistory: bigint[] = [];
      const batchSize = 10;

      for (let round = 0; round < 3; round++) {
        const targets = Array(batchSize).fill(mockTarget.target);
        const values = Array(batchSize).fill(0);
        const dataArray = Array(batchSize).fill("0x");

        const tx = await multiSigWallet.connect(owner1).batchSubmit(targets, values, dataArray);
        const receipt = await tx.wait();
        
        gasUsageHistory.push(receipt.gasUsed);
        console.log(`第${round + 1}轮gas使用: ${receipt.gasUsed}`);
      }

      // 验证gas使用量保持稳定
      const avgGas = gasUsageHistory.reduce((a, b) => a + b, 0n) / BigInt(gasUsageHistory.length);
      const maxDeviation = avgGas / 10n; // 允许10%的偏差

      for (const gasUsed of gasUsageHistory) {
        const deviation = gasUsed > avgGas ? gasUsed - avgGas : avgGas - gasUsed;
        expect(deviation).to.be.lessThan(maxDeviation);
      }

      console.log(`平均gas使用: ${avgGas}`);
    });

    it("应该处理并发交易提交", async function () {
      console.log("测试并发交易提交...");
      
      const concurrentCount = 10;
      const startTime = Date.now();

      // 并发提交交易
      const promises = [];
      for (let i = 0; i < concurrentCount; i++) {
        const data = mockTarget.interface.encodeFunctionData("setValue", [i]);
        promises.push(
          multiSigWallet.connect(owner1).submitTransaction(
            mockTarget.target,
            0,
            data
          )
        );
      }

      await Promise.all(promises);

      const submitTime = Date.now();
      console.log(`${concurrentCount}个并发提交完成耗时: ${submitTime - startTime}ms`);

      // 验证所有交易都正确提交
      expect(await multiSigWallet.getTransactionCount()).to.equal(concurrentCount);

      // 验证交易状态一致性
      for (let i = 0; i < concurrentCount; i++) {
        const confirmationCount = await multiSigWallet.getConfirmationCount(i);
        expect(confirmationCount).to.equal(1);
      }
    });
  });

  describe("集成测试 (Integration Testing)", function () {
    it("应该处理复杂的多步骤工作流", async function () {
      console.log("测试复杂多步骤工作流...");
      
      const startTime = Date.now();

      // Step 1: 添加新所有者
      await multiSigWallet.connect(owner1).submitAddOwner(owner4.address);
      await multiSigWallet.connect(owner2).confirmTransaction(0);

      // Step 2: 更改要求数量
      await multiSigWallet.connect(owner1).submitChangeRequirement(3);
      await multiSigWallet.connect(owner2).confirmTransaction(1);

      // Step 3: 执行需要3个确认的交易
      await multiSigWallet.connect(owner1).submitTransaction(
        mockTarget.target,
        0,
        mockTarget.interface.encodeFunctionData("setValue", [999])
      );

      await multiSigWallet.connect(owner2).confirmTransaction(2);
      await multiSigWallet.connect(owner4).confirmTransaction(2);

      // Step 4: 紧急暂停
      const pauseData = multiSigWallet.interface.encodeFunctionData("emergencyPause");
      await multiSigWallet.connect(owner1).submitTransaction(multiSigWallet.target, 0, pauseData);
      await multiSigWallet.connect(owner2).confirmTransaction(3);
      await multiSigWallet.connect(owner4).confirmTransaction(3);

      // Step 5: 紧急解除暂停
      const unpauseData = multiSigWallet.interface.encodeFunctionData("emergencyUnpause");
      await multiSigWallet.connect(owner1).submitTransaction(multiSigWallet.target, 0, unpauseData);
      await multiSigWallet.connect(owner2).confirmTransaction(4);
      await multiSigWallet.connect(owner4).confirmTransaction(4);

      const endTime = Date.now();
      const totalWorkflowTime = endTime - startTime;

      console.log(`完整工作流执行耗时: ${totalWorkflowTime}ms`);
      
      // 验证最终状态
      const finalOwners = await multiSigWallet.getOwners();
      expect(finalOwners).to.include(owner4.address);
      expect(await multiSigWallet.required()).to.equal(3);
      expect(await multiSigWallet.paused()).to.be.false;
      
      // 性能验证
      expect(totalWorkflowTime).to.be.lessThan(20000); // 20秒内完成
    });

    it("应该保持复杂操作中的状态一致性", async function () {
      const initialOwners = await multiSigWallet.getOwners();
      const initialRequired = await multiSigWallet.required();
      const initialTxCount = await multiSigWallet.getTransactionCount();

      // 执行一系列复杂操作
      await multiSigWallet.connect(owner1).submitTransaction(mockTarget.target, 0, "0x");
      await multiSigWallet.connect(owner1).submitTransaction(mockTarget.target, 0, "0x");
      await multiSigWallet.connect(owner2).confirmTransaction(0);
      await multiSigWallet.connect(owner1).revokeConfirmation(1);
      await multiSigWallet.connect(owner2).confirmTransaction(1);

      // 验证状态一致性
      expect(await multiSigWallet.getOwners()).to.deep.equal(initialOwners);
      expect(await multiSigWallet.required()).to.equal(initialRequired);
      expect(await multiSigWallet.getTransactionCount()).to.equal(initialTxCount + 2n);

      // 验证交易状态
      expect(await multiSigWallet.isConfirmed(0)).to.be.true;
      expect(await multiSigWallet.isConfirmed(1)).to.be.true;
      expect(await multiSigWallet.confirmations(1, owner1.address)).to.be.false;
      expect(await multiSigWallet.confirmations(1, owner2.address)).to.be.true;
    });
  });

  describe("Gas优化验证 (Gas Optimization Validation)", function () {
    it("应该展示批量操作的gas节省", async function () {
      console.log("对比单个操作vs批量操作的gas使用...");
      
      const data = mockTarget.interface.encodeFunctionData("setValue", [42]);
      
      // 单个操作的Gas使用
      const singleTxs = [];
      const startCount = await multiSigWallet.getTransactionCount();
      
      for (let i = 0; i < 3; i++) {
        const tx = await multiSigWallet.connect(owner1).submitTransaction(
          mockTarget.target, 
          0,
          data
        );
        const receipt = await tx.wait();
        singleTxs.push(receipt.gasUsed);
      }
      
      const singleConfirms = [];
      for (let i = 0; i < 3; i++) {
        const tx = await multiSigWallet.connect(owner2).confirmTransaction(Number(startCount) + i);
        const receipt = await tx.wait();
        singleConfirms.push(receipt.gasUsed);
      }
      
      // 批量操作的Gas使用
      const targets = Array(3).fill(mockTarget.target);
      const values = Array(3).fill(0);
      const dataArray = Array(3).fill(data);
      
      const batchSubmitTx = await multiSigWallet.connect(owner1).batchSubmit(targets, values, dataArray);
      const batchSubmitReceipt = await batchSubmitTx.wait();
      
      const newStartCount = await multiSigWallet.getTransactionCount();
      const batchIds = [Number(newStartCount) - 3, Number(newStartCount) - 2, Number(newStartCount) - 1];
      
      const batchConfirmTx = await multiSigWallet.connect(owner2).batchConfirm(batchIds);
      const batchConfirmReceipt = await batchConfirmTx.wait();
      
      // 计算Gas节省
      const singleTotalGas = singleTxs.reduce((a, b) => a + b, 0n) + 
                            singleConfirms.reduce((a, b) => a + b, 0n);
      const batchTotalGas = batchSubmitReceipt.gasUsed + batchConfirmReceipt.gasUsed;
      
      const gasSaved = singleTotalGas - batchTotalGas;
      const percentSaved = (Number(gasSaved) / Number(singleTotalGas)) * 100;
      
      console.log(`单个操作总gas: ${singleTotalGas}`);
      console.log(`批量操作总gas: ${batchTotalGas}`);
      console.log(`节省gas: ${gasSaved} (${percentSaved.toFixed(2)}%)`);
      
      // 验证批量操作确实节省了Gas
      expect(batchTotalGas).to.be.lessThan(singleTotalGas);
      expect(percentSaved).to.be.greaterThan(10); // 至少节省10%的Gas
    });
  });
});
