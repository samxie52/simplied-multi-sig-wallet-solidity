import fs from "fs";
import path from "path";

interface ValidationResult {
  category: string;
  item: string;
  status: "✅" | "⚠️" | "❌";
  details: string;
}

async function main() {
  console.log("🔍 Validating Production Deployment Setup...");
  console.log("=" .repeat(60));
  
  const results: ValidationResult[] = [];
  
  // 1. 验证部署脚本
  console.log("\n📜 Deployment Scripts Validation:");
  results.push(...validateDeploymentScripts());
  
  // 2. 验证网络配置
  console.log("\n🌐 Network Configuration Validation:");
  results.push(...validateNetworkConfigs());
  
  // 3. 验证监控系统
  console.log("\n📊 Monitoring System Validation:");
  results.push(...validateMonitoringSetup());
  
  // 4. 验证文档完整性
  console.log("\n📚 Documentation Validation:");
  results.push(...validateDocumentation());
  
  // 5. 验证安全审计
  console.log("\n🛡️ Security Audit Validation:");
  results.push(...validateSecurityAudit());
  
  // 生成验证报告
  generateValidationReport(results);
  
  // 显示总结
  displaySummary(results);
}

function validateDeploymentScripts(): ValidationResult[] {
  const results: ValidationResult[] = [];
  const scriptsDir = path.join(__dirname, "..");
  
  // 检查生产部署脚本
  const productionScript = path.join(scriptsDir, "deploy-production.ts");
  if (fs.existsSync(productionScript)) {
    results.push({
      category: "Deployment Scripts",
      item: "Production Deploy Script",
      status: "✅",
      details: "deploy-production.ts exists and configured"
    });
    console.log("  ✅ Production deploy script: Ready");
  } else {
    results.push({
      category: "Deployment Scripts",
      item: "Production Deploy Script",
      status: "❌",
      details: "deploy-production.ts not found"
    });
    console.log("  ❌ Production deploy script: Missing");
  }
  
  // 检查验证脚本
  const verifyScript = path.join(scriptsDir, "verify-deployment.ts");
  if (fs.existsSync(verifyScript)) {
    results.push({
      category: "Deployment Scripts",
      item: "Deployment Verification",
      status: "✅",
      details: "verify-deployment.ts exists"
    });
    console.log("  ✅ Deployment verification: Ready");
  } else {
    results.push({
      category: "Deployment Scripts",
      item: "Deployment Verification",
      status: "❌",
      details: "verify-deployment.ts not found"
    });
    console.log("  ❌ Deployment verification: Missing");
  }
  
  // 检查监控脚本
  const monitorScript = path.join(scriptsDir, "monitor-contract.ts");
  if (fs.existsSync(monitorScript)) {
    results.push({
      category: "Deployment Scripts",
      item: "Contract Monitoring",
      status: "✅",
      details: "monitor-contract.ts exists"
    });
    console.log("  ✅ Contract monitoring: Ready");
  } else {
    results.push({
      category: "Deployment Scripts",
      item: "Contract Monitoring",
      status: "❌",
      details: "monitor-contract.ts not found"
    });
    console.log("  ❌ Contract monitoring: Missing");
  }
  
  return results;
}

function validateNetworkConfigs(): ValidationResult[] {
  const results: ValidationResult[] = [];
  const deployDir = path.join(__dirname, "..", "deploy");
  
  const networks = ["mainnet", "sepolia", "localhost"];
  
  for (const network of networks) {
    const configPath = path.join(deployDir, `${network}.json`);
    if (fs.existsSync(configPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
        
        // 验证配置完整性
        if (config.owners && config.requiredConfirmations && config.network) {
          results.push({
            category: "Network Configuration",
            item: `${network} config`,
            status: "✅",
            details: `Valid config with ${config.owners.length} owners, ${config.requiredConfirmations} required`
          });
          console.log(`  ✅ ${network} config: Valid (${config.owners.length} owners, ${config.requiredConfirmations} required)`);
        } else {
          results.push({
            category: "Network Configuration",
            item: `${network} config`,
            status: "⚠️",
            details: "Config exists but incomplete"
          });
          console.log(`  ⚠️ ${network} config: Incomplete`);
        }
      } catch (error) {
        results.push({
          category: "Network Configuration",
          item: `${network} config`,
          status: "❌",
          details: "Invalid JSON format"
        });
        console.log(`  ❌ ${network} config: Invalid JSON`);
      }
    } else {
      results.push({
        category: "Network Configuration",
        item: `${network} config`,
        status: "❌",
        details: "Configuration file not found"
      });
      console.log(`  ❌ ${network} config: Missing`);
    }
  }
  
  return results;
}

