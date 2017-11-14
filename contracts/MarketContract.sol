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
import "./libraries/HashLib.sol";
import "zeppelin-solidity/contracts/token/ERC20.sol";
import "zeppelin-solidity/contracts/token/SafeERC20.sol";

//TODO: fix style issues
//      add failsafe for pool distribution.
//      push as much into library as possible
//      create mappings for deposit tokens and balance of collateral pool
//      think about circuit breaker in case of issues
//      do we want to use ETH or WETH for ETH based contract?
//      add open interest to allow users to see outstanding open positions


/// @title MarketContract first example of a MarketProtocol contract using Oraclize services
/// @author Phil Elsasser <phil@marketprotcol.io>
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
    event ContractSettled();
    event UpdatedUserBalance(address user, uint balance);
    event UpdatedPoolBalance(uint balance);

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

    function depositEtherForTrading() external payable {
        // should we allow ether or force users to use WETH?
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
    /// @param maker address of the maker of this order
    /// @param taker address of the designated taker or address(0) if publicly available to be traded
    /// @param feeRecipient address of a fee recipient, optional
    /// @param makerFee amount of MKT token for maker fee
    /// @param takerFee amount of MKT token for taker fee
    /// @param price of the order
    /// @param orderQty quantity of the order
    /// @param qtyToFill quantity taker is willing to fill (max)
    /// @param expirationTimeStamp last valid timestamp of the order (seconds since epoch)
    /// @param v order signature
    /// @param r order signature
    /// @param s order signature
    function tradeOrder(
        address maker,
        address taker,
        address feeRecipient,
        uint makerFee,
        uint takerFee,
        uint price,
        int orderQty,
        int qtyToFill,
        uint expirationTimeStamp,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        require(!isSettled);                                // no trading past settlement
        require(taker == address(0) || taker == msg.sender);// taker can be anyone, or specifically the caller!
        require(maker != address(0) && maker != taker);     // do not allow self trade
        require(orderQty != 0 && qtyToFill != 0);           // no zero trades

        bytes32 orderHash = address(this).createOrderHash(maker, feeRecipient,
                                makerFee, takerFee, orderQty, price, expirationTimeStamp);

        require(maker.isValidSignature(orderHash, v, r, s));

        if(now >= expirationTimeStamp) {
            // TODO: order is expired, no trade - log this
            return;
        }
        // TODO finish build out

    }

    // @notice called by the maker of an order to attempt to cancel the order before its expiration time stamp
    /// @param maker address of the maker of this order
    /// @param taker address of the designated taker or address(0) if publicly available to be traded
    /// @param feeRecipient address of a fee recipient, optional
    /// @param makerFee amount of MKT token for maker fee
    /// @param takerFee amount of MKT token for taker fee
    /// @param price of the order
    /// @param orderQty quantity of the order
    /// @param qtyToCancel quantity maker is attempting to cancel
    /// @param expirationTimeStamp last valid timestamp of the order (seconds since epoch)
    function cancelOrder(
        address maker,
        address taker,
        address feeRecipient,
        uint makerFee,
        uint takerFee,
        uint price,
        int orderQty,
        int qtyToCancel,
        uint expirationTimeStamp
    ) external {
        require(maker == msg.sender);                                       // only maker can cancel standing order
        require(qtyToCancel != 0 && qtyToCancel.isSameSign(orderQty));      // cannot cancel 0 and signs must match

        if(now >= expirationTimeStamp || isSettled) {
            // TODO: order or contract is expired, no need to cancel - log this
            return;
        }

        bytes32 orderHash = address(this).createOrderHash(maker, feeRecipient,
                                makerFee, takerFee, orderQty, price, expirationTimeStamp);
        // TODO: check to see if order is fully filled order cancelled
        //
        cancelledOrderQty[orderHash] = cancelledOrderQty[orderHash].add(qtyToCancel);
        // TODO: log
    }


    // @notice called by a user after settlement has occurred.  This function will finalize all accounting around any
    // outstanding positions and return all remaining collateral to the caller. This should only be called after
    // settlement has occurred.
    function settleAndClose() external {
        require(isSettled);
        UserNetPosition storage userNetPos = addressToUserPosition[msg.sender];
        if(userNetPos.netPosition != 0) {
            // this user has a position that we need to settle based upon the settlement price of the contract
            reduceUserNetPosition(msg.sender, userNetPos.netPosition * - 1, settlementPrice);
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
            // new position or adding to open pos, no collateral returned
            userNetPosition.positions.push(Position(price, qty)); //append array with new position
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
        userNetPosition.netPosition.add(qty);
    }

    /// @dev calculates the needed collateral for a new position and commits it to the pool removing it from the
    /// users account
    /// @param userAddress address of user entering into the position
    /// @param qty signed quantity of the trade
    /// @param price agreed price of trade
    function addUserNetPosition(address userAddress, int qty, uint price) private {
        uint neededCollateral = MathLib.calculateNeededCollateral(this, qty, price);
        commitCollateralToPool(userAddress, neededCollateral);
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
                collateralToReturnToUserAccount.add(MathLib.calculateNeededCollateral(this, position.qty, price));
                qtyToReduce = qtyToReduce.add(position.qty);
                userNetPos.positions.length--;  // remove this position from our array.
            }
            else {  // this position stays, just reduce the qty.
                position.qty = position.qty.add(qtyToReduce);
                // pos is opp sign of qty we are reducing here!
                collateralToReturnToUserAccount.add(MathLib.calculateNeededCollateral(this, qtyToReduce * -1, price));
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
        if(isSettled)   // already settled.
            return;

        if(now > EXPIRATION) {  // note: miners can cheat this by small increments of time (minutes, not hours)
            isSettled = true;   // time based expiration has occurred.
        } else if(lastPrice >= PRICE_CAP || lastPrice <= PRICE_FLOOR) {
            isSettled = true;   // we have breached/touched our pricing bands
        }

        if(isSettled) {
            settleContract();
        }
    }

    function settleContract(uint finalSettlementPrice) private {
        settlementPrice = finalSettlementPrice;
        ContractSettled();
    }

    // for now lets require alot of padding for the settlement,
    function checkSufficientStartingBalance(uint secondsToExpiration) private view returns (bool isSufficient) {
        //uint costPerQuery = oraclize_getPrice(ORACLE_DATA_SOURCE); this doesn't work prior to first query(its free)
        uint expectedNoOfQueries = secondsToExpiration / ORACLE_QUERY_REPEAT;
        uint approxGasRequired = COST_PER_QUERY * expectedNoOfQueries;
        return this.balance > (approxGasRequired * 2);
    }
}

