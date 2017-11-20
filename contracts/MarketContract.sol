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

pragma solidity 0.4.18;

import "./Creatable.sol";
import "./oraclize/oraclizeAPI.sol";
import "./libraries/MathLib.sol";
import "./libraries/OrderLib.sol";
import "./libraries/AccountLib.sol";
import "zeppelin-solidity/contracts/token/ERC20.sol";


// TODO:
//      add failsafe for pool distribution.
//      push as much into library as possible
//      think about circuit breaker in case of issues
//      discuss build out ability to use ETH vs only ERC20? - WETH?
//      add open interest to allow users to see outstanding open positions
//      add function to allow user to pay for an extra query that could trigger settlement
//      require creator to own arbitrary amount of MEM token
//      add in fee functionality needed for nodes and the reduced fees for holders of MEM.

/// @title MarketContract first example of a MarketProtocol contract using Oraclize services
/// @author Phil Elsasser <phil@marketprotcol.io>
contract MarketContract is Creatable, usingOraclize {
    using MathLib for uint256;
    using MathLib for int;
    using OrderLib for address;
    using OrderLib for OrderLib.Order;
    using OrderLib for OrderLib.OrderMappings;
    using AccountLib for AccountLib.AccountMappings;
    using ContractLib for ContractLib.ContractSpecs;

    enum ErrorCodes {
        ORDER_EXPIRED,              // past designated timestamp
        ORDER_DEAD                  // order if fully filled or fully cancelled
    }

    // constants
    ContractLib.ContractSpecs CONTRACT_SPECS;
    string public ORACLE_DATA_SOURCE;
    string public ORACLE_QUERY;
    uint public ORACLE_QUERY_REPEAT;
    uint constant public COST_PER_QUERY = 2 finney;    // leave static for now, price of first query from oraclize is 0
    uint constant public QUERY_CALLBACK_GAS = 300000;

    // state variables
    string public lastPriceQueryResult;
    uint public lastPrice;
    uint public settlementPrice;
    bool public isSettled;
    mapping(bytes32 => bool) validQueryIDs;

    // accounting
    AccountLib.AccountMappings accountMappings;
    OrderLib.OrderMappings orderMappings;

    // events
    event OracleQuerySuccess();
    event OracleQueryFailed();
    event UpdatedLastPrice(string price);
    event ContractSettled(uint settlePrice);
    event UpdatedUserBalance(address indexed user, uint balance);
    event UpdatedPoolBalance(uint balance);
    event Error(ErrorCodes indexed errorCode, bytes32 indexed orderHash);

    // order events
    event OrderFilled(
        address indexed maker,
        address indexed taker,
        address indexed feeRecipient,
        int filledQty,
        uint paidMakerFee,
        uint paidTakerFee,
        bytes32 orderHash // should this be indexed?
    );

    event OrderCancelled(
        address indexed maker,
        address indexed feeRecipient,
        int cancelledQty,
        bytes32 indexed orderHash
    );


    /// @param contractName viewable name of this contract (BTC/ETH, LTC/ETH, etc)
    /// @param baseTokenAddress address of the ERC20 token that will be used for collateral and pricing
    /// @param oracleDataSource a data-source such as "URL", "WolframAlpha", "IPFS"
    /// see http://docs.oraclize.it/#ethereum-quick-start-simple-query
    /// @param oracleQuery see http://docs.oraclize.it/#ethereum-quick-start-simple-query for examples
    /// @param oracleQueryRepeatSeconds how often to repeat this callback to check for settlement, more frequent
    /// queries require more gas and may not be needed.
    /// @param floorPrice minimum tradeable price of this contract, contract enters settlement if breached
    /// @param capPrice maximum tradeable price of this contract, contract enters settlement if breached
    /// @param priceDecimalPlaces number of decimal places to convert our queried price from a floating point to
    /// an integer
    /// @param qtyDecimalPlaces decimal places to multiply traded qty by.
    /// @param secondsToExpiration - second from now that this contract expires and enters settlement
    function MarketContract(
        string contractName,
        address baseTokenAddress,
        string oracleDataSource,
        string oracleQuery,
        uint oracleQueryRepeatSeconds,
        uint floorPrice,
        uint capPrice,
        uint priceDecimalPlaces,
        uint qtyDecimalPlaces,
        uint secondsToExpiration
    ) public payable
    {
        require(capPrice > floorPrice);
        // TODO: check for minimum MEM token balance of caller.
        oraclize_setProof(proofType_TLSNotary | proofStorage_IPFS);
        CONTRACT_SPECS.CONTRACT_NAME = contractName;
        CONTRACT_SPECS.BASE_TOKEN_ADDRESS = baseTokenAddress;
        CONTRACT_SPECS.BASE_TOKEN = ERC20(baseTokenAddress);
        CONTRACT_SPECS.PRICE_CAP = capPrice;
        CONTRACT_SPECS.PRICE_FLOOR = floorPrice;
        CONTRACT_SPECS.EXPIRATION = now + secondsToExpiration;
        CONTRACT_SPECS.PRICE_DECIMAL_PLACES = priceDecimalPlaces;
        CONTRACT_SPECS.QTY_DECIMAL_PLACES = qtyDecimalPlaces;

        ORACLE_DATA_SOURCE = oracleDataSource;
        ORACLE_QUERY = oracleQuery;
        ORACLE_QUERY_REPEAT = oracleQueryRepeatSeconds;

        require(checkSufficientStartingBalance(secondsToExpiration));
        queryOracle();  // schedules recursive calls to oracle
    }

    /*
    // EXTERNAL METHODS
    */

    function getContractName() external view returns (string) {
        return CONTRACT_SPECS.CONTRACT_NAME;
    }

    function getBaseTokenAddress() external view returns (address) {
        return CONTRACT_SPECS.BASE_TOKEN_ADDRESS;
    }

    function getPriceCap() external view returns (uint) {
        return CONTRACT_SPECS.PRICE_CAP;
    }

    function getPriceFloor() external view returns (uint) {
        return CONTRACT_SPECS.PRICE_FLOOR;
    }

    function getPriceDecimalPlaces() external view returns (uint) {
        return CONTRACT_SPECS.PRICE_DECIMAL_PLACES;
    }

    function getQtyDecimalPlaces() external view returns (uint) {
        return CONTRACT_SPECS.QTY_DECIMAL_PLACES;
    }

    function getExpirationTimeStamp() external view returns (uint) {
        return CONTRACT_SPECS.EXPIRATION;
    }

    function getCollateralPoolBalance() external view returns (uint) {
        return accountMappings.collateralPoolBalance;
    }

    /// @param userAddress address to return position for
    /// @return the users current open position.
    function getUserPosition(address userAddress) external view returns (int) {
        return accountMappings.getUserPosition(userAddress);
    }

    /// @param userAddress address of user
    /// @return the users currently unallocated token balance
    function getUserAccountBalance(address userAddress) external view returns (uint) {
        return accountMappings.userAddressToAccountBalance[userAddress];
    }

    /// @notice deposits tokens to the smart contract to fund the user account and provide needed tokens for collateral
    /// pool upon trade matching.
    /// @param depositAmount qty of ERC20 tokens to deposit to the smart contract to cover open orders and collateral
    function depositTokensForTrading(uint256 depositAmount) external {
        accountMappings.depositTokensForTrading(CONTRACT_SPECS.BASE_TOKEN, depositAmount);
    }

    // @notice called by a participant wanting to trade a specific order
    /// @param orderAddresses - maker, taker and feeRecipient addresses
    /// @param unsignedOrderValues makerFee, takerFree, price, expirationTimeStamp, and salt (for hashing)
    /// @param orderQty quantity of the order
    /// @param qtyToFill quantity taker is willing to fill of original order(max)
    /// @param v order signature
    /// @param r order signature
    /// @param s order signature
    function tradeOrder(
        address[3] orderAddresses,
        uint[5] unsignedOrderValues,
        int orderQty,
        int qtyToFill,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external returns (int filledQty)
    {
        require(!isSettled);                                // no trading past settlement
        require(orderQty != 0 && qtyToFill != 0);           // no zero trades
        require(orderQty.isSameSign(qtyToFill));            // signs should match
        OrderLib.Order memory order = address(this).createOrder(orderAddresses, unsignedOrderValues, orderQty);

        // taker can be anyone, or specifically the caller!
        require(order.taker == address(0) || order.taker == msg.sender);
        // do not allow self trade
        require(order.maker != address(0) && order.maker != order.taker);
        require(
            order.maker.isValidSignature(
                order.orderHash,
                v,
                r,
                s
        ));


        if (now >= order.expirationTimeStamp) {
            Error(ErrorCodes.ORDER_EXPIRED, order.orderHash);
            return 0;
        }

        int remainingQty = orderQty.subtract(getQtyFilledOrCancelledFromOrder(order.orderHash));
        if (remainingQty == 0) { // there is no qty remaining  - cannot fill!
            Error(ErrorCodes.ORDER_DEAD, order.orderHash);
            return 0;
        }

        filledQty = MathLib.absMin(remainingQty, qtyToFill);
        accountMappings.updatePositions(
            CONTRACT_SPECS,
            order.maker,
            order.taker,
            filledQty,
            order.price
        );
        orderMappings.addFilledQtyToOrder(order.orderHash, filledQty);

        uint paidMakerFee = 0;
        uint paidTakerFee = 0;

        if (order.feeRecipient != address(0)) { // we need to transfer fees to recipient

            if (order.makerFee > 0) {

            }

            if (order.takerFee > 0) {

            }
        }

        OrderFilled(
            order.maker,
            order.taker,
            order.feeRecipient,
            filledQty,
            paidMakerFee,
            paidTakerFee,
            order.orderHash
        );

        return filledQty;
    }

    /// @notice called by the maker of an order to attempt to cancel the order before its expiration time stamp
    /// @param orderAddresses - maker, taker and feeRecipient addresses
    /// @param unsignedOrderValues makerFee, takerFree, price, expirationTimeStamp, and salt (for hashing)
    /// @param orderQty quantity of the order
    /// @param qtyToCancel quantity maker is attempting to cancel
    /// @return qty that was successfully cancelled of order.
    function cancelOrder(
        address[3] orderAddresses,
        uint[5] unsignedOrderValues,
        int orderQty,
        int qtyToCancel
    ) external returns (int qtyCancelled)
    {
        require(qtyToCancel != 0 && qtyToCancel.isSameSign(orderQty));      // cannot cancel 0 and signs must match
        require(!isSettled);
        OrderLib.Order memory order = address(this).createOrder(orderAddresses, unsignedOrderValues, orderQty);
        require(order.maker == msg.sender);                                // only maker can cancel standing order
        if (now >= order.expirationTimeStamp) {
            Error(ErrorCodes.ORDER_EXPIRED, order.orderHash);
            return 0;
        }

        int remainingQty = orderQty.subtract(getQtyFilledOrCancelledFromOrder(order.orderHash));
        if (remainingQty == 0) { // there is no qty remaining to cancel order is dead
            Error(ErrorCodes.ORDER_DEAD, order.orderHash);
            return 0;
        }

        qtyCancelled = MathLib.absMin(qtyToCancel, remainingQty);   // we can only cancel what remains
        orderMappings.addCancelledQtyToOrder(order.orderHash, qtyCancelled);
        OrderCancelled(
            order.maker,
            order.feeRecipient,
            qtyCancelled,
            order.orderHash
        );

        return qtyCancelled;
    }

    // @notice called by a user after settlement has occurred.  This function will finalize all accounting around any
    // outstanding positions and return all remaining collateral to the caller. This should only be called after
    // settlement has occurred.
    function settleAndClose() external {
        require(isSettled);
        accountMappings.settleAndClose(CONTRACT_SPECS, settlementPrice);
    }

    /*
    // PUBLIC METHODS
    */

    /// @param queryID of the returning query, this should match our own internal mapping
    /// @param result query to be processed
    /// @param proof result proof
    function __callback(bytes32 queryID, string result, bytes proof) public {
        require(validQueryIDs[queryID]);
        require(msg.sender == oraclize_cbAddress());
        lastPriceQueryResult = result;
        lastPrice = parseInt(result, CONTRACT_SPECS.PRICE_DECIMAL_PLACES);
        UpdatedLastPrice(result);
        delete validQueryIDs[queryID];
        checkSettlement();
        if (!isSettled) {
            queryOracle();  // set up our next query
        }
    }

    /// @notice returns the qty that is no longer available to trade for a given order
    /// @param orderHash hash of order to find filled and cancelled qty
    /// @return int quantity that is no longer able to filled from the supplied order hash
    function getQtyFilledOrCancelledFromOrder(bytes32 orderHash) public view returns (int) {
        return orderMappings.getQtyFilledOrCancelledFromOrder(orderHash);
    }

    /// @notice removes token from users trading account
    /// @param withdrawAmount qty of token to attempt to withdraw
    function withdrawTokens(uint256 withdrawAmount) public {
        accountMappings.withdrawTokens(CONTRACT_SPECS.BASE_TOKEN, withdrawAmount);
    }

    /*
    // PRIVATE METHODS
    */

    /// @dev call to oraclize to set up our query and record its hash.
    function queryOracle() private {
        if (oraclize_getPrice(ORACLE_DATA_SOURCE) > this.balance) {
            OracleQueryFailed();
            lastPriceQueryResult = "FAILED"; //TODO: failsafe
        } else {
            OracleQuerySuccess();
            bytes32 queryId = oraclize_query(
                ORACLE_QUERY_REPEAT,
                ORACLE_DATA_SOURCE,
                ORACLE_QUERY,
                QUERY_CALLBACK_GAS
            );
            validQueryIDs[queryId] = true;
        }
    }

    /// @dev checks our last query price to see if our contract should enter settlement due to it being past our
    //  expiration date or outside of our tradeable ranges.
    function checkSettlement() private {
        if (isSettled)   // already settled.
            return;

        if (now > CONTRACT_SPECS.EXPIRATION) {  // note: miners can cheat this by small increments of time (minutes, not hours)
            isSettled = true;   // time based expiration has occurred.
        } else if (lastPrice >= CONTRACT_SPECS.PRICE_CAP || lastPrice <= CONTRACT_SPECS.PRICE_FLOOR) {
            isSettled = true;   // we have breached/touched our pricing bands
        }

        if (isSettled) {
            settleContract(lastPrice);
        }
    }

    /// @dev records our final settlement price and fires needed events.
    /// @param finalSettlementPrice final query price at time of settlement
    function settleContract(uint finalSettlementPrice) private {
        settlementPrice = finalSettlementPrice;
        ContractSettled(finalSettlementPrice);
        // TODO: return any remaining ether balance to creator of this contract (no longer needs gas for queries)
    }

    /// @dev over estimates needed gas to power queries until expiration and determines if provided contract
    /// contains enough.
    /// @param secondsToExpiration seconds from now that expiration is scheduled.
    /// @return true if sufficient gas is present to create queries at the designated
    /// frequency from now until expiration
    function checkSufficientStartingBalance(uint secondsToExpiration) private view returns (bool isSufficient) {
        //uint costPerQuery = oraclize_getPrice(ORACLE_DATA_SOURCE); this doesn't work prior to first query(its free)
        uint expectedNoOfQueries = secondsToExpiration / ORACLE_QUERY_REPEAT;
        uint approxGasRequired = COST_PER_QUERY * expectedNoOfQueries;
        return this.balance > (approxGasRequired * 2);
    }
}