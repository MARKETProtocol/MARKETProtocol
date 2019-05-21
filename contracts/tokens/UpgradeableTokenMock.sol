/*
    Copyright 2017-2019 Phillip A. Elsasser

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

pragma solidity 0.5.2;

import "./UpgradeableTarget.sol";
import "./UpgradableToken.sol";


/// @title Upgradeable Token Mock for testing only.
/// @notice A token to be able to test upgrade from another token
/// @author Phil Elsasser <phil@marketprotocol.io>
contract UpgradeableTokenMock is UpgradeableToken, UpgradeableTarget {

    address public PREVIOUS_TOKEN_ADDRESS;

    constructor(address previousTokenAddress) public {
        PREVIOUS_TOKEN_ADDRESS = previousTokenAddress;
    }

    /*
    // EXTERNAL METHODS - TOKEN UPGRADE SUPPORT
    */
    function upgradeFrom(address from, uint256 value) external {
        require(msg.sender == PREVIOUS_TOKEN_ADDRESS, "Can only be called by PREVIOUS_TOKEN_ADDRESS");    // this can only be called from the  previous token!
        _mint(from, value);
    }
}
