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

import "zeppelin-solidity/contracts/token/ERC20.sol";


/// @title Constant values defining all market contracts.
library ContractLib {

    struct ContractSpecs {
        string CONTRACT_NAME;
        address BASE_TOKEN_ADDRESS;
        ERC20 BASE_TOKEN;
        uint PRICE_CAP;
        uint PRICE_FLOOR;
        uint PRICE_DECIMAL_PLACES;   // how to convert the pricing from decimal format (if valid) to integer
        uint QTY_DECIMAL_PLACES;     // how many tradeable units make up a whole pricing increment
        uint EXPIRATION;
    }
}
