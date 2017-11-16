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
import "zeppelin-solidity/contracts/token/ERC20.sol";
import "zeppelin-solidity/contracts/token/SafeERC20.sol";

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
contract MarketContract is Creatable, usingOraclize  {
    using MathLib for uint256;
    using MathLib for int;
    using OrderLib for address;
    using OrderLib for OrderLib.Order;
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

    enum ErrorCodes {
        ORDER_EXPIRED,              // past designated timestamp
        ORDER_DEAD                  // order if fully filled or fully cancelled
    }

    // constants
    string public CONTRACT_NAME;
    address public BASE_TOKEN_ADDRESS;
    ERC20 public BASE_TOKEN;
    uint public PRICE_CAP;
    uint public PRICE_FLOOR;
    uint public PRICE_DECIMAL_PLACES;   // how to convert the pricing from decimal format (if valid) to integer
    uint public QTY_DECIMAL_PLACES;     // how many tradeable units make up a whole pricing increment
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
    uint public settlementPrice;
    bool public isSettled;
    mapping(bytes32 => bool) validQueryIDs;

    // accounting
    mapping(address => UserNetPosition) addressToUserPosition;
    mapping(address => uint) userAddressToAccountBalance;   // stores account balances allowed to be allocated to orders
    mapping (bytes32 => int) public filledOrderQty;
    mapping (bytes32 => int) public cancelledOrderQty;
    uint collateralPoolBalance = 0;                         // current balance of all collateral committed

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
    ) public payable {

        require(capPrice > floorPrice);
        // TODO: check for minimum MEM token balance of caller.
        oraclize_setProof(proofType_TLSNotary | proofStorage_IPFS);
        CONTRACT_NAME = contractName;
        BASE_TOKEN_ADDRESS = baseTokenAddress;
        BASE_TOKEN = ERC20(baseTokenAddress);
        PRICE_CAP = capPrice;
        PRICE_FLOOR = floorPrice;
        EXPIRATION = now + secondsToExpiration;
        ORACLE_DATA_SOURCE = oracleDataSource;
        ORACLE_QUERY = oracleQuery;
        ORACLE_QUERY_REPEAT = oracleQueryRepeatSeconds;
        PRICE_DECIMAL_PLACES = priceDecimalPlaces;
        QTY_DECIMAL_PLACES = qtyDecimalPlaces;
        require(checkSufficientStartingBalance(secondsToExpiration));
        queryOracle();  // schedules recursive calls to oracle
    }

    /*
    // EXTERNAL METHODS
    */

    // @param userAddress address to return position for
    // @return the users current open position.
    function getUserPosition(address userAddress) external view returns (int)  {
        return addressToUserPosition[userAddress].netPosition;
    }

    /// @notice deposits tokens to the smart contract to fund the user account and provide needed tokens for collateral
    /// pool upon trade matching.
    /// @param depositAmount qty of ERC20 tokens to deposit to the smart contract to cover open orders and collateral
    function depositTokensForTrading(uint256 depositAmount) external {
        // user must call approve!
        BASE_TOKEN.safeTransferFrom(msg.sender, this, depositAmount);
        uint256 balanceAfterDeposit = userAddressToAccountBalance[msg.sender].add(depositAmount);
        userAddressToAccountBalance[msg.sender] = balanceAfterDeposit;
        UpdatedUserBalance(msg.sender, balanceAfterDeposit);
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
    ) external returns (int filledQty) {
        require(!isSettled);                                // no trading past settlement
        require(orderQty != 0 && qtyToFill != 0);           // no zero trades
        require(orderQty.isSameSign(qtyToFill));            // signs should match
        OrderLib.Order memory order = address(this).createOrder(orderAddresses, unsignedOrderValues, orderQty);

        // taker can be anyone, or specifically the caller!
        require(order.taker == address(0) || order.taker == msg.sender);
        // do not allow self trade
        require(order.maker != address(0) && order.maker != order.taker);
        require(order.maker.isValidSignature(order.orderHash, v, r, s));

        if(now >= order.expirationTimeStamp) {
            Error(ErrorCodes.ORDER_EXPIRED, order.orderHash);
            return 0;
        }

        int remainingQty = orderQty.subtract(getQtyFilledOrCancelledFromOrder(order.orderHash));
        if(remainingQty == 0) { // there is no qty remaining  - cannot fill!
            Error(ErrorCodes.ORDER_DEAD, order.orderHash);
            return 0;
        }

        filledQty = MathLib.absMin(remainingQty, qtyToFill);
        updatePositions(order.maker, order.taker, filledQty, order.price);

        uint paidMakerFee = 0;
        uint paidTakerFee = 0;

        if(order.feeRecipient != address(0)) { // we need to transfer fees to recipient

            if(order.makerFee > 0) {

            }

            if(order.takerFee > 0) {

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
    ) external returns (int qtyCancelled){
        require(qtyToCancel != 0 && qtyToCancel.isSameSign(orderQty));      // cannot cancel 0 and signs must match
        require(!isSettled);
        OrderLib.Order memory order = address(this).createOrder(orderAddresses, unsignedOrderValues, orderQty);
        require(order.maker == msg.sender);                                // only maker can cancel standing order
        if(now >= order.expirationTimeStamp) {
            Error(ErrorCodes.ORDER_EXPIRED, order.orderHash);
            return 0;
        }

        int remainingQty = orderQty.subtract(getQtyFilledOrCancelledFromOrder(order.orderHash));
        if(remainingQty == 0) { // there is no qty remaining to cancel order is dead
            Error(ErrorCodes.ORDER_DEAD, order.orderHash);
            return 0;
        }

        qtyCancelled = MathLib.absMin(qtyToCancel, remainingQty);   // we can only cancel what remains
        cancelledOrderQty[order.orderHash] = cancelledOrderQty[order.orderHash].add(qtyCancelled);
        OrderCancelled(order.maker, order.feeRecipient, qtyCancelled, order.orderHash);
        return qtyCancelled;
    }


    // @notice called by a user after settlement has occurred.  This function will finalize all accounting around any
    // outstanding positions and return all remaining collateral to the caller. This should only be called after
    // settlement has occurred.
    function settleAndClose() external {
        require(isSettled);
        UserNetPosition storage userNetPos = addressToUserPosition[msg.sender];
        if(userNetPos.netPosition != 0) {
            // this user has a position that we need to settle based upon the settlement price of the contract
            reduceUserNetPosition(msg.sender, userNetPos, userNetPos.netPosition * - 1, settlementPrice);
        }
        withdrawTokens(userAddressToAccountBalance[msg.sender]);   // transfer all balances back to user.
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
        lastPrice = parseInt(result, PRICE_DECIMAL_PLACES);
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
        return filledOrderQty[orderHash].add(cancelledOrderQty[orderHash]);
    }

    /// @notice removes token from users trading account
    /// @param withdrawAmount qty of token to attempt to withdraw
    function withdrawTokens(uint256 withdrawAmount) public {
        require(userAddressToAccountBalance[msg.sender] >= withdrawAmount);   // ensure sufficient balance
        uint256 balanceAfterWithdrawal = userAddressToAccountBalance[msg.sender].subtract(withdrawAmount);
        userAddressToAccountBalance[msg.sender] = balanceAfterWithdrawal;   // update balance before external call!
        BASE_TOKEN.safeTransfer(msg.sender, withdrawAmount);
        UpdatedUserBalance(msg.sender, balanceAfterWithdrawal);
    }

    /*
    // PRIVATE METHODS
    */

    /// @param maker address of the maker in the trade
    /// @param taker address of the taker in the trade
    /// @param qty quantity transacted between parties
    /// @param price agreed price of the matched trade.
    function updatePositions(address maker, address taker, int qty, uint price) private {
        updatePosition(maker, qty, price);
        // continue process for taker, but qty is opposite sign for taker
        updatePosition(taker, qty * -1, price);

    }

    /// @param userAddress storage struct containing position information for this user
    /// @param qty signed quantity this users position is changing by, + for buy and - for sell
    /// @param price transacted price of the new position / trade
    function updatePosition(address userAddress, int qty, uint price) private {
        UserNetPosition storage userNetPosition = addressToUserPosition[userAddress];
        if(userNetPosition.netPosition == 0 ||  userNetPosition.netPosition.isSameSign(qty)) {
            // new position or adding to open pos
            addUserNetPosition(userNetPosition, userAddress, qty, price);
        }
        else {
            // opposite side from open position, reduce, flattened, or flipped.
            if(userNetPosition.netPosition >= qty * -1) { // pos is reduced of flattened
                reduceUserNetPosition(userAddress, userNetPosition, qty, price);
            } else {    // pos is flipped, reduce and then create new open pos!
                reduceUserNetPosition(userAddress, userNetPosition, userNetPosition.netPosition * -1, price); // flatten completely
                int newNetPos = userNetPosition.netPosition + qty;            // the portion remaining after flattening
                addUserNetPosition(userNetPosition, userAddress, newNetPos, price);
            }
        }
        userNetPosition.netPosition.add(qty);   // keep track of total net pos across all prices for user.
    }

    /// @dev calculates the needed collateral for a new position and commits it to the pool removing it from the
    /// users account and creates the needed Position struct to record the new position.
    /// @param userNetPosition current positions held by user
    /// @param userAddress address of user entering into the position
    /// @param qty signed quantity of the trade
    /// @param price agreed price of trade
    function addUserNetPosition(
        UserNetPosition storage userNetPosition,
        address userAddress,
        int qty,
        uint price
    ) private {
        uint neededCollateral = MathLib.calculateNeededCollateral(
            PRICE_FLOOR,
            PRICE_CAP,
            QTY_DECIMAL_PLACES,
            qty,
            price);
        commitCollateralToPool(userAddress, neededCollateral);
        userNetPosition.positions.push(Position(price, qty));   // append array with new position
    }

    /// @param userAddress address of user who is reducing their pos
    /// @param userNetPos storage struct for this users position
    /// @param qty signed quantity of the qty to reduce this users position by
    /// @param price transacted price
    function reduceUserNetPosition(
        address userAddress,
        UserNetPosition storage userNetPos,
        int qty,
        uint price
    ) private {
        uint collateralToReturnToUserAccount = 0;
        int qtyToReduce = qty;                      // note: this sign is opposite of our users position
        assert(userNetPos.positions.length != 0);   // sanity check
        while(qtyToReduce != 0) {   //TODO: ensure we dont run out of gas here!
            Position storage position = userNetPos.positions[userNetPos.positions.length - 1];  // get the last pos (LIFO)
            if(position.qty.abs() <= qtyToReduce.abs()) {   // this position is completely consumed!
                collateralToReturnToUserAccount.add(MathLib.calculateNeededCollateral(
                    PRICE_FLOOR,
                    PRICE_CAP,
                    QTY_DECIMAL_PLACES,
                    position.qty,
                    price
                ));
                qtyToReduce = qtyToReduce.add(position.qty);
                userNetPos.positions.length--;  // remove this position from our array.
            }
            else {  // this position stays, just reduce the qty.
                position.qty = position.qty.add(qtyToReduce);
                // pos is opp sign of qty we are reducing here!
                collateralToReturnToUserAccount.add(MathLib.calculateNeededCollateral(
                    PRICE_FLOOR,
                    PRICE_CAP,
                    QTY_DECIMAL_PLACES,
                    qtyToReduce * -1,
                    price
                ));
                //qtyToReduce = 0; // completely reduced now!
                break;
            }
        }

        if(collateralToReturnToUserAccount != 0) {  // allocate funds back to user acct.
            withdrawCollateralFromPool(userAddress, collateralToReturnToUserAccount);
        }
    }

    /// @notice moves collateral from a user's account to the pool upon trade execution.
    /// @param fromAddress address of user entering trade
    /// @param collateralAmount amount of collateral to transfer from user account to collateral pool
    function commitCollateralToPool(address fromAddress, uint collateralAmount) private {
        require(userAddressToAccountBalance[fromAddress] >= collateralAmount);   // ensure sufficient balance
        uint newBalance = userAddressToAccountBalance[fromAddress].subtract(collateralAmount);
        userAddressToAccountBalance[fromAddress] = newBalance;
        collateralPoolBalance = collateralPoolBalance.add(collateralAmount);
        UpdatedUserBalance(fromAddress, newBalance);
        UpdatedPoolBalance(collateralPoolBalance);
    }

    /// @notice withdraws collateral from pool to a user account upon exit or trade settlement
    /// @param toAddress address of user
    /// @param collateralAmount amount to transfer from pool to user.
    function withdrawCollateralFromPool(address toAddress, uint collateralAmount) private {
        require(collateralPoolBalance >= collateralAmount); // ensure sufficient balance
        uint newBalance = userAddressToAccountBalance[toAddress].add(collateralAmount);
        userAddressToAccountBalance[toAddress] = newBalance;
        collateralPoolBalance = collateralPoolBalance.subtract(collateralAmount);
        UpdatedUserBalance(toAddress, newBalance);
        UpdatedPoolBalance(collateralPoolBalance);
    }

    /// @dev call to oraclize to set up our query and record its hash.
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

    /// @dev checks our last query price to see if our contract should enter settlement due to it being past our
    //  expiration date or outside of our tradeable ranges.
    function checkSettlement() private {
        if(isSettled)   // already settled.
            return;

        if(now > EXPIRATION) {  // note: miners can cheat this by small increments of time (minutes, not hours)
            isSettled = true;   // time based expiration has occurred.
        } else if(lastPrice >= PRICE_CAP || lastPrice <= PRICE_FLOOR) {
            isSettled = true;   // we have breached/touched our pricing bands
        }

        if(isSettled) {
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

