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

pragma solidity 0.5.11;

import "./MathLib.sol";

contract MarketContractStore {
    struct ContractPermissions {
        address arbitrator;
        address owner;
        address settler;
    }
    
    struct ContractSettings {
        address collateralPoolAddress;
        address collateralTokenAddress;
        address longTokenAddress;
        address shortTokenAddress;

        uint8 priceDecimals;

        uint collateralPerUnit;          // required collateral amount for the full range of outcome tokens
        uint quantityMultiplier;         // multiplier corresponding to the value of 1 increment in price to token base units
        uint priceCap;
        uint priceFloor;
    }
    
    mapping(address => ContractPermissions) private contractPermissions;
    mapping(address => ContractSettings) private contractSettings;
    mapping(address => uint8) private contractStates;      // created 0 -> published 50 -> settled 100 -> finalized 150

    mapping(address => bool) private contracts;            // record of registered contract addresses
    mapping(address => bool) private owners;               // record of registered owner addresses
    mapping(address => address[]) private ownerContracts;  // record of owned contracts

    // Modifiers

    modifier isRegistered(address addy) {
        require(contracts[addy], "Contract is not registered");
        _;
    }
    
    modifier notRegistered(address addy) {
        require(!contracts[addy], "Contract is already registered");
        _;
    }

    // External functions
    // ...
    function register(
        address arbitrator,
        address collateralPoolAddress,
        address collateralTokenAddress,
        address longTokenAddress,
        address owner,
        address settler,
        address shortTokenAddress,

        uint8 priceDecimals,

        uint quantityMultiplier,
        uint priceCap,
        uint priceFloor
    )
        external
        notRegistered(msg.sender)
    {
        contracts[msg.sender] = true;
        owners[owner] = true;
        ownerContracts[owner].push(msg.sender);
        
        contractPermissions[msg.sender] = ContractPermissions(arbitrator, owner, settler);

        contractSettings[msg.sender] = ContractSettings(
            collateralPoolAddress,
            collateralTokenAddress,
            longTokenAddress,
            shortTokenAddress,

            priceDecimals,

            MathLib.calculateTotalCollateral(priceFloor, priceCap, quantityMultiplier), // collateralPerUnit
            quantityMultiplier,
            priceCap,
            priceFloor
        );

        contractStates[msg.sender] = 0;
    }
    
    function setState(uint8 state) external isRegistered(msg.sender) {
        contractStates[msg.sender] = state;
    }
    
    // External functions that are view

    function arbitrator() external view isRegistered(msg.sender) returns (address) {
        return contractPermissions[msg.sender].arbitrator;
    }

    function owner() external view isRegistered(msg.sender) returns (address) {
        return contractPermissions[msg.sender].owner;
    }

    function settler() external view isRegistered(msg.sender) returns (address) {
        return contractPermissions[msg.sender].settler;
    }

    function state() external view isRegistered(msg.sender) returns (uint8) {
        return contractStates[msg.sender];
    }

    // External functions that are pure
    // ...

    // Public functions
    // ...

    // Internal functions
    // ...

    // Private functions
    // ...

}