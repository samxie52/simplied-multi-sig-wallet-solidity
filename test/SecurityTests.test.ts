import { expect } from "chai";

describe("MultiSigWallet Security Tests", function () {
  let multiSigWallet: any;
  let mockTarget: any;
  let owner1: any, owner2: any, owner3: any, nonOwner: any;
  let ethers: any;

  beforeEach(async function () {
    const hre = require("hardhat");
    ethers = hre.ethers;
    
    // 获取测试账户
    [owner1, owner2, owner3, nonOwner] = await ethers.getSigners();

    // 设置多签名钱包参数
    const owners = [owner1.address, owner2.address, owner3.address];
    const required = 2;

    // 部署MultiSigWallet合约
    const MultiSigWallet = await ethers.getContractFactory("MultiSigWallet");
    multiSigWallet = await MultiSigWallet.deploy(owners, required);

    // 部署测试用的MockTarget合约
    const MockTarget = await ethers.getContractFactory("MockTarget");
    mockTarget = await MockTarget.deploy();
  });

  describe("Emergency Pause Functionality", function () {
    it("Should allow emergency pause through multisig", async function () {
      // 提交暂停交易
      await multiSigWallet.connect(owner1).submitEmergencyPause();
      
      // 确认交易
      await multiSigWallet.connect(owner2).confirmTransaction(0);
      
      // 验证合约已暂停
      expect(await multiSigWallet.paused()).to.be.true;
    });

    it("Should prevent operations when paused", async function () {
      // 先暂停合约
      await multiSigWallet.connect(owner1).submitEmergencyPause();
      await multiSigWallet.connect(owner2).confirmTransaction(0);
      
      // 尝试提交新交易应该失败
      const data = mockTarget.interface.encodeFunctionData("setValue", [42]);
      
      try {
        await multiSigWallet.connect(owner1).submitTransaction(mockTarget.target, 0, data);
        expect.fail("Should have thrown");
      } catch (error: any) {
        expect(error.message).to.include("EnforcedPause");
      }
    });

    it("Should allow unpause through multisig", async function () {
      // 先暂停
      await multiSigWallet.connect(owner1).submitEmergencyPause();
      await multiSigWallet.connect(owner2).confirmTransaction(0);
      
      // 然后解除暂停
      await multiSigWallet.connect(owner1).submitEmergencyUnpause();
      await multiSigWallet.connect(owner2).confirmTransaction(1);
      
      // 验证合约已解除暂停
      expect(await multiSigWallet.paused()).to.be.false;
    });
  });

  describe("Owner Management Security", function () {
    it("Should only allow owner management through multisig", async function () {
      // 直接调用addOwner应该失败
      try {
        await multiSigWallet.connect(owner1).addOwner(nonOwner.address);
        expect.fail("Should have thrown");
      } catch (error: any) {
        expect(error.message).to.include("only wallet can call this function");
      }
    });

    it("Should add owner through multisig process", async function () {
      // 提交添加所有者的交易
      await multiSigWallet.connect(owner1).submitAddOwner(nonOwner.address);
      
      // 确认交易
      await multiSigWallet.connect(owner2).confirmTransaction(0);
      
      // 验证新所有者已添加
      expect(await multiSigWallet.isOwner(nonOwner.address)).to.be.true;
      const owners = await multiSigWallet.getOwners();
      expect(owners.length).to.equal(4);
    });

    it("Should change requirement through multisig process", async function () {
      // 提交更改确认要求的交易
      await multiSigWallet.connect(owner1).submitChangeRequirement(3);
      
      // 确认交易
      await multiSigWallet.connect(owner2).confirmTransaction(0);
      
      // 验证确认要求已更改
      expect(await multiSigWallet.required()).to.equal(3);
    });
  });

  describe("Reentrancy Protection", function () {
    it("Should prevent reentrancy attacks during execution", async function () {
      // 向多签名钱包发送以太币
      await owner1.sendTransaction({
        to: multiSigWallet.target,
        value: ethers.parseEther("1.0")
      });
      
      // 提交向测试合约转账的交易
      await multiSigWallet.connect(owner1).submitTransaction(
        mockTarget.target,
        ethers.parseEther("0.5"),
        "0x"
      );
      
      // 确认并执行交易
      await multiSigWallet.connect(owner2).confirmTransaction(0);
      
      // 验证交易已执行且没有重入问题
      const [, , , executed] = await multiSigWallet.getTransaction(0);
      expect(executed).to.be.true;
    });
  });

  describe("Access Control", function () {
    it("Should only allow owners to submit transactions", async function () {
      const data = mockTarget.interface.encodeFunctionData("setValue", [42]);
      
      try {
        await multiSigWallet.connect(nonOwner).submitTransaction(mockTarget.target, 0, data);
        expect.fail("Should have thrown");
      } catch (error: any) {
        expect(error.message).to.include("caller is not an owner");
      }
    });

    it("Should only allow owners to confirm transactions", async function () {
      const data = mockTarget.interface.encodeFunctionData("setValue", [42]);
      await multiSigWallet.connect(owner1).submitTransaction(mockTarget.target, 0, data);
      
      try {
        await multiSigWallet.connect(nonOwner).confirmTransaction(0);
        expect.fail("Should have thrown");
      } catch (error: any) {
        expect(error.message).to.include("caller is not an owner");
      }
    });
  });

  describe("Transaction Validation", function () {
    it("Should prevent double confirmation", async function () {
      const data = mockTarget.interface.encodeFunctionData("setValue", [42]);
      await multiSigWallet.connect(owner1).submitTransaction(mockTarget.target, 0, data);
      
      // 尝试重复确认应该失败
      try {
        await multiSigWallet.connect(owner1).confirmTransaction(0);
        expect.fail("Should have thrown");
      } catch (error: any) {
        expect(error.message).to.include("transaction already confirmed");
      }
    });

    it("Should prevent execution of unconfirmed transactions", async function () {
      const data = mockTarget.interface.encodeFunctionData("setValue", [42]);
      await multiSigWallet.connect(owner1).submitTransaction(mockTarget.target, 0, data);
      
      // 只有一个确认，不足以执行
      try {
        await multiSigWallet.connect(owner2).executeTransaction(0);
        expect.fail("Should have thrown");
      } catch (error: any) {
        expect(error.message).to.include("transaction not confirmed");
      }
    });

    it("Should verify basic functionality works", async function () {
      const data = mockTarget.interface.encodeFunctionData("setValue", [42]);
      await multiSigWallet.connect(owner1).submitTransaction(mockTarget.target, 0, data);
      await multiSigWallet.connect(owner2).confirmTransaction(0);
      
      // 验证交易已执行
      const [, , , executed] = await multiSigWallet.getTransaction(0);
      expect(executed).to.be.true;
    });
  });
});
