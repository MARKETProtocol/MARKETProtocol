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

import "./MarketContractOraclize.sol";



/// @title Testable version of MarketContractOraclize that exposes a function to manually update last price.
/// This is deployed to the test network in place of the actual MarketContractOraclize
/// @author Perfect Makanju <root@perfect.engineering>
contract TestableMarketContractOraclize is MarketContractOraclize {

    /// @param contractName viewable name of this contract (BTC/ETH, LTC/ETH, etc)
    /// @param creatorAddress address of the person creating the contract
    /// @param marketTokenAddress address of our member token
    /// @param baseTokenAddress address of the ERC20 token that will be used for collateral and pricing
    /// @param contractSpecs array of unsigned integers including:
    /// floorPrice minimum tradeable price of this contract, contract enters settlement if breached
    /// capPrice maximum tradeable price of this contract, contract enters settlement if breached
    /// priceDecimalPlaces number of decimal places to convert our queried price from a floating point to
    /// an integer
    /// qtyMultiplier multiply traded qty by this value from base units of collateral token.
    /// expirationTimeStamp - seconds from epoch that this contract expires and enters settlement
    /// @param oracleDataSource a data-source such as "URL", "WolframAlpha", "IPFS"dv
    /// see http://docs.oraclize.it/#ethereum-quick-start-simple-query
    /// @param oracleQuery see http://docs.oraclize.it/#ethereum-quick-start-simple-query for examples
    constructor(
        string contractName,
        address creatorAddress,
        address marketTokenAddress,
        address baseTokenAddress,
        uint[5] contractSpecs,
        string oracleDataSource,
        string oracleQuery
    ) MarketContractOraclize(
        contractName,
        creatorAddress,
        marketTokenAddress,
        baseTokenAddress,
        contractSpecs,
        oracleDataSource,
        oracleQuery
    ) public payable
    { }

    /// @notice allows the creator of the contract to manually set a last price and check for settlement
    /// @param price lastPrice to be set
    function updateLastPrice(uint price) public {
        lastPrice = price;
        checkSettlement();
    }
}