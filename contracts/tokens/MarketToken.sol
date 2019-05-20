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

import "./UpgradableToken.sol";


/// @title Market Token
/// @notice Our membership token.  Users must lock tokens to enable trading for a given Market Contract
/// as well as have a minimum balance of tokens to create new Market Contracts.
/// @author Phil Elsasser <phil@marketprotocol.io>
contract MarketToken is UpgradeableToken {

    string public constant name = "MARKET Protocol Token";
    string public constant symbol = "MKT";
    uint8 public constant decimals = 18;

    uint public constant INITIAL_SUPPLY = 600000000 * 10**uint(decimals); // 600 million tokens with 18 decimals (6e+26)

    constructor() public {
        _mint(msg.sender, INITIAL_SUPPLY);
    }
}
