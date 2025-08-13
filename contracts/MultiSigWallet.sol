// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8.28;

import "./interfaces/IMultiSigWallet.sol";
import "./libraries/Address.sol";

/**
 * @title MultiSigWallet
 * @dev 企业级多签名钱包实现
 * @author samxie52
 * @notice 支持多重签名确认的安全钱包合约
 */
contract MultiSigWallet is IMultiSigWallet {
    using Address for address;

    // 交易结构体
    struct Transaction {
        address to;           // 目标地址
        uint256 value;        // 转账金额（Wei）
        bytes data;           // 调用数据
        bool executed;        // 执行状态
        uint256 confirmations; // 确认数量
    }

    // 状态变量
    mapping(uint256 => Transaction) public transactions;
    mapping(uint256 => mapping(address => bool)) public confirmations;
    mapping(address => bool) public isOwner;
    address[] public owners;
    uint256 public required;
    uint256 public transactionCount;

    // 修饰符
    modifier onlyOwner() {
        require(isOwner[msg.sender], "MultiSigWallet: caller is not an owner");
        _;
    }

    modifier transactionExists(uint256 transactionId) {
        require(transactionId < transactionCount, "MultiSigWallet: transaction does not exist");
        _;
    }

    modifier notExecuted(uint256 transactionId) {
        require(!transactions[transactionId].executed, "MultiSigWallet: transaction already executed");
        _;
    }

    modifier notConfirmed(uint256 transactionId) {
        require(!confirmations[transactionId][msg.sender], "MultiSigWallet: transaction already confirmed");
        _;
    }

    modifier confirmed(uint256 transactionId) {
        require(confirmations[transactionId][msg.sender], "MultiSigWallet: transaction not confirmed");
        _;
    }

    modifier validRequirement(uint256 ownerCount, uint256 _required) {
        require(_required > 0 && _required <= ownerCount && ownerCount > 0, "MultiSigWallet: invalid requirement");
        _;
    }

    /**
     * @dev 构造函数
     * @param _owners 初始所有者地址数组
     * @param _required 执行交易所需的最小确认数
     */
    constructor(address[] memory _owners, uint256 _required) 
        validRequirement(_owners.length, _required) 
    {
        require(_owners.length > 0, "MultiSigWallet: owners required");
        
        for (uint256 i = 0; i < _owners.length; i++) {
            address owner = _owners[i];
            require(owner != address(0), "MultiSigWallet: invalid owner");
            require(!isOwner[owner], "MultiSigWallet: owner not unique");
            
            isOwner[owner] = true;
            owners.push(owner);
        }
        
        required = _required;
    }

    /**
     * @dev 接收以太币
     */
    receive() external payable {
        // 允许合约接收以太币
    }

    /**
     * @dev 提交交易
     * @param to 目标地址
     * @param value 转账金额
     * @param data 调用数据
     * @return transactionId 交易ID
     */
    function submitTransaction(
        address to,
        uint256 value,
        bytes calldata data
    ) external onlyOwner returns (uint256) {
        require(to != address(0), "MultiSigWallet: invalid target address");
        
        uint256 transactionId = transactionCount;
        transactions[transactionId] = Transaction({
            to: to,
            value: value,
            data: data,
            executed: false,
            confirmations: 0
        });
        
        transactionCount++;
        emit TransactionSubmitted(transactionId, msg.sender, to, value, data);
        
        // 自动确认提交者的签名
        confirmTransaction(transactionId);
        
        return transactionId;
    }

    /**
     * @dev 确认交易
     * @param transactionId 交易ID
     */
    function confirmTransaction(uint256 transactionId) 
        public 
        onlyOwner 
        transactionExists(transactionId) 
        notConfirmed(transactionId) 
    {
        confirmations[transactionId][msg.sender] = true;
        transactions[transactionId].confirmations++;
        
        emit TransactionConfirmed(transactionId, msg.sender);
        
        // 如果达到所需确认数，自动执行
        if (isConfirmed(transactionId)) {
            executeTransaction(transactionId);
        }
    }

    /**
     * @dev 执行交易
     * @param transactionId 交易ID
     */
    function executeTransaction(uint256 transactionId) 
        public 
        onlyOwner 
        transactionExists(transactionId) 
        notExecuted(transactionId) 
    {
        require(isConfirmed(transactionId), "MultiSigWallet: transaction not confirmed");
        
        Transaction storage txn = transactions[transactionId];
        txn.executed = true;
        
        (bool success, bytes memory returnData) = txn.to.call{value: txn.value}(txn.data);
        
        if (success) {
            emit TransactionExecuted(transactionId);
        } else {
            txn.executed = false;
            emit TransactionFailed(transactionId, returnData);
            revert("MultiSigWallet: transaction execution failed");
        }
    }

    /**
     * @dev 撤销确认
     * @param transactionId 交易ID
     */
    function revokeConfirmation(uint256 transactionId) 
        external 
        onlyOwner 
        transactionExists(transactionId) 
        confirmed(transactionId) 
        notExecuted(transactionId) 
    {
        confirmations[transactionId][msg.sender] = false;
        transactions[transactionId].confirmations--;
        
        emit TransactionConfirmed(transactionId, msg.sender); // 可以考虑添加专门的撤销事件
    }

    /**
     * @dev 添加所有者
     * @param owner 新所有者地址
     */
    function addOwner(address owner) external {
        require(msg.sender == address(this), "MultiSigWallet: only wallet can add owner");
        require(owner != address(0), "MultiSigWallet: invalid owner");
        require(!isOwner[owner], "MultiSigWallet: owner already exists");
        
        isOwner[owner] = true;
        owners.push(owner);
        
        emit OwnerAddition(owner);
    }

    /**
     * @dev 移除所有者
     * @param owner 要移除的所有者地址
     */
    function removeOwner(address owner) external {
        require(msg.sender == address(this), "MultiSigWallet: only wallet can remove owner");
        require(isOwner[owner], "MultiSigWallet: not an owner");
        require(owners.length > 1, "MultiSigWallet: cannot remove last owner");
        require(owners.length - 1 >= required, "MultiSigWallet: would break requirement");
        
        isOwner[owner] = false;
        
        // 从数组中移除
        for (uint256 i = 0; i < owners.length; i++) {
            if (owners[i] == owner) {
                owners[i] = owners[owners.length - 1];
                owners.pop();
                break;
            }
        }
        
        emit OwnerRemoval(owner);
    }

    /**
     * @dev 更改所需确认数
     * @param _required 新的所需确认数
     */
    function changeRequirement(uint256 _required) 
        external 
        validRequirement(owners.length, _required) 
    {
        require(msg.sender == address(this), "MultiSigWallet: only wallet can change requirement");
        
        required = _required;
        emit RequirementChange(_required);
    }

    /**
     * @dev 获取所有者列表
     * @return 所有者地址数组
     */
    function getOwners() external view returns (address[] memory) {
        return owners;
    }

    /**
     * @dev 获取交易总数
     * @return 交易总数
     */
    function getTransactionCount() external view returns (uint256) {
        return transactionCount;
    }

    /**
     * @dev 检查交易是否已确认
     * @param transactionId 交易ID
     * @return 是否已确认
     */
    function isConfirmed(uint256 transactionId) public view returns (bool) {
        return transactions[transactionId].confirmations >= required;
    }

    /**
     * @dev 获取交易确认数
     * @param transactionId 交易ID
     * @return 确认数
     */
    function getConfirmationCount(uint256 transactionId) external view returns (uint256) {
        return transactions[transactionId].confirmations;
    }

    /**
     * @dev 获取交易详情
     * @param transactionId 交易ID
     * @return to 目标地址
     * @return value 转账金额
     * @return data 调用数据
     * @return executed 是否已执行
     */
    function getTransaction(uint256 transactionId) 
        external 
        view 
        returns (
            address to,
            uint256 value,
            bytes memory data,
            bool executed
        ) 
    {
        Transaction storage txn = transactions[transactionId];
        return (txn.to, txn.value, txn.data, txn.executed);
    }

    /**
     * @dev 获取交易确认状态
     * @param transactionId 交易ID
     * @param owner 所有者地址
     * @return 是否已确认
     */
    function getConfirmation(uint256 transactionId, address owner) 
        external 
        view 
        returns (bool) 
    {
        return confirmations[transactionId][owner];
    }

    /**
     * @dev 批量获取交易ID
     * @param from 起始索引
     * @param to 结束索引
     * @param pending 是否只返回待执行的交易
     * @param executed 是否只返回已执行的交易
     * @return _transactionIds 交易ID数组
     */
    function getTransactionIds(
        uint256 from,
        uint256 to,
        bool pending,
        bool executed
    ) external view returns (uint256[] memory _transactionIds) {
        require(to >= from, "MultiSigWallet: invalid range");
        require(to < transactionCount, "MultiSigWallet: to index out of bounds");
        
        uint256[] memory transactionIdsTemp = new uint256[](to - from + 1);
        uint256 count = 0;
        
        for (uint256 i = from; i <= to; i++) {
            if ((pending && !transactions[i].executed) || 
                (executed && transactions[i].executed)) {
                transactionIdsTemp[count] = i;
                count++;
            }
        }
        
        _transactionIds = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            _transactionIds[i] = transactionIdsTemp[i];
        }
    }
}
