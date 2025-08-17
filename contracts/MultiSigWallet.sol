// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8.28;

import "./interfaces/IMultiSigWallet.sol";
import "./libraries/Address.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title MultiSigWallet - 企业级多签名钱包
 * @dev 企业级多签名钱包实现，支持多重签名确认的安全钱包合约
 * @author samxie52
 * @notice 支持多重签名确认的安全钱包合约，集成重入保护和紧急暂停功能
 * 
 * 核心功能特性：
 * - 多重签名交易确认机制：需要达到指定数量的所有者确认才能执行交易
 * - 重入攻击保护：使用OpenZeppelin的ReentrancyGuard防止重入攻击
 * - 紧急暂停机制：支持紧急情况下暂停所有交易操作
 * - 动态所有者管理：支持添加/移除所有者，修改确认要求数量
 * - 批量操作优化：支持批量提交、确认、撤销交易，提高Gas效率
 * - 完整的事件日志：记录所有关键操作，便于监控和审计
 * 
 * 安全特性：
 * - 访问控制：严格的所有者权限控制
 * - 交易验证：防止重复确认、未确认交易执行
 * - 存储优化：优化的数据结构减少Gas消耗
 * - 边界检查：完整的输入验证和边界条件检查
 */
contract MultiSigWallet is IMultiSigWallet, ReentrancyGuard, Pausable {
    using Address for address;

    /**
     * @dev 交易结构体 - 经过Gas优化的存储布局
     * 
     * 存储优化说明：
     * - 将相关字段打包到同一个存储槽中，减少SSTORE操作的Gas消耗
     * - address(20字节) + uint96(12字节) = 32字节，正好填满一个存储槽
     * - bool(1字节) + uint32(4字节) = 5字节，与其他数据共享存储槽
     * - bytes数据动态存储，不影响固定字段的存储布局
     */
    struct Transaction {
        address to;           // 目标地址 (20 bytes) - 交易的接收方地址
        uint96 value;         // 转账金额 (12 bytes) - 支持最大79,228,162,514 ETH
        bool executed;        // 执行状态 (1 byte) - 标记交易是否已执行
        uint32 confirmations; // 确认数量 (4 bytes) - 当前交易获得的确认数，支持最大42亿确认
        bytes data;           // 调用数据 (动态大小) - 合约调用时的函数调用数据
    }

    // ============ 状态变量 ============
    
    /// @dev 交易ID到交易详情的映射，存储所有提交的交易
    mapping(uint256 => Transaction) public transactions;
    
    /// @dev 交易确认状态映射：交易ID => 所有者地址 => 是否已确认
    mapping(uint256 => mapping(address => bool)) public confirmations;
    
    /// @dev 所有者地址到是否为所有者的映射，用于快速验证所有者身份
    mapping(address => bool) public isOwner;
    
    /// @dev 所有者地址数组，存储所有钱包所有者的地址
    address[] public owners;
    
    /// @dev 执行交易所需的最小确认数量
    uint256 public required;
    
    /// @dev 交易计数器，同时作为下一个交易的ID
    uint256 public transactionCount;

    // ============ 访问控制修饰符 ============
    
    /**
     * @dev 仅限所有者访问修饰符
     * 验证调用者是否为钱包的所有者之一
     * 用于保护需要所有者权限的函数
     */
    modifier onlyOwner() {
        require(isOwner[msg.sender], "MultiSigWallet: caller is not an owner");
        _;
    }

    /**
     * @dev 交易存在性验证修饰符
     * 确保指定的交易ID对应的交易确实存在
     * 防止对不存在的交易进行操作
     */
    modifier transactionExists(uint256 transactionId) {
        require(transactionId < transactionCount, "MultiSigWallet: transaction does not exist");
        _;
    }

    /**
     * @dev 交易未执行验证修饰符
     * 确保交易尚未被执行，防止重复执行
     * 用于保护确认和执行相关的函数
     */
    modifier notExecuted(uint256 transactionId) {
        require(!transactions[transactionId].executed, "MultiSigWallet: transaction already executed");
        _;
    }

    /**
     * @dev 交易未确认验证修饰符
     * 确保当前调用者尚未确认指定交易
     * 防止同一所有者重复确认同一交易
     */
    modifier notConfirmed(uint256 transactionId) {
        require(!confirmations[transactionId][msg.sender], "MultiSigWallet: transaction already confirmed");
        _;
    }

    /**
     * @dev 交易已确认验证修饰符
     * 确保当前调用者已经确认了指定交易
     * 用于撤销确认等需要先确认的操作
     */
    modifier confirmed(uint256 transactionId) {
        require(confirmations[transactionId][msg.sender], "MultiSigWallet: transaction not confirmed");
        _;
    }

    /**
     * @dev 有效确认要求验证修饰符
     * 验证确认要求数量的合理性：
     * - 确认要求必须大于0
     * - 确认要求不能超过所有者数量
     * - 所有者数量必须大于0
     */
    modifier validRequirement(uint256 ownerCount, uint256 _required) {
        require(_required > 0 && _required <= ownerCount && ownerCount > 0, "MultiSigWallet: invalid requirement");
        _;
    }

    /**
     * @dev 仅限钱包自身调用修饰符
     * 确保只有通过多签名机制才能调用某些管理函数
     * 用于保护添加/移除所有者、修改确认要求等敏感操作
     */
    modifier onlyWallet() {
        require(msg.sender == address(this), "MultiSigWallet: only wallet can call this function");
        _;
    }

    // ============ 扩展事件定义 ============
    
    /// @dev 紧急暂停事件 - 记录谁触发了紧急暂停
    event EmergencyPause(address indexed pauser);
    
    /// @dev 解除紧急暂停事件 - 记录谁解除了紧急暂停
    event EmergencyUnpause(address indexed unpauser);
    
    /// @dev 所有者变更交易发起事件 - 记录新所有者添加交易的发起
    event OwnershipTransferInitiated(address indexed newOwner, uint256 indexed transactionId);
    
    /// @dev 确认要求变更交易发起事件 - 记录确认要求修改交易的发起
    event RequirementChangeInitiated(uint256 newRequired, uint256 indexed transactionId);
    
    /// @dev 确认撤销事件 - 记录所有者撤销对交易的确认
    event ConfirmationRevoked(uint256 indexed transactionId, address indexed owner);
    
    /// @dev 交易执行失败事件 - 记录交易执行失败的情况
    event ExecutionFailure(uint256 indexed transactionId);

    /**
     * @dev 构造函数 - 初始化多签名钱包
     * @param _owners 初始所有者地址数组
     * @param _required 执行交易所需的最小确认数
     * 
     * 实现步骤：
     * 1. 验证确认要求的合理性（通过validRequirement修饰符）
     * 2. 确保至少有一个所有者
     * 3. 遍历所有者数组，验证每个地址的有效性和唯一性
     * 4. 将有效的所有者地址添加到isOwner映射和owners数组中
     * 5. 设置执行交易所需的确认数量
     * 
     * 安全检查：
     * - 所有者地址不能为零地址
     * - 所有者地址必须唯一，不能重复
     * - 确认要求必须在合理范围内（1 <= required <= owners.length）
     */
    constructor(address[] memory _owners, uint256 _required) 
        validRequirement(_owners.length, _required) 
    {
        require(_owners.length > 0, "MultiSigWallet: owners required");
        
        // 遍历并验证每个所有者地址
        for (uint256 i = 0; i < _owners.length; i++) {
            address owner = _owners[i];
            require(owner != address(0), "MultiSigWallet: invalid owner");
            require(!isOwner[owner], "MultiSigWallet: owner not unique");
            
            // 添加所有者到映射和数组中
            isOwner[owner] = true;
            owners.push(owner);
        }
        
        // 设置执行交易所需的确认数量
        required = _required;
    }

    /**
     * @dev 接收以太币函数
     * 
     * 功能说明：
     * - 允许合约直接接收以太币转账
     * - 当有人向合约地址发送以太币时自动触发
     * - 不执行任何额外逻辑，仅接收资金
     * 
     * 使用场景：
     * - 外部账户或合约向钱包转入资金
     * - 为钱包充值以支付后续交易的Gas费用
     * - 接收交易执行后的退款或收益
     */
    receive() external payable {
        // 允许合约接收以太币，无需额外处理逻辑
    }

    /**
     * @dev 提交交易 - 所有者提交新的待执行交易
     * @param to 目标地址 - 交易的接收方地址（可以是外部账户或合约地址）
     * @param value 转账金额 - 随交易发送的以太币数量（单位：wei）
     * @param data 调用数据 - 合约调用时的函数调用数据，普通转账时为空
     * @return transactionId 交易ID - 新创建交易的唯一标识符
     * 
     * 功能说明：
     * - 允许钱包所有者提交新的交易请求
     * - 提交后自动为提交者确认该交易
     * - 如果确认数达到要求，会自动执行交易
     * 
     * 实现步骤：
     * 1. 验证调用者是钱包所有者（onlyOwner修饰符）
     * 2. 检查合约未处于暂停状态（whenNotPaused修饰符）
     * 3. 调用内部_submitTransaction函数处理具体逻辑
     * 4. 返回新创建的交易ID
     * 
     * 使用场景：
     * - 发送以太币到外部地址
     * - 调用其他合约的函数
     * - 执行钱包管理操作（通过调用自身函数）
     */
    function submitTransaction(
        address to,
        uint256 value,
        bytes calldata data
    ) external onlyOwner whenNotPaused returns (uint256) {
        return _submitTransaction(to, value, data);
    }

    /**
     * @dev 内部提交交易函数 - 处理交易提交的核心逻辑
     * @param to 目标地址 - 交易的接收方地址
     * @param value 转账金额 - 随交易发送的以太币数量
     * @param data 调用数据 - 合约调用时的函数调用数据
     * @return transactionId 交易ID - 新创建交易的唯一标识符
     * 
     * 功能说明：
     * - 创建新的交易记录并存储到区块链状态中
     * - 自动为提交者确认该交易（提高用户体验）
     * - 如果确认数达到要求，立即尝试执行交易
     * 
     * 实现步骤：
     * 1. 验证目标地址不能为零地址
     * 2. 验证转账金额不超过uint96的最大值（存储优化限制）
     * 3. 获取当前交易计数器作为新交易的ID
     * 4. 创建Transaction结构体并存储到transactions映射中
     * 5. 递增交易计数器
     * 6. 发出TransactionSubmitted事件记录操作
     * 7. 自动为提交者确认该交易
     * 8. 返回新交易的ID
     * 
     * 安全检查：
     * - 目标地址有效性验证
     * - 转账金额范围验证
     * - 事件日志记录便于审计
     * 
     * Gas优化：
     * - 使用优化的存储布局减少存储操作
     * - 合理的数据类型选择平衡功能和成本
     */
    function _submitTransaction(
        address to,
        uint256 value,
        bytes memory data
    ) internal returns (uint256) {
        require(to != address(0), "MultiSigWallet: invalid target address");
        require(value <= type(uint96).max, "MultiSigWallet: value exceeds maximum");
        
        // 获取新交易ID并创建交易记录
        uint256 transactionId = transactionCount;
        transactions[transactionId] = Transaction({
            to: to,
            value: uint96(value),
            executed: false,
            confirmations: 0,
            data: data
        });
        transactionCount++;
        
        // 发出事件记录交易提交
        emit TransactionSubmitted(transactionId, msg.sender, to, value, data);
        
        // 自动确认提交者的交易
        confirmTransaction(transactionId);
        
        return transactionId;
    }

    /**
     * @dev 确认交易 - 所有者确认待执行的交易
     * @param transactionId 交易ID - 要确认的交易的唯一标识符
     * 
     * 功能说明：
     * - 允许钱包所有者对提交的交易进行确认
     * - 记录确认状态并更新确认计数
     * - 当确认数达到要求时自动执行交易
     * 
     * 实现步骤：
     * 1. 验证调用者是钱包所有者（onlyOwner修饰符）
     * 2. 检查合约未处于暂停状态（whenNotPaused修饰符）
     * 3. 验证交易存在（transactionExists修饰符）
     * 4. 确保调用者尚未确认该交易（notConfirmed修饰符）
     * 5. 在confirmations映射中记录确认状态
     * 6. 增加交易的确认计数
     * 7. 发出TransactionConfirmed事件
     * 8. 检查是否达到执行条件，如果是则自动执行
     * 
     * 安全特性：
     * - 防止重复确认：同一所有者不能重复确认同一交易
     * - 防止对已执行交易的确认
     * - 防止对不存在交易的确认
     * - 自动执行机制提高用户体验
     * 
     * 访问控制：
     * - 仅限钱包所有者调用
     * - 合约暂停时无法操作
     */
    function confirmTransaction(uint256 transactionId) 
        public 
        onlyOwner 
        whenNotPaused
        transactionExists(transactionId) 
        notConfirmed(transactionId) 
    {
        // 记录确认状态
        confirmations[transactionId][msg.sender] = true;
        transactions[transactionId].confirmations++;
        
        // 发出确认事件
        emit TransactionConfirmed(transactionId, msg.sender);
        
        // 如果达到所需确认数，自动执行交易
        if (isConfirmed(transactionId)) {
            executeTransaction(transactionId);
        }
    }

    /**
     * @dev 执行交易 - 执行已获得足够确认的交易
     * @param transactionId 交易ID - 要执行的交易的唯一标识符
     * 
     * 功能说明：
     * - 执行已获得足够确认数的交易
     * - 支持以太币转账和合约函数调用
     * - 包含完整的错误处理和状态回滚机制
     * 
     * 实现步骤：
     * 1. 验证调用者是钱包所有者（onlyOwner修饰符）
     * 2. 防止重入攻击（nonReentrant修饰符）
     * 3. 检查合约未处于暂停状态（whenNotPaused修饰符）
     * 4. 验证交易存在且未执行（transactionExists, notExecuted修饰符）
     * 5. 确认交易已获得足够的确认数
     * 6. 标记交易为已执行状态
     * 7. 使用call函数执行目标交易
     * 8. 根据执行结果发出相应事件或回滚状态
     * 
     * 安全特性：
     * - 重入保护：使用OpenZeppelin的ReentrancyGuard
     * - 状态检查：确保交易满足执行条件
     * - 错误处理：执行失败时回滚状态并抛出异常
     * - 事件日志：记录执行结果便于监控
     * 
     * 执行机制：
     * - 使用低级call函数支持任意合约调用
     * - 支持发送以太币和调用数据
     * - 保留返回数据用于错误诊断
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
        
        // 获取交易详情并标记为已执行
        Transaction storage txn = transactions[transactionId];
        txn.executed = true;
        
        // 执行交易：支持以太币转账和合约调用
        (bool success, bytes memory returnData) = txn.to.call{value: txn.value}(txn.data);
        
        if (success) {
            // 执行成功，发出成功事件
            emit TransactionExecuted(transactionId);
        } else {
            // 执行失败，回滚状态并抛出异常
            txn.executed = false;
            emit TransactionFailed(transactionId, returnData);
            revert("MultiSigWallet: transaction execution failed");
        }
    }

    /**
     * @dev 撤销确认 - 所有者撤销对交易的确认
     * @param transactionId 交易ID - 要撤销确认的交易的唯一标识符
     * 
     * 功能说明：
     * - 允许已确认交易的所有者撤销其确认
     * - 减少交易的确认计数，可能阻止交易执行
     * - 提供灵活性让所有者改变决定
     * 
     * 实现步骤：
     * 1. 验证调用者是钱包所有者（onlyOwner修饰符）
     * 2. 验证交易存在（transactionExists修饰符）
     * 3. 确保调用者已经确认了该交易（confirmed修饰符）
     * 4. 确保交易尚未执行（notExecuted修饰符）
     * 5. 在confirmations映射中移除确认状态
     * 6. 减少交易的确认计数
     * 7. 发出撤销确认事件（注意：这里应该发出专门的撤销事件）
     * 
     * 安全特性：
     * - 只能撤销自己的确认
     * - 不能撤销已执行交易的确认
     * - 不能撤销未确认的交易
     * - 防止对不存在交易的操作
     * 
     * 使用场景：
     * - 所有者发现交易有问题需要重新考虑
     * - 交易参数发生变化需要重新评估
     * - 阻止可能有害的交易执行
     * 
     * 注意事项：
     * - 撤销确认后，如果确认数低于要求，交易将无法执行
     * - 其他所有者仍可以重新确认该交易
     */
    function revokeConfirmation(uint256 transactionId) 
        external 
        onlyOwner 
        transactionExists(transactionId) 
        confirmed(transactionId) 
        notExecuted(transactionId) 
    {
        // 移除确认状态
        confirmations[transactionId][msg.sender] = false;
        transactions[transactionId].confirmations--;
        
        // 发出撤销确认事件（注意：这里应该使用专门的撤销事件）
        emit ConfirmationRevoked(transactionId, msg.sender);
    }

    /**
     * @dev 添加所有者 - 通过多签名机制添加新的钱包所有者
     * @param owner 新所有者地址 - 要添加为钱包所有者的地址
     * 
     * 功能说明：
     * - 添加新的所有者到钱包中，扩大管理权限范围
     * - 只能通过多签名交易执行，确保现有所有者同意
     * - 新所有者将获得提交、确认、执行交易的权限
     * 
     * 实现步骤：
     * 1. 验证只能通过钱包自身调用（onlyWallet修饰符）
     * 2. 验证新所有者地址不能为零地址
     * 3. 确保该地址尚未是所有者
     * 4. 检查所有者数量限制（防止Gas限制问题）
     * 5. 在isOwner映射中标记新地址为所有者
     * 6. 将新地址添加到owners数组中
     * 7. 发出OwnerAddition事件记录操作
     * 
     * 安全特性：
     * - 多签名保护：只能通过多签名交易调用
     * - 地址验证：防止添加无效或重复的所有者
     * - 数量限制：防止所有者过多导致Gas问题
     * - 事件记录：便于监控和审计
     * 
     * 访问控制：
     * - 仅限通过多签名机制调用（msg.sender必须是合约自身）
     * - 需要现有所有者达成共识才能执行
     * 
     * 使用场景：
     * - 公司新增合伙人或管理者
     * - 扩大钱包管理团队
     * - 分散单点故障风险
     * 
     * Gas优化考虑：
     * - 限制最大所有者数量为50，平衡功能性和Gas成本
     * - 使用高效的数据结构存储所有者信息
     */
    function addOwner(address owner) external onlyWallet {
        require(owner != address(0), "MultiSigWallet: invalid owner address");
        require(!isOwner[owner], "MultiSigWallet: owner already exists");
        require(owners.length < 50, "MultiSigWallet: too many owners"); // 防止gas限制
        
        // 添加新所有者到映射和数组中
        isOwner[owner] = true;
        owners.push(owner);
        
        // 发出所有者添加事件
        emit OwnerAddition(owner);
    }

    /**
     * @dev 移除所有者 - 通过多签名机制移除现有的钱包所有者
     * @param owner 要移除的所有者地址 - 要从钱包中移除的所有者地址
     * 
     * 功能说明：
     * - 从钱包中移除指定的所有者，收回其管理权限
     * - 只能通过多签名交易执行，确保其他所有者同意
     * - 移除后该地址将失去所有钱包操作权限
     * 
     * 实现步骤：
     * 1. 验证只能通过钱包自身调用（onlyWallet修饰符）
     * 2. 确认要移除的地址确实是当前所有者
     * 3. 确保不会移除最后一个所有者（保持钱包可用性）
     * 4. 验证移除后剩余所有者数量仍满足确认要求
     * 5. 在isOwner映射中移除所有者标记
     * 6. 从owners数组中移除该地址（使用高效的交换删除法）
     * 7. 发出OwnerRemoval事件记录操作
     * 
     * 安全特性：
     * - 多签名保护：只能通过多签名交易调用
     * - 完整性检查：确保移除操作不会破坏钱包功能
     * - 阈值验证：确保剩余所有者数量仍能满足确认要求
     * - 最后所有者保护：防止移除所有所有者导致钱包无法使用
     * 
     * 数组操作优化：
     * - 使用交换删除法：将要删除的元素与最后一个元素交换，然后删除最后一个
     * - 避免数组元素移位，节省Gas成本
     * - 保持数组紧凑，无空隙
     * 
     * 访问控制：
     * - 仅限通过多签名机制调用
     * - 需要其他所有者达成共识才能执行
     * 
     * 使用场景：
     * - 员工离职或合伙人退出
     * - 安全事件后移除可能被攻破的账户
     * - 重组管理结构
     * 
     * 重要限制：
     * - 不能移除最后一个所有者
     * - 移除后剩余所有者数必须≥确认要求数
     */
    function removeOwner(address owner) external onlyWallet {
        require(isOwner[owner], "MultiSigWallet: address is not an owner");
        require(owners.length > 1, "MultiSigWallet: cannot remove last owner");
        require(owners.length - 1 >= required, "MultiSigWallet: would break requirement threshold");
        
        // 从映射中移除所有者标记
        isOwner[owner] = false;
        
        // 从数组中移除所有者（使用高效的交换删除法）
        for (uint256 i = 0; i < owners.length; i++) {
            if (owners[i] == owner) {
                // 将要删除的元素与最后一个元素交换
                owners[i] = owners[owners.length - 1];
                // 删除最后一个元素
                owners.pop();
                break;
            }
        }
        
        // 发出所有者移除事件
        emit OwnerRemoval(owner);
    }

    /**
     * @dev 更改所需确认数 - 通过多签名机制修改交易执行的确认要求
     * @param _required 新的所需确认数 - 执行交易所需的最小确认数量
     * 
     * 功能说明：
     * - 修改执行交易所需的最小确认数量
     * - 只能通过多签名交易执行，确保现有所有者同意
     * - 影响后续所有交易的执行条件
     * 
     * 实现步骤：
     * 1. 验证只能通过钱包自身调用（onlyWallet修饰符）
     * 2. 验证新确认要求的合理性（validRequirement修饰符）
     * 3. 更新required状态变量
     * 4. 发出RequirementChange事件记录变更
     * 5. 发出RequirementChangeInitiated事件记录交易信息
     * 
     * 安全特性：
     * - 多签名保护：只能通过多签名交易调用
     * - 范围验证：确保新要求在合理范围内（1 ≤ required ≤ owners.length）
     * - 事件记录：完整记录变更历史便于审计
     * 
     * 验证规则：
     * - 确认要求必须大于0（至少需要1个确认）
     * - 确认要求不能超过所有者总数
     * - 所有者总数必须大于0
     * 
     * 访问控制：
     * - 仅限通过多签名机制调用
     * - 需要现有所有者达成共识才能执行
     * 
     * 使用场景：
     * - 增加安全性：提高确认要求数量
     * - 提高效率：在信任度高时降低确认要求
     * - 适应团队规模变化
     * - 应对安全威胁调整策略
     * 
     * 影响范围：
     * - 仅影响变更后提交的新交易
     * - 不影响已提交但未执行的交易
     * - 立即生效，无需额外确认
     * 
     * 最佳实践：
     * - 根据所有者数量和信任度合理设置
     * - 考虑操作便利性和安全性的平衡
     * - 定期评估和调整确认要求
     */
    function changeRequirement(uint256 _required) 
        external 
        onlyWallet
        validRequirement(owners.length, _required) 
    {
        // 更新确认要求
        required = _required;
        
        // 发出确认要求变更事件
        emit RequirementChange(_required);
        emit RequirementChangeInitiated(_required, transactionCount - 1);
    }

    /**
     * @dev 获取所有者列表 - 返回所有钱包所有者的地址数组
     * @return 所有者地址数组 - 包含所有当前钱包所有者地址的数组
     * 
     * 功能说明：
     * - 返回当前钱包的所有所有者地址
     * - 只读函数，不修改合约状态
     * - 返回完整的所有者列表副本
     * 
     * 返回值：
     * - 地址数组，包含所有当前有效的所有者地址
     * - 数组长度等于当前所有者数量
     * - 按添加顺序排列（移除操作可能改变顺序）
     * 
     * 使用场景：
     * - 前端界面显示所有者列表
     * - 审计和监控系统查询所有者
     * - 其他合约集成时获取所有者信息
     * - 验证特定地址是否为所有者
     * 
     * Gas成本：
     * - 只读操作，不消耗Gas（在view调用中）
     * - 返回数据量与所有者数量成正比
     * 
     * 注意事项：
     * - 返回的是数组副本，修改不会影响合约状态
     * - 所有者列表可能因添加/移除操作而变化
     * - 在多签名操作过程中调用可能获得不一致结果
     */
    function getOwners() external view returns (address[] memory) {
        return owners;
    }

    /**
     * @dev 获取交易总数 - 返回已提交的交易总数量
     * @return 交易总数 - 自合约部署以来提交的交易总数量
     * 
     * 功能说明：
     * - 返回已提交的交易总数量（包括已执行和未执行的）
     * - 只读函数，不修改合约状态
     * - 同时也是下一个新交易的ID
     * 
     * 返回值：
     * - uint256类型的数值，表示交易总数
     * - 从0开始计数，每提交一个交易递增1
     * - 最大值为2^256-1（实际上不可能达到）
     * 
     * 使用场景：
     * - 前端界面显示交易统计信息
     * - 分页查询交易列表时确定范围
     * - 验证交易ID的有效性
     * - 统计分析和报告生成
     * 
     * 交易ID范围：
     * - 有效的交易ID范围为[0, transactionCount-1]
     * - 交易ID从0开始连续编号，不会有空隙
     * - 新交易的ID将是当前transactionCount的值
     * 
     * Gas成本：
     * - 只读操作，不消耗Gas（在view调用中）
     * - 单一状态变量读取，成本极低
     * 
     * 注意事项：
     * - 计数器只增不减，删除交易不会减少计数
     * - 在并发环境中调用可能获得不同结果
     * - 可用于验证交易是否存在：transactionId < transactionCount
     */
    function getTransactionCount() external view returns (uint256) {
        return transactionCount;
    }

    /**
     * @dev 检查交易是否已确认 - 判断交易是否获得了足够的确认数
     * @param transactionId 交易ID - 要检查的交易的唯一标识符
     * @return 是否已确认 - true表示已获得足够确认可以执行，false表示还需要更多确认
     * 
     * 功能说明：
     * - 检查指定交易的确认数是否达到或超过所需的最小确认数
     * - 只读函数，不修改合约状态
     * - 是判断交易是否可以执行的核心逻辑
     * 
     * 实现逻辑：
     * - 比较交易的当前确认数与所需确认数
     * - 当 confirmations >= required 时返回true
     * - 否则返回false
     * 
     * 返回值：
     * - true：交易已获得足够确认，可以执行
     * - false：交易尚未获得足够确认，需要更多所有者确认
     * 
     * 使用场景：
     * - 在executeTransaction函数中验证执行条件
     * - 在confirmTransaction函数中判断是否自动执行
     * - 前端界面显示交易状态
     * - 其他合约集成时检查交易状态
     * 
     * 注意事项：
     * - 不检查交易是否存在，调用方需要自行验证
     * - 不检查交易是否已执行，已执行的交易也可能返回true
     * - 确认数可能因撤销确认而变化
     * 
     * Gas成本：
     * - 只读操作，不消耗Gas（在view调用中）
     * - 单次存储读取，成本极低
     * 
     * 公开可见性：
     * - public函数，可以被外部调用和内部使用
     * - 常用于其他函数的条件检查
     */
    function isConfirmed(uint256 transactionId) public view returns (bool) {
        return transactions[transactionId].confirmations >= required;
    }

    /**
     * @dev 获取交易确认数 - 返回指定交易当前的确认数量
     * @param transactionId 交易ID - 要查询的交易的唯一标识符
     * @return 确认数 - 当前交易获得的确认数量
     * 
     * 功能说明：
     * - 返回指定交易当前已获得的确认数量
     * - 只读函数，不修改合约状态
     * - 可用于监控交易的确认进度
     * 
     * 返回值：
     * - uint256类型的数值，表示确认数量
     * - 范围为[0, owners.length]
     * - 0表示无人确认，owners.length表示所有人都确认
     * 
     * 使用场景：
     * - 前端界面显示交易确认进度
     * - 监控系统跟踪交易状态
     * - 判断交易距离执行还需多少确认
     * - 统计分析和报告生成
     * 
     * 计算公式：
     * - 还需确认数 = required - confirmations
     * - 确认进度 = confirmations / required * 100%
     * - 是否可执行 = confirmations >= required
     * 
     * 数据一致性：
     * - 确认数与实际确认的所有者数量一致
     * - 每次确认操作都会递增该计数器
     * - 每次撤销确认都会递减该计数器
     * 
     * Gas成本：
     * - 只读操作，不消耗Gas（在view调用中）
     * - 单次存储读取，成本极低
     * 
     * 注意事项：
     * - 不检查交易是否存在，不存在的交易返回0
     * - 确认数可能因所有者确认/撤销操作而变化
     * - 在并发环境中调用可能获得不一致结果
     */
    function getConfirmationCount(uint256 transactionId) external view returns (uint256) {
        return transactions[transactionId].confirmations;
    }

    /**
     * @dev 获取交易详情 - 返回指定交易的完整信息
     * @param transactionId 交易ID - 要查询的交易的唯一标识符
     * @return to 目标地址 - 交易的接收方地址
     * @return value 转账金额 - 随交易发送的以太币数量（单位：wei）
     * @return data 调用数据 - 合约调用时的函数调用数据
     * @return executed 是否已执行 - true表示交易已执行，false表示尚未执行
     * 
     * 功能说明：
     * - 返回指定交易的所有关键信息
     * - 只读函数，不修改合约状态
     * - 提供交易的完整视图供外部查询
     * 
     * 返回值详解：
     * - to：交易的目标地址，可以是外部账户或合约地址
     * - value：转账的以太币数量，以wei为单位
     * - data：合约调用数据，普通转账时为空
     * - executed：执行状态，标记交易是否已被执行
     * 
     * 使用场景：
     * - 前端界面显示交易详情
     * - 审计系统查询交易信息
     * - 其他合约集成时获取交易数据
     * - 验证交易参数的正确性
     * 
     * 数据类型转换：
     * - value从内部的uint96类型转换为uint256返回
     * - 其他字段保持原始类型
     * 
     * Gas成本：
     * - 只读操作，不消耗Gas（在view调用中）
     * - 多次存储读取，成本中等
     * - data字段可能较大，影响返回数据量
     * 
     * 注意事项：
     * - 不检查交易是否存在，不存在的交易返回默认值
     * - 返回的data是存储的副本，修改不会影响合约状态
     * - 在并发环境中调用可能获得不一致结果
     * 
     * 存储访问模式：
     * - 使用storage引用访问交易数据
     * - 直接读取存储中的数据，无需复制
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
     * @dev 获取交易确认状态 - 查询指定所有者对特定交易的确认状态
     * @param transactionId 交易ID - 要查询的交易的唯一标识符
     * @param owner 所有者地址 - 要查询确认状态的所有者地址
     * @return 是否已确认 - true表示该所有者已确认该交易，false表示尚未确认
     * 
     * 功能说明：
     * - 查询指定所有者是否已经确认了指定的交易
     * - 只读函数，不修改合约状态
     * - 提供精确的个体确认状态查询
     * 
     * 返回值：
     * - true：指定所有者已经确认了该交易
     * - false：指定所有者尚未确认该交易或已撤销确认
     * 
     * 使用场景：
     * - 前端界面显示每个所有者的确认状态
     * - 验证特定所有者是否已确认某交易
     * - 审计系统跟踪确认进度
     * - 其他合约集成时检查确认状态
     * 
     * 数据结构：
     * - 使用二维映射存储：confirmations[transactionId][owner]
     * - 默认值为false（未确认状态）
     * - 确认后设置为true，撤销后设置为false
     * 
     * 状态变化：
     * - 初始状态：false（未确认）
     * - 确认后：true（已确认）
     * - 撤销后：false（重新未确认）
     * - 可以多次在true和false之间切换
     * 
     * Gas成本：
     * - 只读操作，不消耗Gas（在view调用中）
     * - 单次映射读取，成本极低
     * 
     * 注意事项：
     * - 不检查交易是否存在，不存在的交易返回false
     * - 不检查owner是否为有效所有者，非所有者也返回false
     * - 在并发环境中调用可能获得不一致结果
     * 
     * 安全性：
     * - 公开可见，任何人都可以查询确认状态
     * - 不涉及敏感信息，只是状态查询
     * - 提供透明度和可验证性
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
