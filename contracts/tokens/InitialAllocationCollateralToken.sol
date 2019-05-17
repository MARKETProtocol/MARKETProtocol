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

import "./CollateralToken.sol";


/// token with initial grant to all addresses
contract InitialAllocationCollateralToken is CollateralToken {

    uint256 public INITIAL_TOKEN_ALLOCATION;
    uint256 public totalTokenAllocationsRequested;
    mapping(address => bool) isInitialAllocationClaimed;

    event AllocationClaimed(address indexed claimeeAddress);

    /// @dev creates a token that allows for all addresses to retrieve an initial token allocation.
    constructor (
        string memory tokenName,
        string memory tokenSymbol,
        uint256 initialTokenAllocation,
        uint8 tokenDecimals
    ) public CollateralToken(
        tokenName,
        tokenSymbol,
        initialTokenAllocation,
        tokenDecimals
    ){
        INITIAL_TOKEN_ALLOCATION = initialTokenAllocation * (10 ** uint256(decimals));
    }

    /// @notice allows caller to claim a one time allocation of tokens.
    function getInitialAllocation() external {
        require(!isInitialAllocationClaimed[msg.sender]);
        isInitialAllocationClaimed[msg.sender] = true;
        _mint(msg.sender, INITIAL_TOKEN_ALLOCATION);
        totalTokenAllocationsRequested++;
        emit AllocationClaimed(msg.sender);
    }

    /// @notice check to see if an address has already claimed their initial allocation
    /// @param claimee address of the user claiming their tokens
    function isAllocationClaimed(address claimee) external view returns (bool) {
        return isInitialAllocationClaimed[claimee];
    }
}
