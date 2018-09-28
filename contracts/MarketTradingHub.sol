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
import "./MarketContract.sol";
import "./libraries/OrderLib.sol";
import "./libraries/MathLib.sol";
import "./tokens/MarketToken.sol";

import "openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";
import "openzeppelin-solidity/contracts/token/ERC20/SafeERC20.sol";


contract MarketTradingHub {
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
    address public MKT_TOKEN_ADDRESS;
    MarketToken MKT_TOKEN;

    // accounting
    address public MARKET_COLLATERAL_POOL_ADDRESS;
    MarketCollateralPool MARKET_COLLATERAL_POOL;
    OrderLib.OrderMappings orderMappings;

    // events
    event Error(ErrorCodes indexed errorCode, bytes32 indexed orderHash);

    // order events
    event OrderFilled(
        address indexed marketContractAddress,
        address indexed maker,
        address indexed taker,
        address feeRecipient,
        int filledQty,
        uint paidMakerFee,
        uint paidTakerFee,
        uint price,
        bytes32 orderHash
    );

    event OrderCancelled(
        address indexed marketContractAddress,
        address indexed maker,
        address indexed feeRecipient,
        int cancelledQty,
        bytes32 orderHash
    );

    constructor(
        address marketTokenAddress,
        address collateralPoolAddress
    ) public
    {
        MARKET_COLLATERAL_POOL_ADDRESS = collateralPoolAddress;
        MARKET_COLLATERAL_POOL = MarketCollateralPool(MARKET_COLLATERAL_POOL_ADDRESS);
        MKT_TOKEN_ADDRESS = marketTokenAddress;
        MKT_TOKEN = MarketToken(MKT_TOKEN_ADDRESS);
    }

    /*
    // EXTERNAL METHODS
    */

    // @notice called by a participant wanting to trade a specific order
    /// @param orderAddresses - marketContractAddress, maker, taker and feeRecipient addresses
    /// @param unsignedOrderValues makerFee, takerFree, price, expirationTimeStamp, and salt (for hashing)
    /// @param orderQty quantity of the order
    /// @param qtyToFill quantity taker is willing to fill of original order(max)
    /// @param v order signature
    /// @param r order signature
    /// @param s order signature
    function tradeOrder(
        address[4] orderAddresses,
        uint[5] unsignedOrderValues,
        int orderQty,
        int qtyToFill,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external returns (int filledQty)
    {
        MarketContract marketContract = MarketContract(orderAddresses[0]);
        require(!marketContract.isSettled(), "Contract has already settled"); // no trading past settlement
        require(orderQty != 0 && qtyToFill != 0 && orderQty.isSameSign(qtyToFill), "qty Error");   // no zero trades, sings match
        require(MKT_TOKEN.isUserEnabledForContract(this, msg.sender), "taker not enabled");
        OrderLib.Order memory order = OrderLib.createOrder(orderAddresses, unsignedOrderValues, orderQty);
        require(MKT_TOKEN.isUserEnabledForContract(this, order.maker), "maker not enabled");

        // taker can be anyone, or specifically the caller!
        require(order.taker == address(0) || order.taker == msg.sender, "invalid taker");
        // do not allow self trade
        require(order.maker != address(0) && order.maker != msg.sender, "invalid wash trade");

        require(
            OrderLib.isValidSignature(
                order.maker,
                order.orderHash,
                v,
                r,
                s
            )
        );


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
        MARKET_COLLATERAL_POOL.updatePositions(
            order.marketContractAddress,
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
            order.marketContractAddress,
            order.maker,
            msg.sender,
            order.feeRecipient,
            filledQty,
            paidMakerFee,
            paidTakerFee,
            order.price,
            order.orderHash
        );

        return filledQty;
    }

    /// @notice called by the maker of an order to attempt to cancel the order before its expiration time stamp
    /// @param orderAddresses - marketContractAddress, maker, taker and feeRecipient addresses
    /// @param unsignedOrderValues makerFee, takerFree, price, expirationTimeStamp, and salt (for hashing)
    /// @param orderQty quantity of the order
    /// @param qtyToCancel quantity maker is attempting to cancel
    /// @return qty that was successfully cancelled of order.
    function cancelOrder(
        address[4] orderAddresses,
        uint[5] unsignedOrderValues,
        int orderQty,
        int qtyToCancel
    ) external returns (int qtyCancelled)
    {
        require(qtyToCancel != 0 && qtyToCancel.isSameSign(orderQty));      // cannot cancel 0 and signs must match
        MarketContract marketContract = MarketContract(orderAddresses[0]);
        require(!marketContract.isSettled());

        OrderLib.Order memory order = OrderLib.createOrder(orderAddresses, unsignedOrderValues, orderQty);
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
            order.marketContractAddress,
            order.maker,
            order.feeRecipient,
            qtyCancelled,
            order.orderHash
        );

        return qtyCancelled;
    }

    /*
    // PUBLIC METHODS
    */

    /// @notice returns the qty that is no longer available to trade for a given order
    /// @param orderHash hash of order to find filled and cancelled qty
    /// @return int quantity that is no longer able to filled from the supplied order hash
    function getQtyFilledOrCancelledFromOrder(bytes32 orderHash) public view returns (int) {
        return orderMappings.getQtyFilledOrCancelledFromOrder(orderHash);
    }

}
