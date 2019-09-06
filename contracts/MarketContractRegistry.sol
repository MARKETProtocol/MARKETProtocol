/*
    Copyright 2017-2019 MARKET Protocol

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
/// @author MARKET Protocol <support@marketprotocol.io>
contract MarketContractRegistry is Ownable, MarketContractRegistryInterface {
    mapping(address => bool) private registered;       // record of registered addresses
    mapping(address => bool) private whitelist;        // record of whitelist
    mapping(address => address[]) private ownerStore;  // record of owned contracts

    // events

    event OwnerContractAdded(address ownerAddress, address contractAddress);
    event FactoryAddressAdded(address indexed factoryAddress);
    event FactoryAddressRemoved(address indexed factoryAddress);

    // modifiers

    modifier isRegistered(address addy) {
        require(registered[addy], "Address is not registered");
        _;
    }

    modifier notRegistered(address addy) {
        require(!registered[addy], "Address is already registered");
        _;
    }

    modifier onlyFactoryOrOwner(address ownerAddress) {
        require(isOwner() || whitelist[msg.sender], "Can only be added by a whitelisted factory or owner");
        _;
    }

    /*
    // External Methods
    */

    /// @dev allows for the owner to add a new address of a factory responsible for creating new market contracts
    /// @param factoryAddress address of factory to be allowed to add contracts to whitelist
    function addFactoryAddress(address factoryAddress) public onlyOwner notRegistered(factoryAddress) {
        registered[factoryAddress] = true;
        whitelist[factoryAddress] = true;
        emit FactoryAddressAdded(factoryAddress);
    }

    /// @dev tracks the owner of a contract so that contracts can be looked up by owner
    /// @param ownerAddress address of the owner wallet
    /// @param contractAddress address of the contract
    function addOwnerContract(address ownerAddress, address contractAddress) public onlyFactoryOrOwner(ownerAddress) notRegistered(contractAddress) {
        registered[contractAddress] = true;
        ownerStore[ownerAddress].push(contractAddress);
        emit OwnerContractAdded(ownerAddress, contractAddress);
    }

    /// @notice all contracts owned by owner
    /// returns array of addresses
    function getOwnerList(address ownerAddress) public view returns (address[] memory) {
        return ownerStore[ownerAddress];
    }

    /// @notice determines if an address is a valid MarketContract
    /// @return false if the address is not white listed.
    function isAddressWhiteListed(address contractAddress) public view returns (bool) {
        return whitelist[contractAddress];
    }


    /// @dev allows for the owner to remove an address of a factory
    /// @param factoryAddress address of factory to be removed
    function removeFactoryAddress(address factoryAddress) public onlyOwner isRegistered(factoryAddress) {
        registered[factoryAddress] = false;
        whitelist[factoryAddress] = false;
        emit FactoryAddressRemoved(factoryAddress);
    }
}

