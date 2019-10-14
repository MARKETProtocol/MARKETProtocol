/*
    Copyright 2017-2019 MARKET Protocol

    Licensed under the Apache License, Version 2.0 (the "License");
    you may not use this file except in compliance with the License.
    You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

    Unless required by applicable law or agreed to in writing, software
    distributed under the License is distributed on an "AS IS" BASIS,
    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
    See the License for the specific language governing permissions and
    limitations under the License.
*/

pragma solidity 0.5.11;

import "github.com/OpenZeppelin/openzeppelin-contracts/blob/v2.3.0/contracts/ownership/Ownable.sol";

import "./MarketContract.sol";
import "./MarketContractSettlementStrategyExternalLogic.sol";
import "./MarketContractSettlementStrategyExternalStore.sol";
import "./MarketContractSettlementStrategyInterface.sol";

contract MarketContractSettlementStrategyExternal is Ownable {
    address private logicAddress;
    address private storeAddress;
    
    constructor() public {
        logicAddress = address(new MarketContractSettlementStrategyExternalLogic());
        storeAddress = address(new MarketContractSettlementStrategyExternalStore());
    }
    
    // Modifiers
    // ...

    // External functions
    // ...

    // External functions that are view

    function expirationTimestamp(address contractAddress) external view returns (uint40) {
        return store(contractAddress).expirationTimestamp();
    }

    function oraclePrice(address contractAddress) external view returns (string memory) {
        return store(contractAddress).oraclePrice();
    }

    function oracleUrl(address contractAddress) external view returns (string memory) {
        return store(contractAddress).oracleUrl();
    }

    function settlementDelay(address contractAddress) external view returns (uint16) {
        return store(contractAddress).settlementDelay();
    }
    
    function settlementPrice(address contractAddress) external view returns (uint) {
        return store(contractAddress).settlementPrice();
    }
    
    function settlementTimestamp(address contractAddress) external view returns (uint40) {
        return store(contractAddress).settlementTimestamp();
    }

    // External functions that are pure
    // ...

    // Public functions
    // ...
    
    /// @dev records our settlement price.
    /// @param settlementPrice final price at time of settlement
    function settle(uint settlementPrice_) public {
        logic().settle(msg.sender, settlementPrice_);
    }

    // Public functions that are view
    // ...

    // Internal functions
    // ...
    
    // Internal functions that are view
    // ...
    
    // Private functions
    // ...
    
    // Private functions that are view

    function logic() private view {
        return MarketContractSettlementExternalSettlementLogic(logicAddress);
    }

    function store() private view {
        return MarketContractSettlementExternalSettlementStore(storeAddress);
    }
}