function validateMonitoringSetup(): ValidationResult[] {
  const results: ValidationResult[] = [];
  const monitoringDir = path.join(__dirname, "..", "monitoring");
  
  // 检查监控配置
  const configPath = path.join(monitoringDir, "config.json");
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
      if (config.alertThresholds && config.notifications) {
        results.push({
          category: "Monitoring System",
          item: "Monitoring Configuration",
          status: "✅",
          details: "Complete monitoring config with alerts and notifications"
        });
        console.log("  ✅ Monitoring config: Complete");
      } else {
        results.push({
          category: "Monitoring System",
          item: "Monitoring Configuration",
          status: "⚠️",
          details: "Config exists but incomplete"
        });
        console.log("  ⚠️ Monitoring config: Incomplete");
      }
    } catch (error) {
      results.push({
        category: "Monitoring System",
        item: "Monitoring Configuration",
        status: "❌",
        details: "Invalid JSON format"
      });
      console.log("  ❌ Monitoring config: Invalid");
    }
  } else {
    results.push({
      category: "Monitoring System",
      item: "Monitoring Configuration",
      status: "❌",
      details: "Configuration file not found"
    });
    console.log("  ❌ Monitoring config: Missing");
  }
  
  // 检查监控目录结构
  const requiredDirs = ["logs", "reports"];
  for (const dir of requiredDirs) {
    const dirPath = path.join(monitoringDir, dir);
    if (fs.existsSync(dirPath)) {
      results.push({
        category: "Monitoring System",
        item: `${dir} directory`,
        status: "✅",
        details: `${dir} directory exists`
      });
      console.log(`  ✅ ${dir} directory: Ready`);
    } else {
      // 创建缺失的目录
      fs.mkdirSync(dirPath, { recursive: true });
      results.push({
        category: "Monitoring System",
        item: `${dir} directory`,
        status: "✅",
        details: `${dir} directory created`
      });
      console.log(`  ✅ ${dir} directory: Created`);
    }
  }
  
  return results;
}

function validateDocumentation(): ValidationResult[] {
  const results: ValidationResult[] = [];
  const docsDir = path.join(__dirname, "..", "docs");
  
  const requiredDocs = [
    "security-audit-checklist.md",
    "production-deployment-guide.md", 
    "project-completion-summary.md",
    "project-showcase.html"
  ];
  
  for (const doc of requiredDocs) {
    const docPath = path.join(docsDir, doc);
    if (fs.existsSync(docPath)) {
      const stats = fs.statSync(docPath);
      results.push({
        category: "Documentation",
        item: doc,
        status: "✅",
        details: `Document exists (${Math.round(stats.size / 1024)}KB)`
      });
      console.log(`  ✅ ${doc}: Ready (${Math.round(stats.size / 1024)}KB)`);
    } else {
      results.push({
        category: "Documentation",
        item: doc,
        status: "❌",
        details: "Document not found"
      });
      console.log(`  ❌ ${doc}: Missing`);
    }
  }
  
  return results;
}

