/*
    Copyright 2017-2018 Phillip A. Elsasser

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

pragma solidity ^0.4.23;

import "./UpgradeableTarget.sol";
import "zeppelin-solidity/contracts/token/ERC20/BurnableToken.sol";
import "zeppelin-solidity/contracts/ownership/Ownable.sol";
import "zeppelin-solidity/contracts/token/ERC20/StandardToken.sol";


/// @title Upgradeable Token
/// @notice allows for us to update some of the needed functionality in our tokens post deployment. Inspiration taken
/// from Golems migrate functionality.
/// @author Phil Elsasser <phil@marketprotocol.io>
contract UpgradeableToken is Ownable, BurnableToken, StandardToken {

    address public upgradeableTarget;       // contract address handling upgrade
    uint256 public totalUpgraded;           // total token amount already upgraded

    event Upgraded(address indexed from, address indexed to, uint256 value);

    /*
    // EXTERNAL METHODS - TOKEN UPGRADE SUPPORT
    */

    /// @notice Update token to the new upgraded token
    /// @param value The amount of token to be migrated to upgraded token
    function upgrade(uint256 value) external {
        require(upgradeableTarget != address(0));

        burn(value);                    // burn tokens as we migrate them.
        totalUpgraded = totalUpgraded.add(value);

        UpgradeableTarget(upgradeableTarget).upgradeFrom(msg.sender, value);
        Upgraded(msg.sender, upgradeableTarget, value);
    }

    /// @notice Set address of upgrade target process.
    /// @param upgradeAddress The address of the UpgradeableTarget contract.
    function setUpgradeableTarget(address upgradeAddress) external onlyOwner {
        upgradeableTarget = upgradeAddress;
    }

}