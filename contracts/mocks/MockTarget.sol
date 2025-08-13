// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title MockTarget
 * @dev Mock contract for testing multi-signature wallet interactions
 * @author samxie52
 */
contract MockTarget {
    uint256 public value;
    address public caller;
    bytes public data;
    bool public fallbackCalled;
    
    event ValueChanged(uint256 newValue, address indexed changer);
    event FunctionCalled(string functionName, address indexed caller, bytes data);
    event EtherReceived(address indexed sender, uint256 amount);

    /**
     * @dev Simple function to change a value
     */
    function setValue(uint256 _value) external {
        value = _value;
        caller = msg.sender;
        emit ValueChanged(_value, msg.sender);
        emit FunctionCalled("setValue", msg.sender, abi.encode(_value));
    }

    /**
     * @dev Function that requires payment
     */
    function setValueWithPayment(uint256 _value) external payable {
        require(msg.value > 0, "Payment required");
        value = _value;
        caller = msg.sender;
        emit ValueChanged(_value, msg.sender);
        emit FunctionCalled("setValueWithPayment", msg.sender, abi.encode(_value));
        emit EtherReceived(msg.sender, msg.value);
    }

    /**
     * @dev Function that reverts
     */
    function revertingFunction() external pure {
        revert("This function always reverts");
    }

    /**
     * @dev Function with multiple parameters
     */
    function multipleParams(
        uint256 _number,
        string memory _text,
        bool _flag
    ) external {
        value = _number;
        caller = msg.sender;
        emit FunctionCalled("multipleParams", msg.sender, abi.encode(_number, _text, _flag));
    }

    /**
     * @dev Function that returns data
     */
    function getData() external view returns (uint256, address, bytes memory) {
        return (value, caller, data);
    }

    /**
     * @dev Function to test complex data handling
     */
    function handleComplexData(bytes calldata _data) external {
        data = _data;
        caller = msg.sender;
        emit FunctionCalled("handleComplexData", msg.sender, _data);
    }

    /**
     * @dev Function to simulate expensive operation
     */
    function expensiveOperation() external {
        // Simulate gas-intensive operation
        for (uint256 i = 0; i < 100; i++) {
            value = i;
        }
        caller = msg.sender;
        emit FunctionCalled("expensiveOperation", msg.sender, "");
    }

    /**
     * @dev Function to test event emission
     */
    function emitEvent(string memory message) external {
        emit FunctionCalled(message, msg.sender, abi.encode(message));
    }

    /**
     * @dev Complex function for testing
     */
    function complexFunction(
        uint256[] memory numbers,
        string memory text,
        bool flag
    ) external {
        if (numbers.length > 0) {
            value = numbers[0];
        }
        caller = msg.sender;
        emit FunctionCalled("complexFunction", msg.sender, abi.encode(numbers, text, flag));
    }

    /**
     * @dev Function that always fails for testing
     */
    function failingFunction() external pure {
        revert("This function always fails");
    }

    /**
     * @dev Gas griefing function for testing
     */
    function gasGriefing() external {
        // Consume a lot of gas
        for (uint256 i = 0; i < 10000; i++) {
            value = i;
        }
        caller = msg.sender;
        emit FunctionCalled("gasGriefing", msg.sender, "");
    }

    /**
     * @dev Receive function to accept Ether
     */
    receive() external payable {
        emit EtherReceived(msg.sender, msg.value);
    }

    /**
     * @dev Fallback function
     */
    fallback() external payable {
        fallbackCalled = true;
        caller = msg.sender;
        data = msg.data;
        emit FunctionCalled("fallback", msg.sender, msg.data);
        if (msg.value > 0) {
            emit EtherReceived(msg.sender, msg.value);
        }
    }

    /**
     * @dev Get contract balance
     */
    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }

    /**
     * @dev Withdraw all Ether (for testing)
     */
    function withdraw() external {
        payable(msg.sender).transfer(address(this).balance);
    }

    /**
     * @dev Reset state for testing
     */
    function reset() external {
        value = 0;
        caller = address(0);
        data = "";
        fallbackCalled = false;
    }
}
