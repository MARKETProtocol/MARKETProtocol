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
import "../libraries/MathLib.sol";
import "./TokenLockerInterface.sol";

import "zeppelin-solidity/contracts/token/ERC20.sol";
import "zeppelin-solidity/contracts/token/SafeERC20.sol";


contract TokenLocker is Creatable, TokenLockerInterface {
    using MathLib for uint;
    using SafeERC20 for ERC20;

    ERC20 LOCK_TOKEN;
    uint public lockQty;
    mapping(address => mapping(address => uint)) contractToUserAddressToQtyLocked;

    event UpdatedUserLockedBalance(address indexed contractAddress, address indexed userAddress, uint balance);

    function TokenLocker(address lockTokenAddress, uint qtyToLock) public {
        lockQty = qtyToLock;
        LOCK_TOKEN = ERC20(lockTokenAddress);
    }

    function setLockQty(uint qtyToLock) external onlyCreator {
        lockQty = qtyToLock;
    }

    function isUserLocked(address contractAddress, address userAddress) external view returns (bool) {
        return contractToUserAddressToQtyLocked[contractAddress][userAddress] >= lockQty;
    }

    function lockTokensForContractAddress(address contractAddress, uint qtyToLock) external {
        LOCK_TOKEN.safeTransferFrom(msg.sender, this, qtyToLock);
        uint256 lockedBalance = contractToUserAddressToQtyLocked[contractAddress][msg.sender].add(qtyToLock);
        contractToUserAddressToQtyLocked[contractAddress][msg.sender] = lockedBalance;
        UpdatedUserLockedBalance(contractAddress, msg.sender, lockedBalance);
    }

    function unlockTokens(address contractAddress, uint qtyToUnlock) external {
        require(contractToUserAddressToQtyLocked[contractAddress][msg.sender] >= qtyToUnlock);     // ensure sufficient balance
        uint256 balanceAfterUnLock = contractToUserAddressToQtyLocked[contractAddress][msg.sender].subtract(qtyToUnlock);
        contractToUserAddressToQtyLocked[contractAddress][msg.sender] = balanceAfterUnLock;        // update balance before external call!
        LOCK_TOKEN.safeTransfer(msg.sender, qtyToUnlock);
        UpdatedUserLockedBalance(contractAddress, msg.sender, balanceAfterUnLock);
    }
}
