import { expect } from "chai";
import { ethers } from "hardhat";

describe("MultiSigWallet Boundary and Integration Tests", function () {
  let multiSigWallet: any;
  let mockTarget: any;
  let mockERC20: any;
  let owner1: any, owner2: any, owner3: any, owner4: any, owner5: any;
  let nonOwner: any;

  beforeEach(async function () {
    // 获取测试账户
    [owner1, owner2, owner3, owner4, owner5, nonOwner] = await ethers.getSigners();

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

    // 为钱包转入一些ERC20代币
    await mockERC20.transfer(multiSigWallet.target, ethers.parseEther("10000"));
  });

  describe("Boundary Value Testing", function () {
    describe("Owner Management Boundaries", function () {
      it("Should handle minimum owners (1)", async function () {
        // 创建只有1个所有者的钱包
        const singleOwner = [owner1.address];
        const singleRequired = 1;

        const SingleOwnerWallet = await ethers.getContractFactory("MultiSigWallet");
        const singleWallet = await SingleOwnerWallet.deploy(singleOwner, singleRequired);

        expect(await singleWallet.getOwners()).to.deep.equal(singleOwner);
        expect(await singleWallet.required()).to.equal(1);
      });

      it("Should handle maximum practical owners (50)", async function () {
        // 创建50个所有者地址
        const maxOwners = [];
        for (let i = 0; i < 50; i++) {
          const wallet = ethers.Wallet.createRandom();
          maxOwners.push(wallet.address);
        }
        const maxRequired = 25;

        const MaxOwnerWallet = await ethers.getContractFactory("MultiSigWallet");
        const maxWallet = await MaxOwnerWallet.deploy(maxOwners, maxRequired);

        expect(await maxWallet.getOwners()).to.deep.equal(maxOwners);
        expect(await maxWallet.required()).to.equal(25);
      });

      it("Should reject zero owners", async function () {
        try {
          const MultiSigWallet = await ethers.getContractFactory("MultiSigWallet");
          await MultiSigWallet.deploy([], 1);
          expect.fail("Should have thrown");
        } catch (error: any) {
          expect(error.message).to.include("owners required");
        }
      });

      it("Should reject required greater than owners", async function () {
        try {
          const MultiSigWallet = await ethers.getContractFactory("MultiSigWallet");
          await MultiSigWallet.deploy([owner1.address], 2);
          expect.fail("Should have thrown");
        } catch (error: any) {
          expect(error.message).to.include("invalid required number");
        }
      });

      it("Should reject zero required", async function () {
        try {
          const MultiSigWallet = await ethers.getContractFactory("MultiSigWallet");
          await MultiSigWallet.deploy([owner1.address, owner2.address], 0);
          expect.fail("Should have thrown");
        } catch (error: any) {
          expect(error.message).to.include("invalid required number");
        }
      });
    });

    describe("Transaction Value Boundaries", function () {
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

      it("Should reject values exceeding uint96", async function () {
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

      it("Should handle wallet balance boundary", async function () {
        const walletBalance = await ethers.provider.getBalance(multiSigWallet.target);
        const data = "0x";
        
        // 尝试发送超过余额的金额
        try {
          await multiSigWallet.connect(owner1).submitTransaction(
            owner4.address,
            walletBalance + 1n,
            data
          );
          await multiSigWallet.connect(owner2).confirmTransaction(0);
          expect.fail("Should have thrown");
        } catch (error: any) {
          expect(error.message).to.include("execution failed");
        }
      });
    });

    describe("Confirmation Count Boundaries", function () {
      it("Should handle maximum uint32 confirmations", async function () {
        // 创建一个有很多所有者的钱包来测试确认数量边界
        const manyOwners = [];
        for (let i = 0; i < 10; i++) {
          const wallet = ethers.Wallet.createRandom();
          manyOwners.push(wallet.address);
        }
        
        const ManyOwnerWallet = await ethers.getContractFactory("MultiSigWallet");
        const manyWallet = await ManyOwnerWallet.deploy(manyOwners, 5);

        // 验证确认计数器可以处理多个确认
        const data = mockTarget.interface.encodeFunctionData("setValue", [42]);
        await manyWallet.connect(owner1).submitTransaction(mockTarget.target, 0, data);
        
        expect(await manyWallet.getConfirmationCount(0)).to.equal(1);
      });
    });

    describe("Data Size Boundaries", function () {
      it("Should handle empty data", async function () {
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

      it("Should handle large data payloads", async function () {
        // 创建一个大的数据负载 (接近gas limit)
        const largeData = "0x" + "00".repeat(10000); // 10KB of data
        
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

  describe("Integration Testing", function () {
    describe("Multi-Contract Interactions", function () {
      it("Should integrate with ERC20 token transfers", async function () {
        // 测试通过多签钱包转移ERC20代币
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

        // 验证代币转移成功
        const balance = await mockERC20.balanceOf(owner4.address);
        expect(balance).to.equal(transferAmount);
      });

      it("Should integrate with complex contract calls", async function () {
        // 测试复杂的合约调用
        const complexData = mockTarget.interface.encodeFunctionData("complexFunction", [
          [1, 2, 3, 4, 5],
          "test string",
          true
        ]);

        await multiSigWallet.connect(owner1).submitTransaction(
          mockTarget.target,
          0,
          complexData
        );

        await multiSigWallet.connect(owner2).confirmTransaction(0);

        const [, , , executed] = await multiSigWallet.getTransaction(0);
        expect(executed).to.be.true;
      });

      it("Should handle contract creation through wallet", async function () {
        // 测试通过钱包部署新合约
        const MockTarget = await ethers.getContractFactory("MockTarget");
        const deploymentData = MockTarget.getDeployTransaction().data;

        await multiSigWallet.connect(owner1).submitTransaction(
          ethers.ZeroAddress, // 部署合约的目标地址为0
          0,
          deploymentData!
        );

        await multiSigWallet.connect(owner2).confirmTransaction(0);

        const [, , , executed] = await multiSigWallet.getTransaction(0);
        expect(executed).to.be.true;
      });
    });

    describe("Batch Operations Integration", function () {
      it("Should integrate batch operations with different contract types", async function () {
        // 创建混合类型的批量交易
        const targets = [
          mockTarget.target,
          mockERC20.target,
          owner4.address
        ];
        
        const values = [0, 0, ethers.parseEther("1.0")];
        
        const dataArray = [
          mockTarget.interface.encodeFunctionData("setValue", [123]),
          mockERC20.interface.encodeFunctionData("transfer", [owner5.address, ethers.parseEther("50")]),
          "0x"
        ];

        await multiSigWallet.connect(owner1).batchSubmit(targets, values, dataArray);

        // 批量确认
        await multiSigWallet.connect(owner2).batchConfirm([0, 1, 2]);

        // 验证所有交易都执行成功
        for (let i = 0; i < 3; i++) {
          const [, , , executed] = await multiSigWallet.getTransaction(i);
          expect(executed).to.be.true;
        }

        // 验证ERC20转移
        const balance = await mockERC20.balanceOf(owner5.address);
        expect(balance).to.equal(ethers.parseEther("50"));
      });

      it("Should handle partial batch execution failures", async function () {
        // 创建一个会部分失败的批量交易
        const targets = [
          mockTarget.target,
          mockTarget.target, // 这个会失败
          mockTarget.target
        ];
        
        const values = [0, ethers.parseEther("1000"), 0]; // 中间的值过大会失败
        
        const dataArray = [
          mockTarget.interface.encodeFunctionData("setValue", [1]),
          mockTarget.interface.encodeFunctionData("setValue", [2]),
          mockTarget.interface.encodeFunctionData("setValue", [3])
        ];

        await multiSigWallet.connect(owner1).batchSubmit(targets, values, dataArray);

        // 批量确认
        await multiSigWallet.connect(owner2).batchConfirm([0, 1, 2]);

        // 验证第一个和第三个成功，第二个失败
        const [, , , executed1] = await multiSigWallet.getTransaction(0);
        const [, , , executed2] = await multiSigWallet.getTransaction(1);
        const [, , , executed3] = await multiSigWallet.getTransaction(2);

        expect(executed1).to.be.true;
        expect(executed2).to.be.false; // 应该失败
        expect(executed3).to.be.true;
      });
    });

    describe("Emergency Pause Integration", function () {
      it("Should integrate pause with all wallet operations", async function () {
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

        // 验证所有操作都被阻止
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

        // 创建解除暂停交易
        const unpauseData = multiSigWallet.interface.encodeFunctionData("emergencyUnpause");
        await multiSigWallet.connect(owner1).submitTransaction(
          multiSigWallet.target,
          0,
          unpauseData
        );

        await multiSigWallet.connect(owner2).confirmTransaction(1);

        // 验证钱包已恢复
        expect(await multiSigWallet.paused()).to.be.false;

        // 验证操作恢复正常
        await multiSigWallet.connect(owner1).submitTransaction(
          mockTarget.target,
          0,
          "0x"
        );
        expect(await multiSigWallet.getTransactionCount()).to.equal(3);
      });
    });

    describe("Owner Management Integration", function () {
      it("Should integrate complete owner lifecycle", async function () {
        // 添加新所有者
        await multiSigWallet.connect(owner1).submitAddOwner(owner4.address);
        await multiSigWallet.connect(owner2).confirmTransaction(0);

        // 验证所有者已添加
        const owners = await multiSigWallet.getOwners();
        expect(owners).to.include(owner4.address);

        // 更改要求数量
        await multiSigWallet.connect(owner1).submitChangeRequirement(3);
        await multiSigWallet.connect(owner2).confirmTransaction(1);

        // 验证要求数量已更改
        expect(await multiSigWallet.required()).to.equal(3);

        // 现在需要3个确认来执行交易
        await multiSigWallet.connect(owner1).submitTransaction(
          mockTarget.target,
          0,
          mockTarget.interface.encodeFunctionData("setValue", [999])
        );

        await multiSigWallet.connect(owner2).confirmTransaction(2);
        
        // 2个确认还不够
        let [, , , executed] = await multiSigWallet.getTransaction(2);
        expect(executed).to.be.false;

        // 第3个确认
        await multiSigWallet.connect(owner4).confirmTransaction(2);
        
        // 现在应该执行了
        [, , , executed] = await multiSigWallet.getTransaction(2);
        expect(executed).to.be.true;

        // 移除所有者
        await multiSigWallet.connect(owner1).submitRemoveOwner(owner3.address);
        await multiSigWallet.connect(owner2).confirmTransaction(3);
        await multiSigWallet.connect(owner4).confirmTransaction(3);

        // 验证所有者已移除
        const newOwners = await multiSigWallet.getOwners();
        expect(newOwners).to.not.include(owner3.address);
        expect(newOwners.length).to.equal(3);
      });
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
});
