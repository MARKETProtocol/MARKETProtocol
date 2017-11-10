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
import "./libraries/HashLib.sol";
import "zeppelin-solidity/contracts/token/ERC20.sol";
import "zeppelin-solidity/contracts/token/SafeERC20.sol";

//TODO: fix style issues
//      add failsafe for pool distribution.
//      push as much into library as possible
//      create mappings for deposit tokens and balance of collateral pool
contract MarketContract is Creatable, usingOraclize  {
    using MathLib for uint256;
    using MathLib for int;
    using HashLib for address;
    using SafeERC20 for ERC20;

    struct UserNetPosition {
        address userAddress;
        Position[] positions;   // all open positions (lifo upon exit - allows us to not reindex array!)
        int netPosition;        // net position across all prices / executions
    }

    struct Position {
        uint price;
        int qty;
    }

    struct Order {
        address maker;
        address taker;
        address feeRecipient;
        uint makerFee;
        uint takerFee;
        uint qty;
        uint price;
        uint8 makerSide;            // 0=Buy 1=Sell
        uint expirationTimeStamp;
        bytes32 orderHash;
    }

    // constants
    string public CONTRACT_NAME;
    address public BASE_TOKEN_ADDRESS;
    ERC20 public BASE_TOKEN;
    uint public PRICE_CAP;
    uint public PRICE_FLOOR;
    uint public PRICE_DECIMAL_PLACES;   // how to convert the pricing from decimal format (if valid) to integer
    uint public EXPIRATION;
    string public ORACLE_DATA_SOURCE;
    string public ORACLE_QUERY;
    uint public ORACLE_QUERY_REPEAT;
    uint8 constant public BUY_SIDE = 0;
    uint8 constant public SELL_SIDE = 1;
    uint constant public COST_PER_QUERY = 2 finney;    // leave static for now, price of first query from oraclize is 0
    uint constant public QUERY_CALLBACK_GAS = 300000;

    // state variables
    string public lastPriceQueryResult;
    uint public lastPrice;
    bool public isExpired;
    mapping(bytes32 => bool) validQueryIDs;

    // accounting
    mapping(address => UserNetPosition) addressToUserPosition;
    mapping(address => uint) userAddressToAccountBalance;   // stores account balances allowed to be allocated to orders
    uint collateralPoolBalance = 0;                         // current balance of all collateral committed

    // events
    event OracleQuerySuccess();
    event OracleQueryFailed();
    event UpdatedLastPrice(string price);
    event ContractSettled();
    event DepositReceived(address user, uint depositAmount, uint totalBalance);
    event WithdrawCompleted(address user, uint withdrawAmount, uint totalBalance);

    function MarketContract(
        string contractName,
        address baseTokenAddress,
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
        BASE_TOKEN_ADDRESS = baseToken;
        BASE_TOKEN = ERC20(baseTokenAddress);
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

    function getUserPosition(address userAddress) public view returns (int)  {
        return addressToUserPosition[userAddress].netPosition;
    }

    function depositEtherForTrading() public payable {
        // should we allow ether or force users to use WETH?
    }

    // allows for all ERC20 tokens to be used for collateral and trading.
    function depositTokensForTrading(uint256 depositAmount) public {
        // user must call approve!
        BASE_TOKEN.safeTransferFrom(msg.sender, this, depositAmount);
        uint256 balanceAfterDeposit = userAddressToAccountBalance[msg.sender].add(depositAmount);
        userAddressToAccountBalance[msg.sender] = balanceAfterDeposit;
        DepositReceived(msg.sender, depositAmount, balanceAfterDeposit);
    }

    // allows user to remove token from trading account that have not been allocated to open positions
    function withdrawTokens(uint256 withdrawAmount) public {
        require(userAddressToAccountBalance[msg.sender] >= withdrawAmount);   // ensure sufficient balance
        uint256 balanceAfterWithdrawal = userAddressToAccountBalance[msg.sender].subtract(depositAmount);
        BASE_TOKEN.safeTransfer(msg.sender, withdrawAmount);
        WithdrawCompleted(msg.sender, withdrawAmount, balanceAfterWithdrawal);
    }

    function trade(address maker, address taker) {
        require(maker != address(0) && maker != taker);     // do not allow self trade
        // TODO validate orders, etc
    }

    function updatePositions(address maker, address taker, int qty, uint price) private {
        updatePosition(addressToUserPosition[maker], qty, price);
        // continue process for taker, but qty is opposite sign for taker
        updatePosition(addressToUserPosition[taker], qty * -1, price);
    }

    function updatePosition(UserNetPosition storage userNetPosition, int qty, uint price) private {
        if(userNetPosition.netPosition == 0 ||  userNetPosition.netPosition.isSameSign(qty)) {
            // new position or adding to open pos, no collateral returned
            userNetPosition.positions.push(Position(price, newNetPos)); //append array with new position
        }
        else {
            // opposite side from open position, reduce, flattened, or flipped.
            if(userNetPosition.netPosition >= qty * -1) { // pos is reduced of flattened
                reduceUserNetPosition(userNetPosition, qty, price);
            } else {    // pos is flipped, reduce and then create new open pos!
                reduceUserNetPosition(userNetPosition, userNetPosition.netPosition * -1, price); // flatten completely
                int newNetPos = userNetPosition.netPosition + qty;            // the portion remaining after flattening
                userNetPosition.positions.push(Position(price, newNetPos));   // append array with new position
            }
        }
        userNetPosition.netPosition += qty;
    }

    function reduceUserNetPosition(UserNetPosition storage userNetPos, int qty, uint price) private {
        int qtyToReduce = qty;
        assert(userNetPos.positions.length != 0);  // sanity check
        while(qtyToReduce != 0) {
            Position storage position = userNetPos.positions[userNetPos.positions.length - 1];  // get the last pos (LIFO)
            if(position.qty.abs() <= qtyToReduce.abs()) { // this position is completely consumed!
                qtyToReduce = qtyToReduce + position.qty;
                // TODO: work on refunding correct amount of collateral.
                userNetPos.positions.length--;  // remove this position from our array.
            }
            else {  // this position stays, just reduce the qty.
                position.qty += qtyToReduce;
                // TODO: return collateral
                //qtyToReduce = 0; // completely reduced now!
                break;
            }
        }
    }

    function commitCollateralToPool(address fromAddress, uint collateralAmount) private {

    }

    function withdrawCollateralFromPool(address toAddress, uint collateralAmount) private {

    }

    function queryOracle() private {
        if (oraclize_getPrice(ORACLE_DATA_SOURCE) > this.balance) {
            OracleQueryFailed();
            lastPriceQueryResult = "FAILED"; //TODO: failsafe
        } else {
            OracleQuerySuccess();
            bytes32 queryId = oraclize_query(ORACLE_QUERY_REPEAT, ORACLE_DATA_SOURCE, ORACLE_QUERY, QUERY_CALLBACK_GAS);
            validQueryIDs[queryId] = true;
        }
    }

    function checkSettlement() private {
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

    function settleContract() private {
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

