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

import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "./MarketContractRegistryInterface.sol";


/// @title MarketContractRegistry
/// @author Phil Elsasser <phil@marketprotocol.io>
contract MarketContractRegistry is Ownable, MarketContractRegistryInterface {

    // whitelist accounting
    mapping(address => bool) public isWhiteListed;
    address[] public addressWhiteList;                             // record of currently deployed addresses;
    mapping(address => bool) public factoryAddressWhiteList;       // record of authorized factories

    // events
    event AddressAddedToWhitelist(address indexed contractAddress);
    event AddressRemovedFromWhitelist(address indexed contractAddress);
    event FactoryAddressAdded(address indexed factoryAddress);
    event FactoryAddressRemoved(address indexed factoryAddress);

    /*
    // External Methods
    */

    /// @notice determines if an address is a valid MarketContract
    /// @return false if the address is not white listed.
    function isAddressWhiteListed(address contractAddress) external view returns (bool) {
        return isWhiteListed[contractAddress];
    }

    /// @notice all currently whitelisted addresses
    /// returns array of addresses
    function getAddressWhiteList() external view returns (address[] memory) {
        return addressWhiteList;
    }

    /// @dev allows for the owner to remove a white listed contract, eventually ownership could transition to
    /// a decentralized smart contract of community members to vote
    /// @param contractAddress contract to removed from white list
    /// @param whiteListIndex of the contractAddress in the addressWhiteList to be removed.
    function removeContractFromWhiteList(
        address contractAddress,
        uint whiteListIndex
    ) external onlyOwner
    {
        require(isWhiteListed[contractAddress], "can only remove whitelisted addresses");
        require(addressWhiteList[whiteListIndex] == contractAddress, "index does not match address");
        isWhiteListed[contractAddress] = false;

        // push the last item in array to replace the address we are removing and then trim the array.
        addressWhiteList[whiteListIndex] = addressWhiteList[addressWhiteList.length - 1];
        addressWhiteList.length -= 1;
        emit AddressRemovedFromWhitelist(contractAddress);
    }

    /// @dev allows for the owner or factory to add a white listed contract, eventually ownership could transition to
    /// a decentralized smart contract of community members to vote
    /// @param contractAddress contract to removed from white list
    function addAddressToWhiteList(address contractAddress) external {
        require(isOwner() || factoryAddressWhiteList[msg.sender], "Can only be added by factory or owner");
        require(!isWhiteListed[contractAddress], "Address must not be whitelisted");
        isWhiteListed[contractAddress] = true;
        addressWhiteList.push(contractAddress);
        emit AddressAddedToWhitelist(contractAddress);
    }

    /// @dev allows for the owner to add a new address of a factory responsible for creating new market contracts
    /// @param factoryAddress address of factory to be allowed to add contracts to whitelist
    function addFactoryAddress(address factoryAddress) external onlyOwner {
        require(!factoryAddressWhiteList[factoryAddress], "address already added");
        factoryAddressWhiteList[factoryAddress] = true;
        emit FactoryAddressAdded(factoryAddress);
    }

    /// @dev allows for the owner to remove an address of a factory
    /// @param factoryAddress address of factory to be removed
    function removeFactoryAddress(address factoryAddress) external onlyOwner {
        require(factoryAddressWhiteList[factoryAddress], "factory address is not in the white list");
        factoryAddressWhiteList[factoryAddress] = false;
        emit FactoryAddressRemoved(factoryAddress);
    }
}
