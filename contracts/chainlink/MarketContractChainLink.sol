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


/// @title MarketContract first example of a MarketProtocol contract using ChainLink
/// @author Phil Elsasser <phil@marketprotocol.io>
contract MarketContractChainLink is MarketContract {

    // constants
    string public ORACLE_QUERY_URL;
    string public ORACLE_QUERY_PATH;
    address public ORACLE_HUB_ADDRESS;

    /// @param contractName viewable name of this contract (BTC/ETH, LTC/ETH, etc)
    /// @param baseAddresses array of 4 addresses needed for our contract including:
    ///     creatorAddress                  address of the person creating the contract
    ///     marketTokenAddress              address of our member token
    ///     collateralTokenAddress          address of the ERC20 token that will be used for collateral and pricing
    ///     collateralPoolFactoryAddress    address of the factory creating the collateral pools
    /// @param contractSpecs array of unsigned integers including:
    ///     floorPrice          minimum tradeable price of this contract, contract enters settlement if breached
    ///     capPrice            maximum tradeable price of this contract, contract enters settlement if breached
    ///     priceDecimalPlaces  number of decimal places to convert our queried price from a floating point to
    ///                         an integer
    ///     qtyMultiplier       multiply traded qty by this value from base units of collateral token.
    ///     expirationTimeStamp seconds from epoch that this contract expires and enters settlement
    /// @param oracleQueryURL   URL of rest end point for data IE 'https://api.kraken.com/0/public/Ticker?pair=ETHUSD'
    /// @param oracleQueryPath  path of data inside json object. IE 'result.XETHZUSD.c.0'
    constructor(
        string contractName,
        address[4] baseAddresses,
        address oracleHubAddress,
        uint[5] contractSpecs,
        string oracleQueryURL,
        string oracleQueryPath
    ) MarketContract(
        contractName,
        baseAddresses,
        contractSpecs
    )  public
    {
        ORACLE_QUERY_URL = oracleQueryURL;
        ORACLE_QUERY_PATH = oracleQueryPath;
        ORACLE_HUB_ADDRESS = oracleHubAddress;
    }

    /// @dev called only by our oracle hub when a new price is available provided by our oracle.
    /// @param price lastPrice provided by the oracle.
    function oracleCallBack(uint256 price) public onlyOracleHub {
        require(!isSettled);
        lastPrice = price;
        emit UpdatedLastPrice(price);
        checkSettlement();  // Verify settlement at expiration or requested early settlement.
    }

    /// @dev allows calls only from the oracle hub.
    modifier onlyOracleHub() {
        require(msg.sender == ORACLE_HUB_ADDRESS);
        _;
    }
}