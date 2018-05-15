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


/// @title Linkable
/// @notice allows contracts to become linked together that are not directly created by one another for gas
/// constraints. Linking occurs at instantiation and then once linked there is no ability to change the linkedAddress
/// @author Phil Elsasser <phil@marketprotocol.io>
contract Linkable {

    address public linkedAddress;

    function Linkable(address addressToLink) public {
        require(addressToLink != address(0));
        linkedAddress = addressToLink;
    }

    modifier onlyLinked() {
        require(msg.sender == linkedAddress);
        _;
    }
}

