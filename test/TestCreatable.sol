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

import "truffle/Assert.sol";
import "../contracts/Creatable.sol";


/// @title TestCreatable
/// @author Phil Elsasser <phil@marketprotcol.io>
contract TestCreatable {

    function testTransferCreator() public {
        Creatable creatable = new Creatable();
        Assert.equal(
            address(this),
            creatable.creator(),
            "contract creator isn't test contract"
        );

        creatable.transferCreator(address(creatable));

        Assert.equal(
            address(creatable),
            creatable.creator(),
            "contract creator isn't itself after setting"
        );

        Assert.isFalse(
            address(creatable) == address(this),
            "Addresses of contracts are equal, test not working"
        );
    }

    function shouldThrowOnAttemptToTransferToNullAddress() private {
        Creatable creatable = new Creatable();
        creatable.transferCreator(address(0));
    }

    function testThrowOnTransferToNullAddress() public {
        bool result = address(this).call(bytes4(keccak256("shouldThrowOnAttemptToTransferToNullAddress()")));
        Assert.isFalse(result, "Should require address not to be null address");
    }

    function shouldThrowOnAttemptToTransferWhenNotOwner() private {
        Creatable creatable = new Creatable();
        creatable.transferCreator(address(creatable));
        creatable.transferCreator(address(this)); // should fail since we are no longer creator!
    }

    function testThrowOnTransferWhenNotCreator() public {
        bool result = address(this).call(bytes4(keccak256("shouldThrowOnAttemptToTransferWhenNotOwner()")));
        Assert.isFalse(result, "Able to transfer creator when not creator!");
    }
}
