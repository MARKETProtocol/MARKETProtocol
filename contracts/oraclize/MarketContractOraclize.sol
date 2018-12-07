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

/// @title MarketContract first example of a MarketProtocol contract using Oraclize services
/// @author Phil Elsasser <phil@marketprotocol.io>
contract MarketContractOraclize is MarketContract {

    // constants
    string public ORACLE_DATA_SOURCE;
    string public ORACLE_QUERY;
    address public ORACLE_HUB_ADDRESS;

    /// @param contractName viewable name of this contract (BTC/ETH, LTC/ETH, etc)
    /// @param baseAddresses array of 2 addresses needed for our contract including:
    ///     creatorAddress                  address of the person creating the contract
    ///     collateralTokenAddress          address of the ERC20 token that will be used for collateral and pricing
    /// @param oracleHubAddress     address of our oracle hub providing the callbacks
    /// @param contractSpecs array of unsigned integers including:
    ///     floorPrice              minimum tradeable price of this contract, contract enters settlement if breached
    ///     capPrice                maximum tradeable price of this contract, contract enters settlement if breached
    ///     priceDecimalPlaces      number of decimal places to convert our queried price from a floating point to
    ///                             an integer
    ///     qtyMultiplier           multiply traded qty by this value from base units of collateral token.
    ///     expirationTimeStamp     seconds from epoch that this contract expires and enters settlement
    /// @param oracleDataSource a data-source such as "URL", "WolframAlpha", "IPFS"
    /// see http://docs.oraclize.it/#ethereum-quick-start-simple-query
    /// @param oracleQuery see http://docs.oraclize.it/#ethereum-quick-start-simple-query for examples
    constructor(
        string contractName,
        address[2] baseAddresses,
        address oracleHubAddress,
        uint[5] contractSpecs,
        string oracleDataSource,
        string oracleQuery
    ) MarketContract(
        contractName,
        baseAddresses,
        contractSpecs
    )  public
    {
        ORACLE_DATA_SOURCE = oracleDataSource;
        ORACLE_QUERY = oracleQuery;
        ORACLE_HUB_ADDRESS = oracleHubAddress;

        // Future timestamp must be within 60 days from now.
        // https://docs.oraclize.it/#ethereum-quick-start-schedule-a-query-in-the-future
        require(EXPIRATION - now <= 60 days);
    }


    /*
    // PUBLIC METHODS
    */

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
