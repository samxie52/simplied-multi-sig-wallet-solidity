// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title MaliciousContract
 * @dev 用于测试重入攻击和其他安全漏洞的恶意合约
 */
contract MaliciousContract {
    address public target;
    uint256 public attackCount;
    bool public attacking;

    event AttackAttempted(address target, uint256 count);

    function setTarget(address _target) external {
        target = _target;
    }

    /**
     * @dev 尝试重入攻击
     */
    function attack() external payable {
        require(target != address(0), "Target not set");
        
        if (!attacking && attackCount < 3) {
            attacking = true;
            attackCount++;
            
            emit AttackAttempted(target, attackCount);
            
            // 尝试重入调用目标合约
            try this.reentrantCall() {
                // 重入攻击尝试
            } catch {
                // 重入被阻止
            }
            
            attacking = false;
        }
    }

    /**
     * @dev 重入调用函数
     */
    function reentrantCall() external {
        if (attacking && target != address(0)) {
            // 尝试调用目标合约的函数
            (bool success,) = target.call(
                abi.encodeWithSignature("submitTransaction(address,uint256,bytes)", 
                address(this), 0, "")
            );
            
            if (success) {
                // 如果成功，尝试再次攻击
                this.attack();
            }
        }
    }

    /**
     * @dev 接收以太币
     */
    receive() external payable {
        if (attacking && attackCount < 3) {
            this.attack();
        }
    }

    /**
     * @dev 重置攻击状态
     */
    function reset() external {
        attackCount = 0;
        attacking = false;
    }
}
