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

/// @title Upgradeable Target
/// @notice A contract (or a token itself) that can facilitate the upgrade from an existing deployed token
/// to allow us to upgrade our token's functionality.
/// @author Phil Elsasser <phil@marketprotocol.io>
contract UpgradeableTarget {
    function upgradeFrom(address from, uint256 value) external; // note: implementation should require(from == oldToken)
}