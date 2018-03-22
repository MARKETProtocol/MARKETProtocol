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

pragma solidity ^0.4.18;

import "./oraclizeAPI.sol";
import "../libraries/MathLib.sol";
import "../MarketContract.sol";


/// @title MarketContract first example of a MarketProtocol contract using Oraclize services
/// @author Phil Elsasser <phil@marketprotocol.io>
contract MarketContractOraclize is MarketContract, usingOraclize {
    using MathLib for uint;

    // constants
    string public ORACLE_DATA_SOURCE;
    string public ORACLE_QUERY;
    uint constant public QUERY_CALLBACK_GAS = 150000;
    uint constant SECONDS_PER_SIXTY_DAYS = 60 * 60 * 24 * 60;
    //uint constant public QUERY_CALLBACK_GAS_PRICE = 20000000000 wei; // 20 gwei - need to make this dynamic!

    // state variables
    string public lastPriceQueryResult;
    mapping(bytes32 => bool) validQueryIDs;

    /// @param contractName viewable name of this contract (BTC/ETH, LTC/ETH, etc)
    /// @param marketTokenAddress address of our member token
    /// @param baseTokenAddress address of the ERC20 token that will be used for collateral and pricing
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
    function MarketContractOraclize(
        string contractName,
        address marketTokenAddress,
        address baseTokenAddress,
        uint[5] contractSpecs,
        string oracleDataSource,
        string oracleQuery
    ) MarketContract(
        contractName,
        marketTokenAddress,
        baseTokenAddress,
        contractSpecs
    )  public
    {
        oraclize_setProof(proofType_TLSNotary | proofStorage_IPFS);
        //oraclize_setCustomGasPrice(QUERY_CALLBACK_GAS_PRICE);  //TODO: allow this to be changed by creator.
        ORACLE_DATA_SOURCE = oracleDataSource;
        ORACLE_QUERY = oracleQuery;
        require(EXPIRATION > now);         // Require expiration time in the future.

        // Future timestamp must be within 60 days from now.
        // https://docs.oraclize.it/#ethereum-quick-start-schedule-a-query-in-the-future
        require(EXPIRATION - now <= SECONDS_PER_SIXTY_DAYS);
        queryOracle();                      // Schedule a call to oracle at contract expiration time.
    }

    /// @notice allows a user to request an extra query to oracle in order to push the contract into
    /// settlement.  A user may call this as many times as they like, since they are the ones paying for
    /// the call to our oracle and post processing. This is useful for both a failsafe and as a way to
    /// settle a contract early if a price cap or floor has been breached.
    function requestEarlySettlement() external payable {
        uint cost = oraclize_getPrice(ORACLE_DATA_SOURCE, QUERY_CALLBACK_GAS);
        require(msg.value >= cost); // user must pay enough to cover query and callback
        // create immediate query, we must make sure to store this one separately, so
        // we do not schedule recursive callbacks when the query completes.
        bytes32 queryId = oraclize_query(
            ORACLE_DATA_SOURCE,
            ORACLE_QUERY,
            QUERY_CALLBACK_GAS
        );
        validQueryIDs[queryId] = true;
    }

    /*
    // PUBLIC METHODS
    */

    /// @notice only public for callbacks from oraclize, do not call
    /// @param queryID of the returning query, this should match our own internal mapping
    /// @param result query to be processed
    /// @param proof result proof
    function __callback(bytes32 queryID, string result, bytes proof) public {
        require(msg.sender == oraclize_cbAddress());
        require(validQueryIDs[queryID]);  // At expiration or early settlement.
        lastPriceQueryResult = result;
        lastPrice = parseInt(result, PRICE_DECIMAL_PLACES);
        UpdatedLastPrice(result);
        checkSettlement();  // Verify settlement at expiration or requested early settlement.
        delete validQueryIDs[queryID];
    }

    /*
    // PRIVATE METHODS
    */

    /// @dev call to oraclize to set up our query and record its hash.
    function queryOracle() private {
        // Require that sufficient funds are available to pay for the query.
        // require(oraclize_getPrice(ORACLE_DATA_SOURCE, QUERY_CALLBACK_GAS) < this.balance);
        // NOTE: Currently the first oracle query call to oraclize.it is free. Since our
        // expiration query will always be the first, there is no needed pre-funding amount
        // to create this query.  When we go to the centralized query hub - this will change
        // due to the fact that the address creating the query will always be the query hub.
        // will have to do the analysis to see which is cheaper, free queries, or lower deployment
        // gas costs
        bytes32 queryId = oraclize_query(
            EXPIRATION,
            ORACLE_DATA_SOURCE,
            ORACLE_QUERY,
            QUERY_CALLBACK_GAS
        );
        validQueryIDs[queryId] = true;
    }
}