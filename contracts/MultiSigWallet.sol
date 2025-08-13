// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8.28;

import "./interfaces/IMultiSigWallet.sol";
import "./libraries/Address.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title MultiSigWallet
 * @dev 企业级多签名钱包实现
 * @author samxie52
 * @notice 支持多重签名确认的安全钱包合约，集成重入保护和紧急暂停功能
 */
contract MultiSigWallet is IMultiSigWallet, ReentrancyGuard, Pausable {
    using Address for address;

    // 交易结构体 - 优化存储布局
    struct Transaction {
        address to;           // 目标地址 (20 bytes)
        uint96 value;         // 转账金额，支持最大79,228,162,514 ETH (12 bytes)
        bool executed;        // 执行状态 (1 byte)
        uint32 confirmations; // 确认数量，支持最大42亿确认 (4 bytes)
        bytes data;           // 调用数据 (动态大小)
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

    modifier onlyWallet() {
        require(msg.sender == address(this), "MultiSigWallet: only wallet can call this function");
        _;
    }

    // 紧急暂停相关事件
    event EmergencyPause(address indexed pauser);
    event EmergencyUnpause(address indexed unpauser);
    
    // 所有者管理事件
    event OwnershipTransferInitiated(address indexed newOwner, uint256 indexed transactionId);
    event RequirementChangeInitiated(uint256 newRequired, uint256 indexed transactionId);
    
    // 批量操作事件
    event ConfirmationRevoked(uint256 indexed transactionId, address indexed owner);
    event ExecutionFailure(uint256 indexed transactionId);

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
    ) external onlyOwner whenNotPaused returns (uint256) {
        return _submitTransaction(to, value, data);
    }

    /**
     * @dev 内部提交交易函数
     * @param to 目标地址
     * @param value 转账金额
     * @param data 调用数据
     * @return transactionId 交易ID
     */
    function _submitTransaction(
        address to,
        uint256 value,
        bytes memory data
    ) internal returns (uint256) {
        require(to != address(0), "MultiSigWallet: invalid target address");
        require(value <= type(uint96).max, "MultiSigWallet: value exceeds maximum");
        
        uint256 transactionId = transactionCount;
        transactions[transactionId] = Transaction({
            to: to,
            value: uint96(value),
            executed: false,
            confirmations: 0,
            data: data
        });
        transactionCount++;
        
        emit TransactionSubmitted(transactionId, msg.sender, to, value, data);
        
        // 自动确认提交者的交易
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
        whenNotPaused
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
        nonReentrant
        whenNotPaused
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
     * @dev 添加所有者（只能通过多签名调用）
     * @param owner 新所有者地址
     */
    function addOwner(address owner) external onlyWallet {
        require(owner != address(0), "MultiSigWallet: invalid owner address");
        require(!isOwner[owner], "MultiSigWallet: owner already exists");
        require(owners.length < 50, "MultiSigWallet: too many owners"); // 防止gas限制
        
        isOwner[owner] = true;
        owners.push(owner);
        
        emit OwnerAddition(owner);
    }

    /**
     * @dev 移除所有者（只能通过多签名调用）
     * @param owner 要移除的所有者地址
     */
    function removeOwner(address owner) external onlyWallet {
        require(isOwner[owner], "MultiSigWallet: address is not an owner");
        require(owners.length > 1, "MultiSigWallet: cannot remove last owner");
        require(owners.length - 1 >= required, "MultiSigWallet: would break requirement threshold");
        
        isOwner[owner] = false;
        
        // 从数组中移除所有者
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
     * @dev 更改所需确认数（只能通过多签名调用）
     * @param _required 新的所需确认数
     */
    function changeRequirement(uint256 _required) 
        external 
        onlyWallet
        validRequirement(owners.length, _required) 
    {
        required = _required;
        
        emit RequirementChange(_required);
        emit RequirementChangeInitiated(_required, transactionCount - 1);
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

    /**
     * @dev 紧急暂停合约（只能通过多签名调用）
     * @notice 暂停所有交易相关操作，用于紧急情况
     */
    function emergencyPause() external onlyWallet {
        _pause();
        emit EmergencyPause(msg.sender);
    }

    /**
     * @dev 解除紧急暂停（只能通过多签名调用）
     * @notice 恢复所有交易相关操作
     */
    function emergencyUnpause() external onlyWallet {
        _unpause();
        emit EmergencyUnpause(msg.sender);
    }

    /**
     * @dev 提交所有者管理交易的便捷函数
     * @param newOwner 新所有者地址
     * @return transactionId 交易ID
     */
    function submitAddOwner(address newOwner) external onlyOwner whenNotPaused returns (uint256) {
        require(newOwner != address(0), "MultiSigWallet: invalid owner address");
        require(!isOwner[newOwner], "MultiSigWallet: owner already exists");
        
        bytes memory data = abi.encodeWithSelector(this.addOwner.selector, newOwner);
        uint256 transactionId = _submitTransaction(address(this), 0, data);
        emit OwnershipTransferInitiated(newOwner, transactionId);
        return transactionId;
    }

    /**
     * @dev 提交移除所有者交易的便捷函数
     * @param owner 要移除的所有者地址
     * @return transactionId 交易ID
     */
    function submitRemoveOwner(address owner) external onlyOwner whenNotPaused returns (uint256) {
        require(isOwner[owner], "MultiSigWallet: address is not an owner");
        require(owners.length > 1, "MultiSigWallet: cannot remove last owner");
        require(owners.length - 1 >= required, "MultiSigWallet: would break requirement threshold");
        
        bytes memory data = abi.encodeWithSelector(this.removeOwner.selector, owner);
        return _submitTransaction(address(this), 0, data);
    }

    /**
     * @dev 提交更改确认要求交易的便捷函数
     * @param newRequired 新的确认要求数量
     * @return transactionId 交易ID
     */
    function submitChangeRequirement(uint256 newRequired) external onlyOwner whenNotPaused returns (uint256) {
        require(newRequired > 0 && newRequired <= owners.length, "MultiSigWallet: invalid requirement");
        
        bytes memory data = abi.encodeWithSelector(this.changeRequirement.selector, newRequired);
        uint256 transactionId = _submitTransaction(address(this), 0, data);
        emit RequirementChangeInitiated(newRequired, transactionId);
        return transactionId;
    }

    /**
     * @dev 提交紧急暂停交易的便捷函数
     * @return transactionId 交易ID
     */
    function submitEmergencyPause() external onlyOwner returns (uint256) {
        require(!paused(), "MultiSigWallet: already paused");
        bytes memory data = abi.encodeWithSelector(this.emergencyPause.selector);
        return _submitTransaction(address(this), 0, data);
    }

    /**
     * @dev 提交解除暂停交易的便捷函数
     * @return transactionId 交易ID
     */
    function submitEmergencyUnpause() external onlyOwner returns (uint256) {
        require(paused(), "MultiSigWallet: not paused");
        bytes memory data = abi.encodeWithSelector(this.emergencyUnpause.selector);
        return _submitTransaction(address(this), 0, data);
    }

    // ============ 批量操作功能 - Gas优化 ============

    /**
     * @dev 批量确认多个交易
     * @param transactionIds 交易ID数组
     */
    function batchConfirm(uint256[] calldata transactionIds) 
        external 
        onlyOwner 
        whenNotPaused 
    {
        require(transactionIds.length > 0, "MultiSigWallet: empty transaction list");
        require(transactionIds.length <= 20, "MultiSigWallet: too many transactions");
        
        for (uint256 i = 0; i < transactionIds.length; i++) {
            uint256 transactionId = transactionIds[i];
            
            // 检查交易是否存在且未确认
            if (transactionId < transactionCount && 
                !confirmations[transactionId][msg.sender] && 
                !transactions[transactionId].executed) {
                
                confirmations[transactionId][msg.sender] = true;
                transactions[transactionId].confirmations++;
                
                emit TransactionConfirmed(transactionId, msg.sender);
                
                // 检查是否可以自动执行
                if (transactions[transactionId].confirmations >= required) {
                    _executeTransaction(transactionId);
                }
            }
        }
    }

    /**
     * @dev 批量撤销确认多个交易
     * @param transactionIds 交易ID数组
     */
    function batchRevoke(uint256[] calldata transactionIds) 
        external 
        onlyOwner 
        whenNotPaused 
    {
        require(transactionIds.length > 0, "MultiSigWallet: empty transaction list");
        require(transactionIds.length <= 20, "MultiSigWallet: too many transactions");
        
        for (uint256 i = 0; i < transactionIds.length; i++) {
            uint256 transactionId = transactionIds[i];
            
            // 检查交易是否存在且已确认但未执行
            if (transactionId < transactionCount && 
                confirmations[transactionId][msg.sender] && 
                !transactions[transactionId].executed) {
                
                confirmations[transactionId][msg.sender] = false;
                transactions[transactionId].confirmations--;
                
                emit ConfirmationRevoked(transactionId, msg.sender);
            }
        }
    }

    /**
     * @dev 批量提交多个交易
     * @param targets 目标地址数组
     * @param values 转账金额数组
     * @param dataArray 调用数据数组
     * @return transactionIds 交易ID数组
     */
    function batchSubmit(
        address[] calldata targets,
        uint256[] calldata values,
        bytes[] calldata dataArray
    ) external onlyOwner whenNotPaused returns (uint256[] memory transactionIds) {
        require(targets.length > 0, "MultiSigWallet: empty transaction list");
        require(targets.length <= 10, "MultiSigWallet: too many transactions");
        require(targets.length == values.length && targets.length == dataArray.length, 
                "MultiSigWallet: array length mismatch");
        
        transactionIds = new uint256[](targets.length);
        
        for (uint256 i = 0; i < targets.length; i++) {
            transactionIds[i] = _submitTransaction(targets[i], values[i], dataArray[i]);
        }
        
        return transactionIds;
    }

    /**
     * @dev 内部执行交易函数 - 用于批量操作优化
     * @param transactionId 交易ID
     */
    function _executeTransaction(uint256 transactionId) internal {
        Transaction storage txn = transactions[transactionId];
        
        if (!txn.executed && txn.confirmations >= required) {
            txn.executed = true;
            
            bool success;
            if (txn.data.length == 0) {
                // 简单以太币转账
                (success, ) = txn.to.call{value: txn.value}("");
            } else {
                // 合约调用
                (success, ) = txn.to.call{value: txn.value}(txn.data);
            }
            
            if (success) {
                emit TransactionExecuted(transactionId);
            } else {
                txn.executed = false;
                emit ExecutionFailure(transactionId);
            }
        }
    }

    // ============ Gas优化的查询函数 ============

    /**
     * @dev 获取多个交易的确认状态 - Gas优化版本
     * @param transactionIds 交易ID数组
     * @return confirmationStatus 确认状态数组
     */
    function batchIsConfirmed(uint256[] calldata transactionIds) 
        external 
        view 
        returns (bool[] memory confirmationStatus) 
    {
        confirmationStatus = new bool[](transactionIds.length);
        
        for (uint256 i = 0; i < transactionIds.length; i++) {
            uint256 transactionId = transactionIds[i];
            confirmationStatus[i] = transactionId < transactionCount && 
                          transactions[transactionId].confirmations >= required;
        }
        
        return confirmationStatus;
    }

    /**
     * @dev 获取用户对多个交易的确认状态
     * @param transactionIds 交易ID数组
     * @param ownerAddr 所有者地址
     * @return confirmationStatus 确认状态数组
     */
    function batchGetConfirmation(uint256[] calldata transactionIds, address ownerAddr) 
        external 
        view 
        returns (bool[] memory confirmationStatus) 
    {
        confirmationStatus = new bool[](transactionIds.length);
        
        for (uint256 i = 0; i < transactionIds.length; i++) {
            confirmationStatus[i] = confirmations[transactionIds[i]][ownerAddr];
        }
        
        return confirmationStatus;
    }
}
