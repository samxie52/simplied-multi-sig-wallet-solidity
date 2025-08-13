// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8.28;


/**
 * @title IMultiSigWallet
 * @author samxie52
 * @notice 多签名钱包接口定义
 */
interface IMultiSigWallet {

// 事件定义
 event TransactionSubmitted(
    uint256 indexed transactionId,
    address indexed submitter,
    address indexed to,
    uint256 value,
    bytes data
);

event TransactionConfirmed(
    uint256 indexed transactionId,
    address indexed owner
);

event TransactionExecuted(
    uint256 indexed transactionId
);

event TransactionFailed(
    uint256 indexed transactionId,
    bytes reason
);

event OwnerAddition(address indexed owner);
event OwnerRemoval(address indexed owner);
event RequirementChange(uint256 required);


// 提交交易
function submitTransaction(
    address to,
    uint256 value,
    bytes calldata data
) external returns (uint256);

// 确认交易
// external 修饰符表示该函数可以被外部调用
function confirmTransaction(uint256 transactionId) external;

// 执行交易
function executeTransaction(uint256 transactionId) external;

// 撤销确认
function revokeConfirmation(uint256 transactionId) external;


// 所有者管理
function addOwner(address owner) external;
function removeOwner(address owner) external;
function changeRequirement(uint256 required) external;

// 查询功能
function getOwners() external view returns (address[] memory);
function getTransactionCount() external view returns (uint256);
function isConfirmed(uint256 transactionId) external view returns (bool);
function getConfirmationCount(uint256 transactionId) external view returns (uint256);
function getTransaction(uint256 transactionId) external view returns (
    address to,
    uint256 value,
    bytes memory data,
    bool executed
);

}