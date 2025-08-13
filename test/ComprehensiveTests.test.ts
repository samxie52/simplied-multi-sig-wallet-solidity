import { expect } from "chai";

describe("MultiSigWallet Comprehensive Test Suite", function () {
  let multiSigWallet: any;
  let mockTarget: any;
  let mockERC20: any;
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

    // 部署ERC20测试代币
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockERC20 = await MockERC20.deploy("Test Token", "TEST", ethers.parseEther("1000000"));

    // 为钱包充值
    await owner1.sendTransaction({
      to: multiSigWallet.target,
      value: ethers.parseEther("100.0")
    });

    // 为钱包转入ERC20代币
    await mockERC20.transfer(multiSigWallet.target, ethers.parseEther("10000"));
  });

  describe("Boundary Value Testing", function () {
    it("Should handle minimum owners configuration", async function () {
      const singleOwner = [owner1.address];
      const singleRequired = 1;

      const SingleOwnerWallet = await ethers.getContractFactory("MultiSigWallet");
      const singleWallet = await SingleOwnerWallet.deploy(singleOwner, singleRequired);

      expect(await singleWallet.getOwners()).to.deep.equal(singleOwner);
      expect(await singleWallet.required()).to.equal(1);
    });

    it("Should reject invalid owner configurations", async function () {
      try {
        const MultiSigWallet = await ethers.getContractFactory("MultiSigWallet");
        await MultiSigWallet.deploy([], 1);
        expect.fail("Should have thrown");
      } catch (error: any) {
        expect(error.message).to.include("owners required");
      }
    });

    it("Should handle zero value transactions", async function () {
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

    it("Should handle maximum uint96 value", async function () {
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

    it("Should handle large data payloads", async function () {
      const largeData = "0x" + "ab".repeat(1000); // 2KB of data
      
      await multiSigWallet.connect(owner1).submitTransaction(
        mockTarget.target,
        0,
        largeData
      );

      const [, , data] = await multiSigWallet.getTransaction(0);
      expect(data).to.equal(largeData);
    });
  });

  describe("Security Testing", function () {
    it("Should prevent unauthorized access", async function () {
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

    it("Should prevent double confirmation", async function () {
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

    it("Should prevent execution of unconfirmed transactions", async function () {
      await multiSigWallet.connect(owner1).submitTransaction(
        mockTarget.target,
        0,
        "0x"
      );

      // 只有一个确认，不足以执行
      try {
        await multiSigWallet.connect(owner1).executeTransaction(0);
        expect.fail("Should have thrown");
      } catch (error: any) {
        expect(error.message).to.include("not confirmed");
      }
    });

    it("Should handle failed external calls gracefully", async function () {
      const failingData = mockTarget.interface.encodeFunctionData("revertingFunction");
      
      await multiSigWallet.connect(owner1).submitTransaction(
        mockTarget.target,
        0,
        failingData
      );

      await multiSigWallet.connect(owner2).confirmTransaction(0);

      const [, , , executed] = await multiSigWallet.getTransaction(0);
      expect(executed).to.be.false; // 应该执行失败但不影响钱包
    });

    it("Should protect against insufficient balance", async function () {
      const walletBalance = await ethers.provider.getBalance(multiSigWallet.target);
      const excessiveAmount = walletBalance + ethers.parseEther("1.0");

      await multiSigWallet.connect(owner1).submitTransaction(
        nonOwner.address,
        excessiveAmount,
        "0x"
      );

      await multiSigWallet.connect(owner2).confirmTransaction(0);

      const [, , , executed] = await multiSigWallet.getTransaction(0);
      expect(executed).to.be.false;
    });
  });

  describe("Integration Testing", function () {
    it("Should integrate with ERC20 token operations", async function () {
      const transferAmount = ethers.parseEther("100");
      const transferData = mockERC20.interface.encodeFunctionData("transfer", [
        owner4.address,
        transferAmount
      ]);

      await multiSigWallet.connect(owner1).submitTransaction(
        mockERC20.target,
        0,
        transferData
      );

      await multiSigWallet.connect(owner2).confirmTransaction(0);

      const balance = await mockERC20.balanceOf(owner4.address);
      expect(balance).to.equal(transferAmount);
    });

    it("Should handle complex multi-step workflows", async function () {
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

      // 验证最终状态
      const owners = await multiSigWallet.getOwners();
      expect(owners).to.include(owner4.address);
      expect(await multiSigWallet.required()).to.equal(3);

      const [, , , executed] = await multiSigWallet.getTransaction(2);
      expect(executed).to.be.true;
    });

    it("Should integrate batch operations with different contract types", async function () {
      const targets = [
        mockTarget.target,
        mockERC20.target,
        owner4.address
      ];
      
      const values = [0, 0, ethers.parseEther("1.0")];
      
      const dataArray = [
        mockTarget.interface.encodeFunctionData("setValue", [123]),
        mockERC20.interface.encodeFunctionData("transfer", [owner4.address, ethers.parseEther("50")]),
        "0x"
      ];

      await multiSigWallet.connect(owner1).batchSubmit(targets, values, dataArray);
      await multiSigWallet.connect(owner2).batchConfirm([0, 1, 2]);

      // 验证所有交易都执行成功
      for (let i = 0; i < 3; i++) {
        const [, , , executed] = await multiSigWallet.getTransaction(i);
        expect(executed).to.be.true;
      }

      // 验证ERC20转移
      const balance = await mockERC20.balanceOf(owner4.address);
      expect(balance).to.equal(ethers.parseEther("50"));
    });

    it("Should integrate emergency pause functionality", async function () {
      // 创建紧急暂停交易
      const pauseData = multiSigWallet.interface.encodeFunctionData("emergencyPause");
      await multiSigWallet.connect(owner1).submitTransaction(
        multiSigWallet.target,
        0,
        pauseData
      );

      await multiSigWallet.connect(owner2).confirmTransaction(0);

      // 验证钱包已暂停
      expect(await multiSigWallet.paused()).to.be.true;

      // 验证暂停期间无法提交新交易
      try {
        await multiSigWallet.connect(owner1).submitTransaction(
          mockTarget.target,
          0,
          "0x"
        );
        expect.fail("Should have thrown");
      } catch (error: any) {
        expect(error.message).to.include("paused");
      }

      // 解除暂停
      const unpauseData = multiSigWallet.interface.encodeFunctionData("emergencyUnpause");
      await multiSigWallet.connect(owner1).submitTransaction(
        multiSigWallet.target,
        0,
        unpauseData
      );

      await multiSigWallet.connect(owner2).confirmTransaction(1);

      // 验证钱包已恢复
      expect(await multiSigWallet.paused()).to.be.false;

      // 验证可以正常提交交易
      await multiSigWallet.connect(owner1).submitTransaction(
        mockTarget.target,
        0,
        "0x"
      );
      expect(await multiSigWallet.getTransactionCount()).to.equal(3);
    });
  });

  describe("Performance and Stress Testing", function () {
    it("Should handle high volume transactions efficiently", async function () {
      console.log("Testing high volume transaction processing...");
      const startTime = Date.now();
      
      // 提交50个交易
      for (let i = 0; i < 50; i++) {
        const data = mockTarget.interface.encodeFunctionData("setValue", [i]);
        await multiSigWallet.connect(owner1).submitTransaction(
          mockTarget.target,
          0,
          data
        );
      }

      const submitTime = Date.now();
      console.log(`50 transactions submitted in ${submitTime - startTime}ms`);

      // 验证交易数量
      expect(await multiSigWallet.getTransactionCount()).to.equal(50);

      // 批量确认前20个交易
      const batchIds = Array.from({length: 20}, (_, i) => i);
      await multiSigWallet.connect(owner2).batchConfirm(batchIds);

      const confirmTime = Date.now();
      console.log(`20 transactions confirmed in ${confirmTime - submitTime}ms`);

      // 验证执行状态
      for (let i = 0; i < 20; i++) {
        const [, , , executed] = await multiSigWallet.getTransaction(i);
        expect(executed).to.be.true;
      }

      const totalTime = Date.now() - startTime;
      console.log(`Total test time: ${totalTime}ms`);
      expect(totalTime).to.be.lessThan(30000); // 30秒内完成
    });

    it("Should maintain gas efficiency under load", async function () {
      console.log("Testing gas efficiency under load...");
      
      const gasUsageHistory: bigint[] = [];
      const batchSize = 10;

      for (let round = 0; round < 3; round++) {
        const targets = Array(batchSize).fill(mockTarget.target);
        const values = Array(batchSize).fill(0);
        const dataArray = Array(batchSize).fill("0x");

        const tx = await multiSigWallet.connect(owner1).batchSubmit(targets, values, dataArray);
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

    it("Should handle maximum batch size operations", async function () {
      console.log("Testing maximum batch size operations...");
      
      const maxBatchSize = 20;
      const targets = Array(maxBatchSize).fill(mockTarget.target);
      const values = Array(maxBatchSize).fill(0);
      const dataArray = Array(maxBatchSize).fill("0x");

      const startTime = Date.now();

      const submitTx = await multiSigWallet.connect(owner1).batchSubmit(targets, values, dataArray);
      const submitReceipt = await submitTx.wait();

      const submitTime = Date.now();
      console.log(`Batch submit ${maxBatchSize} transactions: ${submitTime - startTime}ms, Gas: ${submitReceipt.gasUsed}`);

      const transactionIds = Array.from({length: maxBatchSize}, (_, i) => i);
      const confirmTx = await multiSigWallet.connect(owner2).batchConfirm(transactionIds);
      const confirmReceipt = await confirmTx.wait();

      const confirmTime = Date.now();
      console.log(`Batch confirm ${maxBatchSize} transactions: ${confirmTime - submitTime}ms, Gas: ${confirmReceipt.gasUsed}`);

      // 验证所有交易都执行成功
      for (let i = 0; i < maxBatchSize; i++) {
        const [, , , executed] = await multiSigWallet.getTransaction(i);
        expect(executed).to.be.true;
      }

      // Gas效率验证
      expect(submitReceipt.gasUsed).to.be.lessThan(5000000); // 5M gas limit
      expect(confirmReceipt.gasUsed).to.be.lessThan(3000000); // 3M gas limit
    });

    it("Should handle edge cases in batch operations", async function () {
      // 测试空批量操作
      try {
        await multiSigWallet.connect(owner1).batchConfirm([]);
        expect.fail("Should have thrown");
      } catch (error: any) {
        expect(error.message).to.include("empty transaction list");
      }

      // 测试超过最大批量大小
      const oversizedIds = Array.from({length: 21}, (_, i) => i);
      try {
        await multiSigWallet.connect(owner1).batchConfirm(oversizedIds);
        expect.fail("Should have thrown");
      } catch (error: any) {
        expect(error.message).to.include("too many transactions");
      }

      // 测试数组长度不匹配
      try {
        await multiSigWallet.connect(owner1).batchSubmit(
          [mockTarget.target],
          [0, 0], // 长度不匹配
          ["0x"]
        );
        expect.fail("Should have thrown");
      } catch (error: any) {
        expect(error.message).to.include("array length mismatch");
      }
    });
  });

  describe("State Consistency Testing", function () {
    it("Should maintain consistent state across complex operations", async function () {
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

    it("Should handle concurrent operations correctly", async function () {
      // 模拟并发操作
      const promises = [];
      
      // 同时提交多个交易
      for (let i = 0; i < 5; i++) {
        promises.push(
          multiSigWallet.connect(owner1).submitTransaction(
            mockTarget.target,
            0,
            mockTarget.interface.encodeFunctionData("setValue", [i])
          )
        );
      }

      await Promise.all(promises);

      // 验证所有交易都正确提交
      expect(await multiSigWallet.getTransactionCount()).to.equal(5);

      // 批量确认所有交易
      await multiSigWallet.connect(owner2).batchConfirm([0, 1, 2, 3, 4]);

      // 验证所有交易都执行成功
      for (let i = 0; i < 5; i++) {
        const [, , , executed] = await multiSigWallet.getTransaction(i);
        expect(executed).to.be.true;
      }
    });
  });

  describe("Gas Optimization Validation", function () {
    it("Should demonstrate gas savings with batch operations", async function () {
      console.log("Comparing single vs batch operation gas usage...");
      
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
      
      console.log(`Single operations total gas: ${singleTotalGas}`);
      console.log(`Batch operations total gas: ${batchTotalGas}`);
      console.log(`Gas saved: ${gasSaved} (${percentSaved.toFixed(2)}%)`);
      
      // 验证批量操作确实节省了Gas
      expect(batchTotalGas).to.be.lessThan(singleTotalGas);
      expect(percentSaved).to.be.greaterThan(10); // 至少节省10%的Gas
    });
  });
});
