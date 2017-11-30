/*
    Copyright 2017 Phillip A. Elsasser

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

pragma solidity 0.4.18;

import "../Creatable.sol";

import "zeppelin-solidity/contracts/token/StandardToken.sol";

/// @title Market Token
/// @notice Our membership and fee token.  Users must lock tokens to enable trading for a given Market Contract
/// as well as have a minimum balance of tokens to create new Market Contracts.
/// @author Phil Elsasser <phil@marketprotcol.io>
contract MKTToken is StandardToken, Creatable {

    string public constant name = "Market Token";
    string public constant symbol = "MKT";
    uint8 public constant decimals = 18;

    uint public lockQtyToAllowTrading = uint256(25)**decimals;
    uint public minBalanceToAllowContractCreation = uint256(50)**decimals;

    mapping(address => mapping(address => uint)) contractAddressToUserAddressToQtyLocked;

    event UpdatedUserLockedBalance(address indexed contractAddress, address indexed userAddress, uint balance);

    function MKTToken() public {

    }

    /*
    // EXTERNAL METHODS
    */

    function isUserEnabledForContract(address contractAddress, address userAddress) external view returns (bool) {
        return contractAddressToUserAddressToQtyLocked[contractAddress][userAddress] >= lockQtyToAllowTrading;
    }

    function isBalanceSufficientForContractCreation(address userAddress) external view returns (bool) {
        return balances[userAddress] >= lockQtyToAllowTrading;
    }

    function lockTokensForTradingMarketContract(address contractAddress, uint qtyToLock) external {
        transferFrom(msg.sender, this, qtyToLock);
        uint256 lockedBalance = contractAddressToUserAddressToQtyLocked[contractAddress][msg.sender].add(qtyToLock);
        contractAddressToUserAddressToQtyLocked[contractAddress][msg.sender] = lockedBalance;
        UpdatedUserLockedBalance(contractAddress, msg.sender, lockedBalance);
    }

    function unlockTokens(address contractAddress, uint qtyToUnlock) external {
        require(contractAddressToUserAddressToQtyLocked[contractAddress][msg.sender] >= qtyToUnlock);     // ensure sufficient balance
        uint256 balanceAfterUnLock = contractAddressToUserAddressToQtyLocked[contractAddress][msg.sender].sub(qtyToUnlock);
        contractAddressToUserAddressToQtyLocked[contractAddress][msg.sender] = balanceAfterUnLock;        // update balance before external call!
        transfer(msg.sender, qtyToUnlock);
        UpdatedUserLockedBalance(contractAddress, msg.sender, balanceAfterUnLock);
    }


    /*
    // EXTERNAL - ONLY CREATOR  METHODS
    */

    function setLockQtyToAllowTrading(uint qtyToLock) external onlyCreator {
        lockQtyToAllowTrading = qtyToLock;
    }

    function setMinBalanceForContractCreation(uint minBalance) external onlyCreator {
        minBalanceToAllowContractCreation = minBalance;
    }

}
