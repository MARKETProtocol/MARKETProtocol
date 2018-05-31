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

import "./TestableMarketContractOraclize.sol";
//import "../MarketContractRegistryInterface.sol";

import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "../factories/MarketCollateralPoolFactoryInterface.sol";

/// @title TestableMarketContractFactoryOraclize
/// @author Phil Elsasser <phil@marketprotocol.io>
contract TestableMarketContractFactoryOraclize is Ownable {

    address public marketContractRegistry;
    address public collateralPoolFactoryAddress;
    address public MKT_TOKEN_ADDRESS;

    event MarketContractCreated(address indexed contractAddress);

    /// @dev deploys our factory and ties it the a supply registry address
    /// @param registryAddress - MarketContractRegistry address to whitelist contracts
    /// @param marketCollateralPoolFactoryAddress - MarketContractRegistry address to whitelist contracts
    /// @param mktTokenAddress - MARKET Token address
    constructor(address registryAddress, address mktTokenAddress, address marketCollateralPoolFactoryAddress) public {
        marketContractRegistry = registryAddress;
        MKT_TOKEN_ADDRESS = mktTokenAddress;
        collateralPoolFactoryAddress = marketCollateralPoolFactoryAddress;
    }

    /// @dev Deploys a new instance of a market contract and adds it to the whitelist.
    /// @param contractName viewable name of this contract (BTC/ETH, LTC/ETH, etc)
    /// @param collateralTokenAddress address of the ERC20 token that will be used for collateral and pricing
    /// @param contractSpecs array of unsigned integers including:
    /// floorPrice minimum tradeable price of this contract, contract enters settlement if breached
    /// capPrice maximum tradeable price of this contract, contract enters settlement if breached
    /// priceDecimalPlaces number of decimal places to convert our queried price from a floating point to
    /// an integer
    /// qtyMultiplier multiply traded qty by this value from base units of collateral token.
    /// expirationTimeStamp - seconds from epoch that this contract expires and enters settlement
    /// @param oracleDataSource a data-source such as "URL", "WolframAlpha", "IPFS"
    /// see http://docs.oraclize.it/#ethereum-quick-start-simple-query
    /// @param oracleQuery see http://docs.oraclize.it/#ethereum-quick-start-simple-query for examples
    function deployMarketContractOraclize(
        string contractName,
        address collateralTokenAddress,
        uint[5] contractSpecs,
        string oracleDataSource,
        string oracleQuery
    ) external
    {
        MarketContractOraclize mktContract = new TestableMarketContractOraclize(
            contractName,
            msg.sender,
            MKT_TOKEN_ADDRESS,
            collateralTokenAddress,
            contractSpecs,
            oracleDataSource,
            oracleQuery
        );
        emit MarketContractCreated(address(mktContract));
    }

    function deployMarketCollateralPool(address mktContractAddress) external {
        MarketCollateralPoolFactoryInterface collateralPoolFactory = MarketCollateralPoolFactoryInterface(collateralPoolFactoryAddress);
        collateralPoolFactory.deployMarketCollateralPool(mktContractAddress);
        address newAddress = collateralPoolFactory.getCollateralPoolAddress(mktContractAddress);
        require(newAddress != address(0));
        //MarketContractOraclize(mktContractAddress).setCollateralPoolContractAddress(newAddress);
        //MarketContractRegistryInterface(marketContractRegistry).addAddressToWhiteList(mktContractAddress);
    }

    /// @dev allows for the owner to set the desired registry for contract creation.
    /// @param registryAddress desired registry address.
    function setRegistryAddress(address registryAddress) external onlyOwner {
        require(registryAddress != address(0));
        marketContractRegistry = registryAddress;
    }

    /// @dev allows for the owner to set switch out factories
    /// @param marketCollateralPoolFactoryAddress desired factory address.
    function setCollateralPoolFactoryAddress(address marketCollateralPoolFactoryAddress) external onlyOwner {
        require(marketCollateralPoolFactoryAddress != address(0));
        collateralPoolFactoryAddress = marketCollateralPoolFactoryAddress;
    }
}
