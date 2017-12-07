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
/// @notice Our membership token.  Users must lock tokens to enable trading for a given Market Contract
/// as well as have a minimum balance of tokens to create new Market Contracts.
/// @author Phil Elsasser <phil@marketprotcol.io>
contract MarketToken is StandardToken, Creatable {

    string public constant name = "Market Token";
    string public constant symbol = "MKT";
    uint8 public constant decimals = 18;

    uint public constant INITIAL_SUPPLY = 10**27; // 1 billion w. 18 decimals

    uint public lockQtyToAllowTrading;
    uint public minBalanceToAllowContractCreation;

    mapping(address => mapping(address => uint)) contractAddressToUserAddressToQtyLocked;

    event UpdatedUserLockedBalance(address indexed contractAddress, address indexed userAddress, uint balance);

    function MarketToken(uint qtyToLockForTrading, uint minBalanceForCreation) public {
        lockQtyToAllowTrading = qtyToLockForTrading;
        minBalanceToAllowContractCreation = minBalanceForCreation;
        totalSupply = INITIAL_SUPPLY;

        balances[msg.sender] = INITIAL_SUPPLY; // for now allocate all tokens to creator
    }

    /*
    // EXTERNAL METHODS
    */

    /// @notice checks if a user address has locked the needed qty to allow trading to a given contract address
    /// @param marketContractAddress address of the MarketContract
    /// @param userAddress address of the user
    /// @return true if user has locked tokens to trade the supplied marketContractAddress
    function isUserEnabledForContract(address marketContractAddress, address userAddress) external view returns (bool) {
        return contractAddressToUserAddressToQtyLocked[marketContractAddress][userAddress] >= lockQtyToAllowTrading;
    }

    /// @notice checks if a user address has enough token balance to be eligible to create a contract
    /// @param userAddress address of the user
    /// @return true if user has sufficient balance of tokens
    function isBalanceSufficientForContractCreation(address userAddress) external view returns (bool) {
        return balances[userAddress] >= minBalanceToAllowContractCreation;
    }

    /// @notice allows user to lock tokens to enable trading for a given market contract
    /// @param marketContractAddress address of the MarketContract
    /// @param qtyToLock desired qty of tokens to lock
    function lockTokensForTradingMarketContract(address marketContractAddress, uint qtyToLock) external {
        uint256 lockedBalance = contractAddressToUserAddressToQtyLocked[marketContractAddress][msg.sender].add(
            qtyToLock
        );
        transfer(this, qtyToLock);
        contractAddressToUserAddressToQtyLocked[marketContractAddress][msg.sender] = lockedBalance;
        UpdatedUserLockedBalance(marketContractAddress, msg.sender, lockedBalance);
    }

    /// @notice allows user to unlock tokens previously allocated to trading a MarketContract
    /// @param marketContractAddress address of the MarketContract
    /// @param qtyToUnlock desired qty of tokens to unlock
    function unlockTokens(address marketContractAddress, uint qtyToUnlock) external {
        uint256 balanceAfterUnLock = contractAddressToUserAddressToQtyLocked[marketContractAddress][msg.sender].sub(
            qtyToUnlock
        );  // no need to check balance, sub() will ensure sufficient balance to unlock!
        contractAddressToUserAddressToQtyLocked[marketContractAddress][msg.sender] = balanceAfterUnLock;        // update balance before external call!
        transferLockedTokensBackToUser(qtyToUnlock);
        UpdatedUserLockedBalance(marketContractAddress, msg.sender, balanceAfterUnLock);
    }

    /// @notice get the currently locked balance for a user given the specific contract address
    /// @param marketContractAddress address of the MarketContract
    /// @param userAddress address of the user
    /// @return the locked balance
    function getLockedBalanceForUser(address marketContractAddress, address userAddress) external view returns (uint) {
        return contractAddressToUserAddressToQtyLocked[marketContractAddress][userAddress];
    }

    /*
    // EXTERNAL - ONLY CREATOR  METHODS
    */

    /// @notice allows the creator to set the qty each user address needs to lock in
    /// order to trade a given MarketContract
    /// @param qtyToLock qty needed to enable trading
    function setLockQtyToAllowTrading(uint qtyToLock) external onlyCreator {
        lockQtyToAllowTrading = qtyToLock;
    }

    /// @notice allows the creator to set minimum balance a user must have in order to create MarketContracts
    /// @param minBalance balance to enable contract creation
    function setMinBalanceForContractCreation(uint minBalance) external onlyCreator {
        minBalanceToAllowContractCreation = minBalance;
    }

    /*
    // PRIVATE METHODS
    */

    /// @dev returns locked balance from this contract to the user's balance
    /// @param qtyToUnlock qty to return to user's balance
    function transferLockedTokensBackToUser(uint qtyToUnlock) private {
        balances[this] = balances[this].sub(qtyToUnlock);
        balances[msg.sender] = balances[msg.sender].add(qtyToUnlock);
        Transfer(this, msg.sender, qtyToUnlock);
    }

}
