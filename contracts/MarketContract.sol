/*
    Copyright 2017 Phillip A. Elsasser

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

pragma solidity ^0.4.0;

import "Creatable.sol";
import "./Oraclize/oraclizeAPI.sol";

//TODO: fix style issues
//      add accounting for users and positions
//      how to hold ether for needed gas
//      how to hold collateral pool
//      adding failsafe for pool distribution.
contract MarketContract is Creatable, usingOraclize  {

    // constants
    string public CONTRACT_NAME;
    address public BASE_TOKEN;
    int public MAX_PRICE;
    int public MIN_PRICE;
    uint public PRICE_DECIMAL_PLACES;   // how to convert the pricing from decimal format (if valid) to integer
    uint public EXPIRATION;
    string public ORACLE_DATA_SOURCE;
    string public ORACLE_QUERY;
    uint public ORACLE_QUERY_REPEAT = 1 days;
    uint8 public BUY_SIDE = 0;
    uint8 public SELL_SIDE = 1;

    // state variables
    string public lastPriceQueryResult;
    int public lastPrice;
    bool public isExpired;
    mapping(bytes32 => bool) validQueryIDs;

    // how to map user to position?

    event NewOracleQuery(string description);
    event UpdatedLastPrice(string price);
    event ContractSettled();

    struct Order {
        address maker;
        address taker;
        uint qty;
        uint price;
        uint8 makerSide;
        uint expirationTimeStamp;
        bytes32 orderHash;
    }

    function MarketContract(
        string contractName,
        address baseToken,
        string oracleDataSource,
        string oracleQuery,
        int maxPrice,
        int minPrice,
        uint priceDecimalPlaces,
        uint daysToExpiration){

        require(maxPrice > minPrice);
        oraclize_setProof(proofType_TLSNotary | proofStorage_IPFS);
        CONTRACT_NAME = contractName;
        BASE_TOKEN = baseToken;
        MAX_PRICE = maxPrice;
        MIN_PRICE = minPrice;
        EXPIRATION = now + daysToExpiration * 1 days;
        ORACLE_DATA_SOURCE = oracleDataSource;
        ORACLE_QUERY = oracleQuery;
        queryOracle();  // schedules recursive calls to oracle
    }

    function __callback(bytes32 queryID, string result, bytes proof) {
        if (!validQueryIDs[queryID]) throw;
        if (msg.sender != oraclize_cbAddress()) throw;
        lastPriceQueryResult = result;
        lastPrice = parseInt(result, PRICE_DECIMAL_PLACES);
        UpdatedLastPrice(result);
        delete validQueryIDs[queryID];
        checkSettlement();
        if (!isExpired) {
            queryOracle();  // set up our next query
        }
    }

    function queryOracle() internal
    {
        if (oraclize_getPrice(ORACLE_DATA_SOURCE) > this.balance) {
            NewOracleQuery("Oraclize query was NOT sent, please add some ETH to cover for the query fee");
        } else {
            NewOracleQuery("Oraclize query was sent, standing by for the answer..");
            bytes32 queryId = oraclize_query(ORACLE_QUERY_REPEAT, ORACLE_DATA_SOURCE, ORACLE_QUERY);
            validQueryIDs[queryId] = true;
        }
    }

    function checkSettlement() internal
    {
        if(isExpired)   // already expired.
            return;

        if(now > EXPIRATION) {
            isExpired = true;   // time based expiration has occurred.
        } else if(lastPrice >= MAX_PRICE || lastPrice <= MIN_PRICE) {
            isExpired = true;   // we have breached/touched our pricing bands
        }

        if(isExpired) {
            settleContract();
        }
    }

    function settleContract() internal
    {
        // TODO: build mechanism for distribution of collateral
        ContractSettled();
    }
}

