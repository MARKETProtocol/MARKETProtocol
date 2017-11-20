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


// Contract creators may be rewarded in the future with bounties or other special privileges.  Additionally
// creators may need to supply some needed gas reserves for the contract in order to facilitate settlement
// which could be recouped from contract participants upon settlement.
contract Creatable {

    address public creator;

    function Creatable() public {
        creator = msg.sender;
    }

    event CreatorTransferred(address indexed currentCreator, address indexed newCreator);

    function transferCreator(address newCreator) onlyCreator public {
        require(newCreator != address(0));
        CreatorTransferred(creator, newCreator);
        creator = newCreator;
    }

    modifier onlyCreator() {
        require(msg.sender == creator);
        _;
    }
}

