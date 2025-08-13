import hre from "hardhat";

async function main() {
  console.log(`Deploying to network: ${hre.network.name}`);
  
  // 获取部署者账户
  const [deployer, owner1, owner2, owner3] = await (hre as any).ethers.getSigners();
  
  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", (await deployer.provider.getBalance(deployer.address)).toString());

  // 设置多签名钱包参数
  const owners = [
    deployer.address,
    owner1?.address || "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", // 默认测试地址
    owner2?.address || "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"  // 默认测试地址
  ];
  const requiredConfirmations = 2;
  
  console.log("MultiSig Wallet Owners:", owners);
  console.log("Required Confirmations:", requiredConfirmations);
  
  // 部署MultiSigWallet合约
  const MultiSigWallet = await (hre as any).ethers.getContractFactory("MultiSigWallet");
  const multiSigWallet = await MultiSigWallet.deploy(owners, requiredConfirmations);
  
  await multiSigWallet.waitForDeployment();
  
  const walletAddress = await multiSigWallet.getAddress();
  console.log("MultiSigWallet deployed to:", walletAddress);
  
  // 验证部署
  const deployedOwners = await multiSigWallet.getOwners();
  const deployedRequired = await multiSigWallet.required();
  
  console.log("Deployed owners:", deployedOwners);
  console.log("Deployed required confirmations:", deployedRequired.toString());
  
  // 可选：部署测试用的MockERC20代币
  if (process.env.DEPLOY_MOCKS === "true") {
    console.log("\nDeploying mock contracts...");
    
    const MockERC20 = await (hre as any).ethers.getContractFactory("MockERC20");
    const mockToken = await MockERC20.deploy(
      "Test Token",
      "TEST",
      18,
      1000000 // 1M tokens
    );
    
    await mockToken.waitForDeployment();
    console.log("MockERC20 deployed to:", await mockToken.getAddress());
    
    const MockTarget = await (hre as any).ethers.getContractFactory("MockTarget");
    const mockTarget = await MockTarget.deploy();
    
    await mockTarget.waitForDeployment();
    console.log("MockTarget deployed to:", await mockTarget.getAddress());
  }
  
  console.log("\n✅ Deployment completed successfully!");
  console.log("📋 Contract Addresses:");
  console.log(`   MultiSigWallet: ${walletAddress}`);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});