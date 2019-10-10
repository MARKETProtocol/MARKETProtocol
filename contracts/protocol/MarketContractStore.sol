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
        address feeStrategyAddress;
        address longTokenAddress;
        address settlementStrategyAddress;
        address shortTokenAddress;

        uint collateralPerUnit;          // required collateral amount for the full range of outcome tokens
        uint quantityMultiplier;         // multiplier corresponding to the value of 1 increment in price to token base units
        uint priceCap;
        uint priceFloor;
        uint priceDecimals;
    }
    
    mapping(address => ContractPermissions) private contractPermissions;
    mapping(address => ContractSettings) private contractSettings;
    mapping(address => string) private contractStates;     // created -> published -> settled -> finalized

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
        address collateralPoolAddress,
        address collateralTokenAddress,
        address feeStrategyAddress,
        address longTokenAddress,
        address owner,
        address settler,
        address settlementStrategyAddress,
        address shortTokenAddress,

        uint quantityMultiplier,
        uint priceCap,
        uint priceFloor,
        uint priceDecimals
    )
        external
        notRegistered(msg.sender)
    {
        contracts[msg.sender] = true;
        owners[owner] = true;
        ownerContracts[owner].push(msg.sender);
        
        contractPermissions[msg.sender] = ContractPermissions(owner, owner, settler);

        contractSettings[msg.sender] = ContractSettings(
            collateralPoolAddress,
            collateralTokenAddress,
            feeStrategyAddress,
            longTokenAddress,
            settlementStrategyAddress,
            shortTokenAddress,

            MathLib.calculateTotalCollateral(priceFloor, priceCap, quantityMultiplier), // collateralPerUnit
            quantityMultiplier,
            priceCap,
            priceFloor,
            priceDecimals
        );

        contractStates[msg.sender] = "created";
    }

    // External functions that are view
    // ...
    function state(address contractAddress) external view isRegistered(contractAddress) returns (string memory) {
        return contractStates[contractAddress];
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