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

import "../MarketContract.sol";
import "../libraries/StringLib.sol";

/// @title MarketContract first example of a MarketProtocol contract using ChainLink
/// @author Phil Elsasser <phil@marketprotocol.io>
contract MarketContractChainLink is MarketContract, chainLinked {
    using StringLib for *;

    bytes32 internal requestId;
    bytes32 internal jobId;

    constructor(address _link, address _oracle, bytes32 _jobId) public {
        setLinkToken(_link);
        setOracle(_oracle);
        jobId = _jobId;
    }

    /// @param contractName viewable name of this contract (BTC/ETH, LTC/ETH, etc)
    /// @param creatorAddress address of the person creating the contract
    /// @param marketTokenAddress address of our member token
    /// @param collateralTokenAddress address of the ERC20 token that will be used for collateral and pricing
    /// @param collateralPoolFactoryAddress address of the factory creating the collateral pools
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
    constructor(
        string contractName,
        address creatorAddress,
        address marketTokenAddress,
        address collateralTokenAddress,
        address collateralPoolFactoryAddress,
        uint[5] contractSpecs,
        string oracleDataSource,
        string oracleQuery
    ) MarketContract(
        contractName,
        creatorAddress,
        marketTokenAddress,
        collateralTokenAddress,
        collateralPoolFactoryAddress,
        contractSpecs
    )  public
    {

    }


    function callback(bytes32 requestId, bytes32 price) public checkChainlinkFulfillment(requestId)
    {
        lastPriceQueryResult = price;
        lastPrice = price; //parseInt(result, PRICE_DECIMAL_PLACES);
        emit UpdatedLastPrice(price);
        checkSettlement();  // Verify settlement at expiration or requested early settlement.
    }

    function queryOracle(string _currency) public onlyOwner {
        ChainlinkLib.Run memory run = newRun(jobId, this, "callback(bytes32,bytes32)");
        run.add("url", "https://min-api.cryptocompare.com/data/price?fsym=ETH&tsyms=USD,EUR,JPY");
        string[] memory path = new string[](1);
        path[0] = _currency;
        run.addStringArray("path", path);
        run.addInt("times", 100);
        requestId = chainlinkRequest(run, LINK(1));
    }

}