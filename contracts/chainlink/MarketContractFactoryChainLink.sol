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
import "../MarketContractRegistryInterface.sol";
import "../tokens/MarketToken.sol";


contract MarketContractFactoryChainLink is Ownable {

    address public marketContractRegistry;
    address public oracleHubAddress;

    address public MKT_TOKEN_ADDRESS;
    MarketToken public MKT_TOKEN;

    event MarketContractCreated(address indexed creator, address indexed contractAddress);

    constructor(
        address registryAddress,
        address mktTokenAddress
    ) public {
        marketContractRegistry = registryAddress;
        MKT_TOKEN_ADDRESS = mktTokenAddress;
        MKT_TOKEN = MarketToken(mktTokenAddress);
    }

    /// @param contractName viewable name of this contract (BTC/ETH, LTC/ETH, etc)
    /// @param collateralTokenAddress address of the ERC20 token that will be used for collateral and pricing
    /// @param contractSpecs array of unsigned integers including:
    ///     floorPrice          minimum tradeable price of this contract, contract enters settlement if breached
    ///     capPrice            maximum tradeable price of this contract, contract enters settlement if breached
    ///     priceDecimalPlaces  number of decimal places to convert our queried price from a floating point to
    ///                         an integer
    ///     qtyMultiplier       multiply traded qty by this value from base units of collateral token.
    ///     expirationTimeStamp seconds from epoch that this contract expires and enters settlement
    /// @param oracleQueryURL   URL of rest end point for data IE 'https://api.kraken.com/0/public/Ticker?pair=ETHUSD'
    /// @param oracleQueryPath  path of data inside json object. IE 'result.XETHZUSD.c.0'
    /// @param sleepJobId  ChainLink job id with their sleep adapter
    /// @param onDemandJobId  ChainLink job id for on demand user queries
    function deployMarketContractChainLink(
        string contractName,
        address collateralTokenAddress,
        uint[5] contractSpecs,
        string oracleQueryURL,
        string oracleQueryPath,
        bytes32 sleepJobId,
        bytes32 onDemandJobId
    ) external
    {
        require(MKT_TOKEN.isBalanceSufficientForContractCreation(msg.sender));    // creator must be MKT holder

        MarketContractChainLink mktContract = new MarketContractChainLink(
            contractName,
            [
                msg.sender,
                collateralTokenAddress
            ],
            oracleHubAddress,
            contractSpecs,
            oracleQueryURL,
            oracleQueryPath
        );

        OracleHubChainLink(oracleHubAddress).requestQuery(
            mktContract,
            oracleQueryURL,
            oracleQueryPath,
            sleepJobId,
            onDemandJobId
        );

        MarketContractRegistryInterface(marketContractRegistry).addAddressToWhiteList(mktContract);
        emit MarketContractCreated(msg.sender, mktContract);
    }

    /// @dev allows for the owner to set the desired registry for contract creation.
    /// @param registryAddress desired registry address.
    function setRegistryAddress(address registryAddress) external onlyOwner {
        require(registryAddress != address(0));
        marketContractRegistry = registryAddress;
    }

    /// @dev allows for the owner to set a new oracle hub address which is responsible for providing data to our
    /// contracts
    /// @param hubAddress   address of the oracle hub, cannot be null address
    function setOracleHubAddress(address hubAddress) external onlyOwner {
        require(hubAddress != address(0));
        oracleHubAddress = hubAddress;
    }
}
