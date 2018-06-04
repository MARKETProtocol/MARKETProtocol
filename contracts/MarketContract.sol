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

import "./Creatable.sol";
import "./MarketCollateralPool.sol";
import "./libraries/OrderLib.sol";
import "./libraries/MathLib.sol";
import "./tokens/MarketToken.sol";

import "openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";
import "openzeppelin-solidity/contracts/token/ERC20/SafeERC20.sol";


/// @title MarketContract base contract implement all needed functionality for trading.
/// @notice this is the abstract base contract that all contracts should inherit from to
/// implement different oracle solutions.
/// @author Phil Elsasser <phil@marketprotocol.io>
contract MarketContract is Creatable {
    using OrderLib for address;
    using OrderLib for OrderLib.Order;
    using OrderLib for OrderLib.OrderMappings;
    using MathLib for int;
    using MathLib for uint;
    using SafeERC20 for ERC20;
    using SafeERC20 for MarketToken;

    enum ErrorCodes {
        ORDER_EXPIRED,              // past designated timestamp
        ORDER_DEAD                  // order if fully filled or fully cancelled
    }

    // constants
    address public COLLATERAL_POOL_FACTORY_ADDRESS;
    address public MKT_TOKEN_ADDRESS;
    MarketToken MKT_TOKEN;


    string public CONTRACT_NAME;
    address public COLLATERAL_TOKEN_ADDRESS;
    uint public PRICE_CAP;
    uint public PRICE_FLOOR;
    uint public PRICE_DECIMAL_PLACES;   // how to convert the pricing from decimal format (if valid) to integer
    uint public QTY_MULTIPLIER;         // multiplier corresponding to the value of 1 increment in price to token base units
    uint public EXPIRATION;

    // state variables
    uint public lastPrice;
    uint public settlementPrice;
    bool public isSettled = false;
    bool public isCollateralPoolContractLinked = false;

    // accounting
    address public marketCollateralPoolAddress;
    MarketCollateralPool marketCollateralPool;
    OrderLib.OrderMappings orderMappings;

    // events
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
    constructor(
        string contractName,
        address creatorAddress,
        address marketTokenAddress,
        address collateralTokenAddress,
        address collateralPoolFactoryAddress,
        uint[5] contractSpecs
    ) public
    {
        COLLATERAL_POOL_FACTORY_ADDRESS = collateralPoolFactoryAddress;
        MKT_TOKEN_ADDRESS = marketTokenAddress;
        MKT_TOKEN = MarketToken(marketTokenAddress);
        require(MKT_TOKEN.isBalanceSufficientForContractCreation(msg.sender));    // creator must be MKT holder
        PRICE_FLOOR = contractSpecs[0];
        PRICE_CAP = contractSpecs[1];
        require(PRICE_CAP > PRICE_FLOOR);

        PRICE_DECIMAL_PLACES = contractSpecs[2];
        QTY_MULTIPLIER = contractSpecs[3];
        EXPIRATION = contractSpecs[4];
        require(EXPIRATION > now);

        CONTRACT_NAME = contractName;
        COLLATERAL_TOKEN_ADDRESS = collateralTokenAddress;
        creator = creatorAddress;
    }

    /*
    // EXTERNAL METHODS
    */

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
        require(isCollateralPoolContractLinked && !isSettled); // no trading past settlement
        require(orderQty != 0 && qtyToFill != 0 && orderQty.isSameSign(qtyToFill));   // no zero trades, sings match
        require(MKT_TOKEN.isUserEnabledForContract(this, msg.sender));
        OrderLib.Order memory order = address(this).createOrder(orderAddresses, unsignedOrderValues, orderQty);
        require(MKT_TOKEN.isUserEnabledForContract(this, order.maker));

        // taker can be anyone, or specifically the caller!
        require(order.taker == address(0) || order.taker == msg.sender);
        // do not allow self trade
        require(order.maker != address(0) && order.maker != msg.sender);
        require(
            order.maker.isValidSignature(
                order.orderHash,
                v,
                r,
                s
        ));


        if (now >= order.expirationTimeStamp) {
            emit Error(ErrorCodes.ORDER_EXPIRED, order.orderHash);
            return 0;
        }

        int remainingQty = orderQty.subtract(getQtyFilledOrCancelledFromOrder(order.orderHash));
        if (remainingQty == 0) { // there is no qty remaining  - cannot fill!
            emit Error(ErrorCodes.ORDER_DEAD, order.orderHash);
            return 0;
        }

        filledQty = MathLib.absMin(remainingQty, qtyToFill);
        marketCollateralPool.updatePositions(
            order.maker,
            msg.sender,
            filledQty,
            order.price
        );
        orderMappings.addFilledQtyToOrder(order.orderHash, filledQty);

        uint paidMakerFee = 0;
        uint paidTakerFee = 0;

        if (order.feeRecipient != address(0)) {
            // we need to transfer fees to recipient
            uint filledAbsQty = filledQty.abs();
            uint orderAbsQty = filledQty.abs();
            if (order.makerFee > 0) {
                paidMakerFee = order.makerFee.divideFractional(filledAbsQty, orderAbsQty);
                MKT_TOKEN.safeTransferFrom(
                    order.maker,
                    order.feeRecipient,
                    paidMakerFee
                );
            }

            if (order.takerFee > 0) {
                paidTakerFee = order.takerFee.divideFractional(filledAbsQty, orderAbsQty);
                MKT_TOKEN.safeTransferFrom(
                    msg.sender,
                    order.feeRecipient,
                    paidTakerFee
                );
            }
        }

        emit OrderFilled(
            order.maker,
            msg.sender,
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
            emit Error(ErrorCodes.ORDER_EXPIRED, order.orderHash);
            return 0;
        }

        int remainingQty = orderQty.subtract(getQtyFilledOrCancelledFromOrder(order.orderHash));
        if (remainingQty == 0) { // there is no qty remaining to cancel order is dead
            emit Error(ErrorCodes.ORDER_DEAD, order.orderHash);
            return 0;
        }

        qtyCancelled = MathLib.absMin(qtyToCancel, remainingQty);   // we can only cancel what remains
        orderMappings.addCancelledQtyToOrder(order.orderHash, qtyCancelled);
        emit OrderCancelled(
            order.maker,
            order.feeRecipient,
            qtyCancelled,
            order.orderHash
        );

        return qtyCancelled;
    }

    /// @notice allows the factory to link a collateral pool contract to this trading contract.
    /// can only be called once if successful.  Trading cannot commence until this is completed.
    /// @param poolAddress deployed address of the unique collateral pool for this contract.
    function setCollateralPoolContractAddress(address poolAddress) external onlyFactory {
        require(!isCollateralPoolContractLinked); // address has not been set previously
        require(poolAddress != address(0));       // not trying to set it to null addr.
        marketCollateralPool = MarketCollateralPool(poolAddress);
        require(marketCollateralPool.linkedAddress() == address(this)); // ensure pool set up correctly.
        marketCollateralPoolAddress = poolAddress;
        isCollateralPoolContractLinked = true;
    }

    /* Currently no pre-funding is required.
    /// @notice after contract settlement the contract creator can reclaim any
    /// unused ethereum balance from this contract that was provided for oracle query costs / gas.
    function reclaimUnusedEtherBalance() external onlyCreator {
        require(isSettled && this.balance > 0); // this contract has completed all needed queries
        creator.transfer(this.balance);         // return balance to the creator.
    }
    */

    /// @notice allows a user to request an extra query to oracle in order to push the contract into
    /// settlement.  A user may call this as many times as they like, since they are the ones paying for
    /// the call to our oracle and post processing. This is useful for both a failsafe and as a way to
    /// settle a contract early if a price cap or floor has been breached.
    function requestEarlySettlement() external payable;

    /*
    // PUBLIC METHODS
    */

    /// @notice returns the qty that is no longer available to trade for a given order
    /// @param orderHash hash of order to find filled and cancelled qty
    /// @return int quantity that is no longer able to filled from the supplied order hash
    function getQtyFilledOrCancelledFromOrder(bytes32 orderHash) public view returns (int) {
        return orderMappings.getQtyFilledOrCancelledFromOrder(orderHash);
    }

    /*
    // PRIVATE METHODS
    */

    /// @dev checks our last query price to see if our contract should enter settlement due to it being past our
    //  expiration date or outside of our tradeable ranges.
    function checkSettlement() internal {
        if (isSettled)   // already settled.
            return;

        uint newSettlementPrice;
        if (now > EXPIRATION) {  // note: miners can cheat this by small increments of time (minutes, not hours)
            isSettled = true;                   // time based expiration has occurred.
            newSettlementPrice = lastPrice;
        } else if (lastPrice >= PRICE_CAP) {    // price is greater or equal to our cap, settle to CAP price
            isSettled = true;
            newSettlementPrice = PRICE_CAP;
        } else if (lastPrice <= PRICE_FLOOR) {  // price is lesser or equal to our floor, settle to FLOOR price
            isSettled = true;
            newSettlementPrice = PRICE_FLOOR;
        }

        if (isSettled) {
            settleContract(newSettlementPrice);
        }
    }

    /// @dev records our final settlement price and fires needed events.
    /// @param finalSettlementPrice final query price at time of settlement
    function settleContract(uint finalSettlementPrice) private {
        settlementPrice = finalSettlementPrice;
        emit ContractSettled(finalSettlementPrice);
    }

    ///@dev Throws if called by any account other than the factory.
    modifier onlyFactory() {
        require(msg.sender == COLLATERAL_POOL_FACTORY_ADDRESS);
        _;
    }
}
