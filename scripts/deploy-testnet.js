const { ethers } = require("hardhat");
const fs = require('fs');

async function main() {
    console.log("🚀 开始部署到Sepolia测试网...\n");
    
    // 获取部署账户
    const [deployer] = await ethers.getSigners();
    console.log("部署账户:", deployer.address);
    
    const balance = await ethers.provider.getBalance(deployer.address);
    console.log("账户余额:", ethers.formatEther(balance), "ETH\n");
    
    if (balance < ethers.parseEther("0.01")) {
        throw new Error("部署账户余额不足，请先获取测试ETH");
    }
    
    // 读取测试账户
    const accountsData = JSON.parse(fs.readFileSync('test-accounts.json', 'utf8'));
    const ownerAddresses = accountsData.accounts.slice(0, 5).map(acc => acc.address);
    
    console.log("🏛️ Owner地址列表:");
    ownerAddresses.forEach((addr, index) => {
        console.log(`  Owner ${index + 1}: ${addr}`);
    });
    
    // 部署合约
    console.log("\n📦 部署MultiSigWallet合约...");
    const MultiSigWallet = await ethers.getContractFactory("MultiSigWallet");
    
    const requiredConfirmations = 3; // 需要3个确认
    const contract = await MultiSigWallet.deploy(ownerAddresses, requiredConfirmations);
    
    console.log("⏳ 等待部署确认...");
    await contract.waitForDeployment();
    
    console.log("✅ 合约部署成功!");
    console.log("合约地址:", await contract.getAddress());
    console.log("交易哈希:", contract.deploymentTransaction().hash);
    console.log("Gas使用:", contract.deploymentTransaction().gasLimit.toString());
    
    // 保存部署信息
    const contractAddress = await contract.getAddress();
    const deploymentInfo = {
        network: "sepolia",
        contractAddress: contractAddress,
        deploymentTx: contract.deploymentTransaction().hash,
        deployer: deployer.address,
        owners: ownerAddresses,
        requiredConfirmations: requiredConfirmations,
        deployedAt: new Date().toISOString(),
        gasUsed: contract.deploymentTransaction().gasLimit.toString()
    };
    
    fs.writeFileSync('deployment-sepolia.json', JSON.stringify(deploymentInfo, null, 2));
    console.log("✅ 部署信息已保存到 deployment-sepolia.json");
    
    // 验证合约状态
    console.log("\n🔍 验证合约状态:");
    console.log("Owner数量:", await contract.getOwnerCount());
    console.log("所需确认数:", await contract.required());
    console.log("合约余额:", ethers.utils.formatEther(await ethers.provider.getBalance(contract.address)), "ETH");
    
    return deploymentInfo;
}

if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}

module.exports = { main };
