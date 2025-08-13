import hre from "hardhat";

async function main() {
  console.log(`Deploying to network: ${hre.network.name}`);
  
  // 使用类型断言来访问ethers
  const ethers = (hre as any).ethers;
  const signers = await ethers.getSigners();
  const deployer = signers[0];

  // signers.forEach(async (signer: any) => {
  //   console.log("Signer address:", signer.address);
  //   console.log("Signer balance:", ethers.formatEther(await signer.provider.getBalance(signer.address)));
  // });
  
  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await deployer.provider.getBalance(deployer.address)));

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