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

import "./MarketContractChainLink.sol";
import "./OracleHubChainLink.sol";
import "../factories/MarketCollateralPoolFactoryInterface.sol";
import "../MarketContractRegistryInterface.sol";


contract MarketContractFactoryChainLink is Ownable {

    address public marketContractRegistry;
    address public collateralPoolFactoryAddress;
    address public oracleHubAddress;

    address public MKT_TOKEN_ADDRESS;


    event MarketContractCreated(address indexed creator, address indexed contractAddress);

    constructor(
        address registryAddress,
        address mktTokenAddress,
        address marketCollateralPoolFactoryAddress
    ) public {
        marketContractRegistry = registryAddress;
        MKT_TOKEN_ADDRESS = mktTokenAddress;
        collateralPoolFactoryAddress = marketCollateralPoolFactoryAddress;
    }

    function deployMarketContractChainLink(
        string contractName,
        address collateralTokenAddress,
        uint[5] contractSpecs,
        string oracleQueryURL,
        string oracleQueryPath
    ) external
    {
        MarketContractChainLink mktContract = new MarketContractChainLink(
            contractName,
            [msg.sender, MKT_TOKEN_ADDRESS, collateralTokenAddress, collateralPoolFactoryAddress],
            oracleHubAddress,
            contractSpecs,
            oracleQueryURL,
            oracleQueryPath
        );

        OracleHubChainLink(oracleHubAddress).requestQuery(oracleQueryURL, oracleQueryPath);
        MarketContractRegistryInterface(marketContractRegistry).addAddressToWhiteList(mktContract);
        emit MarketContractCreated(msg.sender, mktContract);
    }

    /// @dev allows for the owner to set the desired registry for contract creation.
    /// @param registryAddress desired registry address.
    function setRegistryAddress(address registryAddress) external onlyOwner {
        require(registryAddress != address(0));
        marketContractRegistry = registryAddress;
    }

    function setOracleHubAddress(address hubAddress) external onlyOwner {
        require(hubAddress != address(0));
        oracleHubAddress = hubAddress;
    }
}
