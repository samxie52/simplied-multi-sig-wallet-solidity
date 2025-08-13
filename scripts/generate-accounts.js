const { ethers } = require("hardhat");
const fs = require('fs');

async function main() {
    console.log("🔑 生成10个测试账户...\n");
    
    const accounts = [];
    
    for (let i = 0; i < 10; i++) {
        const wallet = ethers.Wallet.createRandom();
        const account = {
            index: i,
            address: wallet.address,
            privateKey: wallet.privateKey,
            mnemonic: wallet.mnemonic.phrase,
            role: i < 5 ? "Owner" : "User"
        };
        accounts.push(account);
        
        console.log(`账户 ${i + 1} (${account.role}):`);
        console.log(`  地址: ${account.address}`);
        console.log(`  私钥: ${account.privateKey}`);
        console.log(`  助记词: ${account.mnemonic}`);
        console.log("");
    }
    
    // 保存到文件
    const accountsData = {
        network: "sepolia",
        generated: new Date().toISOString(),
        accounts: accounts
    };
    
    fs.writeFileSync('test-accounts.json', JSON.stringify(accountsData, null, 2));
    console.log("✅ 账户信息已保存到 test-accounts.json");
    
    // 生成环境变量模板
    let envTemplate = "\n# 测试账户私钥\n";
    accounts.forEach((account, index) => {
        envTemplate += `TEST_ACCOUNT_${index + 1}_PRIVATE_KEY=${account.privateKey}\n`;
    });
    
    fs.writeFileSync('.env.accounts', envTemplate);
    console.log("✅ 环境变量模板已保存到 .env.accounts");
    
    // 生成Owner地址列表
    const ownerAddresses = accounts.slice(0, 5).map(acc => acc.address);
    console.log("\n🏛️ Owner地址列表 (用于合约部署):");
    console.log(JSON.stringify(ownerAddresses, null, 2));
    
    return accounts;
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