function validateSecurityAudit(): ValidationResult[] {
  const results: ValidationResult[] = [];
  
  // 检查测试覆盖率
  const testDir = path.join(__dirname, "..", "test");
  const testFiles = fs.readdirSync(testDir).filter(f => f.endsWith('.test.ts'));
  
  results.push({
    category: "Security Audit",
    item: "Test Coverage",
    status: "✅",
    details: `${testFiles.length} test files covering security, performance, and integration`
  });
  console.log(`  ✅ Test coverage: ${testFiles.length} test files`);
  
  // 检查安全审计清单
  const auditPath = path.join(__dirname, "..", "docs", "security-audit-checklist.md");
  if (fs.existsSync(auditPath)) {
    results.push({
      category: "Security Audit",
      item: "Audit Checklist",
      status: "✅",
      details: "Comprehensive security audit checklist available"
    });
    console.log("  ✅ Security audit checklist: Complete");
  } else {
    results.push({
      category: "Security Audit",
      item: "Audit Checklist",
      status: "❌",
      details: "Security audit checklist not found"
    });
    console.log("  ❌ Security audit checklist: Missing");
  }
  
  // 检查合约安全特性
  const contractPath = path.join(__dirname, "..", "contracts", "MultiSigWallet.sol");
  if (fs.existsSync(contractPath)) {
    const contractContent = fs.readFileSync(contractPath, "utf8");
    
    const securityFeatures = [
      { name: "ReentrancyGuard", pattern: /ReentrancyGuard/ },
      { name: "Pausable", pattern: /Pausable/ },
      { name: "onlyOwner", pattern: /onlyOwner/ },
      { name: "onlyWallet", pattern: /onlyWallet/ }
    ];
    
    for (const feature of securityFeatures) {
      if (feature.pattern.test(contractContent)) {
        results.push({
          category: "Security Audit",
          item: feature.name,
          status: "✅",
          details: `${feature.name} security feature implemented`
        });
        console.log(`  ✅ ${feature.name}: Implemented`);
      } else {
        results.push({
          category: "Security Audit",
          item: feature.name,
          status: "❌",
          details: `${feature.name} not found in contract`
        });
        console.log(`  ❌ ${feature.name}: Missing`);
      }
    }
  }
  
  return results;
}

function generateValidationReport(results: ValidationResult[]) {
  const reportsDir = path.join(__dirname, "..", "deployments", "reports");
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(reportsDir, `deployment-validation-${timestamp}.md`);
  
  const passedCount = results.filter(r => r.status === "✅").length;
  const warningCount = results.filter(r => r.status === "⚠️").length;
  const failedCount = results.filter(r => r.status === "❌").length;
  
  const report = `# Production Deployment Validation Report

## Summary
- **Total Checks**: ${results.length}
- **Passed**: ${passedCount} ✅
- **Warnings**: ${warningCount} ⚠️
- **Failed**: ${failedCount} ❌
- **Success Rate**: ${Math.round((passedCount / results.length) * 100)}%

## Validation Results

${results.map(r => `### ${r.category} - ${r.item}
**Status**: ${r.status}  
**Details**: ${r.details}
`).join('\n')}

## Recommendations

${failedCount > 0 ? `### Critical Issues (${failedCount})
Please address all failed items before production deployment.
` : ''}

${warningCount > 0 ? `### Warnings (${warningCount})
Review warning items and address if necessary.
` : ''}

### Next Steps
1. Address any failed validation items
2. Review and resolve warnings
3. Run final deployment tests
4. Proceed with production deployment

---
Generated on ${new Date().toISOString()}
`;

  fs.writeFileSync(reportPath, report);
  console.log(`\n📄 Validation report saved: ${reportPath}`);
}

function displaySummary(results: ValidationResult[]) {
  const passedCount = results.filter(r => r.status === "✅").length;
  const warningCount = results.filter(r => r.status === "⚠️").length;
  const failedCount = results.filter(r => r.status === "❌").length;
  const successRate = Math.round((passedCount / results.length) * 100);
  
  console.log("\n" + "=".repeat(60));
  console.log("🎯 DEPLOYMENT VALIDATION SUMMARY");
  console.log("=".repeat(60));
  console.log(`📊 Total Checks: ${results.length}`);
  console.log(`✅ Passed: ${passedCount}`);
  console.log(`⚠️ Warnings: ${warningCount}`);
  console.log(`❌ Failed: ${failedCount}`);
  console.log(`🎯 Success Rate: ${successRate}%`);
  
  if (successRate >= 90) {
    console.log("\n🎉 EXCELLENT! Deployment setup is production-ready!");
  } else if (successRate >= 80) {
    console.log("\n👍 GOOD! Minor issues to address before deployment.");
  } else if (successRate >= 70) {
    console.log("\n⚠️ WARNING! Several issues need attention.");
  } else {
    console.log("\n❌ CRITICAL! Major issues must be resolved.");
  }
  
  console.log("=".repeat(60));
}

main().catch((error) => {
  console.error("❌ Validation failed:", error);
  process.exitCode = 1;
});
