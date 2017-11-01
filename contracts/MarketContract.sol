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

import "./Creatable.sol";
import "./oraclize/oraclizeAPI.sol";
import "./libraries/MathLib.sol";

//TODO: fix style issues
//      add accounting for users and positions
//      how to hold ether for needed gas
//      how to hold collateral pool
//      add failsafe for pool distribution.
contract MarketContract is Creatable, usingOraclize  {
    using MathLib for uint256;
    using MathLib for int;

    struct UserPosition {
        address userAddress;
        uint[] prices;                      // prices user has transacted at (fifo upon exit)
        mapping(uint => int) priceToQty;    // prices to qty at price for users position
        int netPosition;                    // net position across all prices
    }

    struct Order {
        address maker;
        address taker;
        address feeRecipient;
        uint makerFee;
        uint takerFee;
        uint qty;
        uint price;
        uint8 makerSide;
        uint expirationTimeStamp;
        bytes32 orderHash;
    }

    // constants
    string public CONTRACT_NAME;
    address public BASE_TOKEN;
    uint public PRICE_CAP;
    uint public PRICE_FLOOR;
    uint public PRICE_DECIMAL_PLACES;   // how to convert the pricing from decimal format (if valid) to integer
    uint public EXPIRATION;
    string public ORACLE_DATA_SOURCE;
    string public ORACLE_QUERY;
    uint public ORACLE_QUERY_REPEAT;
    uint8 public BUY_SIDE = 0;
    uint8 public SELL_SIDE = 1;
    uint public COST_PER_QUERY = 2 finney;    // leave static for now, price of first query from oraclize is 0

    // state variables
    string public lastPriceQueryResult;
    uint public lastPrice;
    bool public isExpired;
    mapping(bytes32 => bool) validQueryIDs;

    // accounting
    mapping(address => UserPosition) addressToUserPosition;

    // events
    event NewOracleQuery(string description);
    event UpdatedLastPrice(string price);
    event ContractSettled();


    function MarketContract(
        string contractName,
        address baseToken,
        string oracleDataSource,
        string oracleQuery,
        uint oracleQueryRepeatSeconds,
        uint floorPrice,
        uint capPrice,
        uint priceDecimalPlaces,
        uint secondsToExpiration
    ) payable {

        require(capPrice > floorPrice);
        oraclize_setProof(proofType_TLSNotary | proofStorage_IPFS);
        CONTRACT_NAME = contractName;
        BASE_TOKEN = baseToken;
        PRICE_CAP = capPrice;
        PRICE_FLOOR = floorPrice;
        EXPIRATION = now + secondsToExpiration;
        ORACLE_DATA_SOURCE = oracleDataSource;
        ORACLE_QUERY = oracleQuery;
        ORACLE_QUERY_REPEAT = oracleQueryRepeatSeconds;
        PRICE_DECIMAL_PLACES = priceDecimalPlaces;
        require(checkSufficientStartingBalance(secondsToExpiration));
        queryOracle();  // schedules recursive calls to oracle
    }

    function __callback(bytes32 queryID, string result, bytes proof) {
        require(validQueryIDs[queryID]);
        require(msg.sender == oraclize_cbAddress());
        lastPriceQueryResult = result;
        lastPrice = parseInt(result, PRICE_DECIMAL_PLACES);
        UpdatedLastPrice(result);
        delete validQueryIDs[queryID];
        checkSettlement();
        if (!isExpired) {
            queryOracle();  // set up our next query
        }
    }

    function trade(address maker, address taker, int qty, uint price) {
        // TODO validate orders, etc
        require(maker != address(0) && maker != taker);     // do not allow self trade
        UserPosition storage makerPosition = addressToUserPosition[maker];
        // TODO create library to handle most bookeeping so we can reuse code and save gas!

        if(makerPosition.netPosition == 0 ||  makerPosition.netPosition.isSameSign(qty))
        {
            // new position or adding to open pos, no collateral returned
        }
        else
        {
            // taking position or part of position off, collateral needs to be returned
        }

        // continue process for taker.
    }

    function queryOracle() internal
    {
        if (oraclize_getPrice(ORACLE_DATA_SOURCE) > this.balance) {
            NewOracleQuery("Oraclize query was NOT sent, please add some ETH to cover for the query fee");
            lastPriceQueryResult = "FAILED"; //TODO: failsafe
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
        } else if(lastPrice >= PRICE_CAP || lastPrice <= PRICE_FLOOR) {
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

    // for now lets require alot of padding for the settlement,
    function checkSufficientStartingBalance(uint secondsToExpiration) private returns (bool isSufficient) {
        //uint costPerQuery = oraclize_getPrice(ORACLE_DATA_SOURCE); this doesn't work prior to first query(its free)
        uint expectedNoOfQueries = secondsToExpiration / ORACLE_QUERY_REPEAT;
        uint approxGasRequired = COST_PER_QUERY * expectedNoOfQueries;
        return this.balance > (approxGasRequired * 2);
    }
}

