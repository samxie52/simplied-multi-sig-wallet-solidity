import { expect } from "chai";

describe("MultiSigWallet Basic Tests", function () {
  let multiSigWallet: any;
  let mockTarget: any;
  let owner1: any, owner2: any, owner3: any, nonOwner: any;
  let ethers: any;

  beforeEach(async function () {
    const hre = require("hardhat");
    ethers = (hre as any).ethers;
    
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

  describe("Deployment", function () {
    it("Should set the right owners", async function () {
      const deployedOwners = await multiSigWallet.getOwners();
      expect(deployedOwners.length).to.equal(3);
      expect(deployedOwners[0]).to.equal(owner1.address);
      expect(deployedOwners[1]).to.equal(owner2.address);
      expect(deployedOwners[2]).to.equal(owner3.address);
    });

    it("Should set the right required confirmations", async function () {
      expect(await multiSigWallet.required()).to.equal(2);
    });

    it("Should mark addresses as owners", async function () {
      expect(await multiSigWallet.isOwner(owner1.address)).to.be.true;
      expect(await multiSigWallet.isOwner(owner2.address)).to.be.true;
      expect(await multiSigWallet.isOwner(owner3.address)).to.be.true;
      expect(await multiSigWallet.isOwner(nonOwner.address)).to.be.false;
    });
  });

  describe("Transaction Submission", function () {
    it("Should allow owners to submit transactions", async function () {
      const data = mockTarget.interface.encodeFunctionData("setValue", [42]);
      
      await multiSigWallet.connect(owner1).submitTransaction(mockTarget.target, 0, data);
      expect(await multiSigWallet.getTransactionCount()).to.equal(1);
    });

    it("Should automatically confirm submitter's transaction", async function () {
      const data = mockTarget.interface.encodeFunctionData("setValue", [42]);
      
      await multiSigWallet.connect(owner1).submitTransaction(mockTarget.target, 0, data);
      
      expect(await multiSigWallet.getConfirmation(0, owner1.address)).to.be.true;
      expect(await multiSigWallet.getConfirmationCount(0)).to.equal(1);
    });
  });

  describe("Transaction Confirmation", function () {
    it("Should allow owners to confirm transactions", async function () {
      const data = mockTarget.interface.encodeFunctionData("setValue", [42]);
      await multiSigWallet.connect(owner1).submitTransaction(mockTarget.target, 0, data);
      
      await multiSigWallet.connect(owner2).confirmTransaction(0);

      expect(await multiSigWallet.getConfirmation(0, owner2.address)).to.be.true;
      expect(await multiSigWallet.getConfirmationCount(0)).to.equal(2);
    });

    it("Should auto-execute when required confirmations reached", async function () {
      const data = mockTarget.interface.encodeFunctionData("setValue", [42]);
      await multiSigWallet.connect(owner1).submitTransaction(mockTarget.target, 0, data);
      
      // 第二个确认应该触发自动执行
      await multiSigWallet.connect(owner2).confirmTransaction(0);

      const [, , , executed] = await multiSigWallet.getTransaction(0);
      expect(executed).to.be.true;
      expect(await mockTarget.value()).to.equal(42);
    });
  });

  describe("Transaction Execution", function () {
    it("Should execute confirmed transactions", async function () {
      const data = mockTarget.interface.encodeFunctionData("setValue", [123]);
      await multiSigWallet.connect(owner1).submitTransaction(mockTarget.target, 0, data);
      await multiSigWallet.connect(owner2).confirmTransaction(0);
      
      // 应该已经自动执行了
      expect(await mockTarget.value()).to.equal(123);
      expect(await mockTarget.caller()).to.equal(multiSigWallet.target);
    });

    it("Should handle Ether transfers", async function () {
      // 向多签名钱包发送一些以太币
      await owner1.sendTransaction({
        to: multiSigWallet.target,
        value: ethers.parseEther("1.0")
      });

      const initialBalance = await ethers.provider.getBalance(nonOwner.address);
      
      // 提交转账交易
      await multiSigWallet.connect(owner1).submitTransaction(
        nonOwner.address, 
        ethers.parseEther("0.5"), 
        "0x"
      );
      
      await multiSigWallet.connect(owner2).confirmTransaction(0);
      
      const finalBalance = await ethers.provider.getBalance(nonOwner.address);
      expect(finalBalance - initialBalance).to.equal(ethers.parseEther("0.5"));
    });
  });

  describe("Query Functions", function () {
    it("Should return correct transaction details", async function () {
      const data = mockTarget.interface.encodeFunctionData("setValue", [42]);
      await multiSigWallet.connect(owner1).submitTransaction(mockTarget.target, 100, data);
      
      const [to, value, returnedData, executed] = await multiSigWallet.getTransaction(0);
      
      expect(to).to.equal(mockTarget.target);
      expect(value).to.equal(100);
      expect(returnedData).to.equal(data);
      expect(executed).to.be.false;
    });

    it("Should check if transaction is confirmed", async function () {
      const data = mockTarget.interface.encodeFunctionData("setValue", [42]);
      await multiSigWallet.connect(owner1).submitTransaction(mockTarget.target, 0, data);
      
      expect(await multiSigWallet.isConfirmed(0)).to.be.false;
      
      await multiSigWallet.connect(owner2).confirmTransaction(0);
      expect(await multiSigWallet.isConfirmed(0)).to.be.true;
    });
  });
});
