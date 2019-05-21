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

import "openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";


// dummy ERC20 token for testing purposes
contract CollateralToken is ERC20 {

    string public name;
    string public symbol;
    uint8 public decimals;


    /**
     * @dev Constructor that gives msg.sender all of existing tokens.
     */
    constructor(
        string memory tokenName,
        string memory tokenSymbol,
        uint256 initialSupply,
        uint8 tokenDecimals
    ) public
    {
        name = tokenName;
        symbol = tokenSymbol;
        decimals = tokenDecimals;
        _mint(msg.sender, initialSupply * 10**uint(decimals));
    }
}
