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

import "truffle/Assert.sol";
import "../../contracts/libraries/OrderLib.sol";

/// @title TestOrderLib tests for all of our order helper functions
/// @author Phil Elsasser <phil@marketprotcol.io>
contract TestOrderLib {
    address private MAKER = 0x627306090abaB3A6e1400e9345bC60c78a8BEf57;
    address private TAKER = 0xf17f52151EbEF6C7334FAD080c5704D77216b732;
    address private FEE_RECIPIENT = 0xC5fdf4076b8F3A5357c5E395ab970B5B54098Fef;
    address private OUTSIDE_ADDRESS = 0x2191eF87E392377ec08E7c08Eb105Ef5448eCED5;  //used as check
}
