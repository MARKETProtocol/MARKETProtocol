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
import "./MarketContractSettlementExternalSettlementStore.sol";
import "./MarketContractSettlementStrategyInterface.sol";
import "./MarketContract.sol";
import "./MarketContractStore.sol";

contract MarketContractSettlementExternalSettlement is Ownable {
    address private storeAddress;
    
    constructor() public {
        storeAddress = address(new MarketContractSettlementExternalSettlementStore());
    }
    
    // Modifiers
    modifier notSettled(address contractAddress) {
        require(isSettled(contractAddress), "Contract is already settled");
        _;
    }
    
    // External functions
    // ...

    // External functions that are view
    // ...

    // External functions that are pure
    // ...

    // Public functions
    // ...

    // Public functions that are view

    function isSettled(address contractAddress) public view returns (bool) {
        return contractStore(contractAddress).state(contractAddress) == "settled";
    }

    // Internal functions
    // ...
    /// @dev checks our last query price to see if our contract should enter settlement due to it being past our
    //  expiration date or outside of our tradeable ranges.
    function checkSettlement(address contractAddress) internal notSettled(contractAddress) {
        uint newSettlementPrice;
        if (now > expiration()) {  // note: miners can cheat this by small increments of time (minutes, not hours)
            isSettled = true;                   // time based expiration has occurred.
            newSettlementPrice = lastPrice;
        } else if (lastPrice >= PRICE_CAP) {    // price is greater or equal to our cap, settle to CAP price
            isSettled = true;
            newSettlementPrice = PRICE_CAP;
        } else if (lastPrice <= PRICE_FLOOR) {  // price is lesser or equal to our floor, settle to FLOOR price
            isSettled = true;
            newSettlementPrice = PRICE_FLOOR;
        }

        if (isSettled) {
            settleContract(newSettlementPrice);
        }
    }
    
    // Internal functions that are view
    
    function contractStore(address contractAddress) internal view {
        return MarketContractStore(MarketContract(contractAddress).storeAddress);
    }

    // Private functions
    // ...
    
    
    // Private functions that are view

    function store() private view {
        return MarketContractSettlementExternalSettlementStore(storeAddress);
    }
}