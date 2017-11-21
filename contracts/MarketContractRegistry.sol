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

import "zeppelin-solidity/contracts/ownership/Ownable.sol";


contract MarketContractRegistry is Ownable {

    mapping(address => bool) isWhiteListed; // by default currently all contracts are whitelisted
    address[] deployedAddresses;            // record of all deployed addresses;

    function MarketContractRegistry() public {

    }

    /// @notice determines if an address is a valid MarketContract
    /// @return false if the address has not been deployed by this factory, or is no longer white listed.
    function isAddressWhiteListed(address contractAddress) external view returns (bool) {
        return isWhiteListed[contractAddress];
    }

    /// @notice the current number of contracts that have been deployed by this factory.
    function getDeployedAddressesLength() external view returns (uint) {
        return deployedAddresses.length;
    }

    /// @notice allows user to get all addresses currently available from this factory
    /// @param index of the deployed contract to return the address
    /// @return address of a white listed contract, or if contract is no longer valid address(0) is returned.
    function getAddressByIndex(uint index) external view returns (address) {
        address deployedAddress = deployedAddresses[index];
        if (isWhiteListed[deployedAddress]) {
            return deployedAddress;
        } else {
            return address(0);
        }
    }

    /// @dev allows for the owner to remove a white listed contract, eventually ownership could transition to
    /// a decentralized smart contract of community members to vote
    /// @param contractAddress contract to removed from white list
    function removeContractFromWhiteList(address contractAddress) external onlyOwner returns (bool) {
        isWhiteListed[contractAddress] = false;
    }

    /// @dev allows for the owner to add a white listed contract, eventually ownership could transition to
    /// a decentralized smart contract of community members to vote
    /// @param contractAddress contract to removed from white list
    function addAddressToWhiteList(address contractAddress) external onlyOwner {
        require(!isWhiteListed[contractAddress]);
        isWhiteListed[contractAddress] = true;
        deployedAddresses.push(contractAddress);
    }
}
