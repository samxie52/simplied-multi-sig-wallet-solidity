// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IERC20 {
    // 查询总供应量
    function totalSupply() external view returns (uint256);
    // 查询账户余额
    function balanceOf(address account) external view returns (uint256);
    // 转账
    function transfer(address recipient, uint256 amount) external returns (bool);
    // 查询授权额度
    function allowance(address owner, address spender) external view returns (uint256);
    // 授权
    function approve(address spender, uint256 amount) external returns (bool);
    // 从sender转到recipient
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
}