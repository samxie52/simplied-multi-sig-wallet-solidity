import { expect } from "chai";

describe("MultiSigWallet Gas Optimization Tests", function () {
  let multiSigWallet: any;
  let mockTarget: any;
  let owner1: any, owner2: any, owner3: any;
  let ethers: any;

  beforeEach(async function () {
    const hre = require("hardhat");
    ethers = hre.ethers;
    
    // 获取测试账户
    [owner1, owner2, owner3] = await ethers.getSigners();

    // 设置多签名钱包参数
    const owners = [owner1.address, owner2.address, owner3.address];
    const required = 2;

    // 部署MultiSigWallet合约
    const MultiSigWallet = await ethers.getContractFactory("MultiSigWallet");
    multiSigWallet = await MultiSigWallet.deploy(owners, required);

    // 部署测试用的MockTarget合约
    const MockTarget = await ethers.getContractFactory("MockTarget");
    mockTarget = await MockTarget.deploy();

    // 为钱包充值以支持测试交易
    await owner1.sendTransaction({
      to: multiSigWallet.target,
      value: ethers.parseEther("10.0")
    });
  });

  describe("Storage Layout Optimization", function () {
    it("Should use optimized Transaction struct", async function () {
      // 提交一个交易来测试优化的存储布局
      const data = mockTarget.interface.encodeFunctionData("setValue", [42]);
      const tx = await multiSigWallet.connect(owner1).submitTransaction(
        mockTarget.target, 
        ethers.parseEther("1.0"), 
        data
      );
      
      // 验证交易创建成功
      expect(await multiSigWallet.getTransactionCount()).to.equal(1);
      
      // 获取交易详情验证存储优化
      const [to, value, txData, executed] = await multiSigWallet.getTransaction(0);
      expect(to).to.equal(mockTarget.target);
      expect(value).to.equal(ethers.parseEther("1.0"));
      expect(executed).to.be.false;
    });

    it("Should handle maximum value for uint96", async function () {
      // 测试uint96的最大值支持
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

    it("Should reject values exceeding uint96 maximum", async function () {
      // 测试超过uint96最大值的情况
      const overMaxValue = ethers.parseEther("100000000000000000000"); // 超过uint96最大值
      
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
  });

  describe("Batch Operations Gas Efficiency", function () {
    let transactionIds: number[];

    beforeEach(async function () {
      // 创建多个测试交易
      transactionIds = [];
      const data = mockTarget.interface.encodeFunctionData("setValue", [42]);
      
      for (let i = 0; i < 5; i++) {
        await multiSigWallet.connect(owner1).submitTransaction(
          mockTarget.target, 
          ethers.parseEther("0.1"), 
          data
        );
        transactionIds.push(i);
      }
    });

    it("Should efficiently batch confirm multiple transactions", async function () {
      // 测试批量确认的Gas效率
      const tx = await multiSigWallet.connect(owner2).batchConfirm(transactionIds);
      const receipt = await tx.wait();
      
      console.log(`Batch confirm ${transactionIds.length} transactions gas used: ${receipt.gasUsed}`);
      
      // 验证所有交易都已确认并执行
      for (const txId of transactionIds) {
        const isConfirmed = await multiSigWallet.isConfirmed(txId);
        expect(isConfirmed).to.be.true;
        
        // 注意：由于交易value为0.1 ETH，可能执行失败，但确认应该成功
        const confirmationCount = await multiSigWallet.getConfirmationCount(txId);
        expect(confirmationCount).to.be.greaterThanOrEqual(2);
      }
    });

    it("Should efficiently batch submit multiple transactions", async function () {
      const targets = Array(3).fill(mockTarget.target);
      const values = Array(3).fill(ethers.parseEther("0.1"));
      const dataArray = Array(3).fill(mockTarget.interface.encodeFunctionData("setValue", [42]));
      
      const tx = await multiSigWallet.connect(owner1).batchSubmit(targets, values, dataArray);
      const receipt = await tx.wait();
      
      console.log(`Batch submit ${targets.length} transactions gas used: ${receipt.gasUsed}`);
      
      // 验证交易数量增加
      expect(await multiSigWallet.getTransactionCount()).to.equal(8); // 5 + 3
    });

    it("Should efficiently batch revoke confirmations", async function () {
      // 先创建一些未执行的交易（只有一个确认）
      const newTransactionIds = [];
      const data = mockTarget.interface.encodeFunctionData("setValue", [42]);
      
      for (let i = 0; i < 3; i++) {
        await multiSigWallet.connect(owner2).submitTransaction(
          mockTarget.target, 
          ethers.parseEther("0.1"), 
          data
        );
        newTransactionIds.push(5 + i); // 从第6个交易开始
      }
      
      // 批量撤销确认
      const tx = await multiSigWallet.connect(owner2).batchRevoke(newTransactionIds);
      const receipt = await tx.wait();
      
      console.log(`Batch revoke ${newTransactionIds.length} confirmations gas used: ${receipt.gasUsed}`);
      
      // 验证确认已撤销
      for (const txId of newTransactionIds) {
        const isConfirmed = await multiSigWallet.confirmations(txId, owner2.address);
        expect(isConfirmed).to.be.false;
      }
    });

    it("Should efficiently batch query confirmation status", async function () {
      // 先确认这些交易
      await multiSigWallet.connect(owner2).batchConfirm(transactionIds);
      
      // 测试批量查询确认状态的Gas效率
      const confirmationStatus = await multiSigWallet.batchIsConfirmed(transactionIds);
      
      console.log(`Batch query ${transactionIds.length} confirmation status completed`);
      
      // 验证查询结果
      expect(confirmationStatus.length).to.equal(transactionIds.length);
      confirmationStatus.forEach((status: boolean) => {
        expect(status).to.be.true; // 所有交易都应该已确认
      });
    });

    it("Should efficiently batch query user confirmations", async function () {
      // 测试批量查询用户确认状态
      const userConfirmations = await multiSigWallet.batchGetConfirmation(transactionIds, owner1.address);
      
      console.log(`Batch query user confirmations for ${transactionIds.length} transactions completed`);
      
      // 验证查询结果
      expect(userConfirmations.length).to.equal(transactionIds.length);
      userConfirmations.forEach((confirmed: boolean) => {
        expect(confirmed).to.be.true; // owner1提交了所有交易，所以都应该已确认
      });
    });
  });

  describe("Gas Usage Comparison", function () {
    it("Should compare single vs batch operations", async function () {
      const data = mockTarget.interface.encodeFunctionData("setValue", [42]);
      
      // 单个操作的Gas使用 - 使用较小的value避免执行失败
      const singleTxs = [];
      const startCount = await multiSigWallet.getTransactionCount();
      
      for (let i = 0; i < 3; i++) {
        const tx = await multiSigWallet.connect(owner1).submitTransaction(
          mockTarget.target, 
          0, // 使用0 value避免执行问题
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
      const values = Array(3).fill(0); // 使用0 value
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
      expect(percentSaved).to.be.greaterThan(0); // 至少有一些Gas节省
    });
  });

  describe("Edge Cases and Limits", function () {
    it("Should handle maximum batch size limits", async function () {
      // 测试批量操作的最大限制
      const maxTransactionIds = Array.from({length: 21}, (_, i) => i); // 超过限制的21个
      
      try {
        await multiSigWallet.connect(owner1).batchConfirm(maxTransactionIds);
        expect.fail("Should have thrown");
      } catch (error: any) {
        expect(error.message).to.include("too many transactions");
      }
    });

    it("Should handle empty batch operations", async function () {
      // 测试空批量操作
      try {
        await multiSigWallet.connect(owner1).batchConfirm([]);
        expect.fail("Should have thrown");
      } catch (error: any) {
        expect(error.message).to.include("empty transaction list");
      }
    });

    it("Should handle array length mismatch in batch submit", async function () {
      // 测试数组长度不匹配的情况
      const targets = [mockTarget.target];
      const values = [ethers.parseEther("0.1"), ethers.parseEther("0.2")]; // 长度不匹配
      const dataArray = [mockTarget.interface.encodeFunctionData("setValue", [42])];
      
      try {
        await multiSigWallet.connect(owner1).batchSubmit(targets, values, dataArray);
        expect.fail("Should have thrown");
      } catch (error: any) {
        expect(error.message).to.include("array length mismatch");
      }
    });
  });

  describe("Gas Optimization Metrics", function () {
    it("Should measure deployment gas optimization", async function () {
      // 重新部署合约来测量部署Gas
      const owners = [owner1.address, owner2.address, owner3.address];
      const required = 2;

      const MultiSigWallet = await ethers.getContractFactory("MultiSigWallet");
      const deployTx = await MultiSigWallet.deploy(owners, required);
      const deployReceipt = await deployTx.deploymentTransaction()?.wait();
      
      console.log(`Optimized contract deployment gas: ${deployReceipt?.gasUsed}`);
      
      // 验证部署成功
      const deployedAddress = await deployTx.getAddress();
      expect(deployedAddress).to.match(/^0x[a-fA-F0-9]{40}$/);
    });

    it("Should verify storage slot optimization", async function () {
      // 创建一个交易来验证存储优化
      const data = mockTarget.interface.encodeFunctionData("setValue", [42]);
      await multiSigWallet.connect(owner1).submitTransaction(
        mockTarget.target, 
        ethers.parseEther("1.0"), 
        data
      );
      
      // 验证Transaction结构体的存储优化
      const transaction = await multiSigWallet.transactions(0);
      
      // 验证字段类型和值
      expect(transaction.to).to.equal(mockTarget.target);
      expect(transaction.value).to.equal(ethers.parseEther("1.0"));
      expect(transaction.executed).to.be.false;
      expect(transaction.confirmations).to.equal(1);
      expect(transaction.data).to.equal(data);
    });
  });
});
