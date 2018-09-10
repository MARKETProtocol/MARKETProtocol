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

pragma solidity ^0.4.24;

import "openzeppelin-solidity/contracts/ownership/Ownable.sol";

/// @title OracleHub - a base class of our hubs that creates the needed logic from our MarketContracts to interact
/// with our Oracle providers.  Eventually this could replace the need for the inheritance structure currently employed
/// in our MarketContracts since all abstraction of different providers could be done in contracts inheriting from this
/// class.
/// @author Phil Elsasser <phil@marketprotocol.io>
contract OracleHub is Ownable {

}
