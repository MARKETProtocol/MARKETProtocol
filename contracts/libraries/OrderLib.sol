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

import "./MathLib.sol";


/// @title OrderLib
/// @author Phil Elsasser <phil@marketprotcol.io>
library OrderLib {
    using MathLib for int;

    struct OrderMappings {
        mapping (bytes32 => int) filledOrderQty;
        mapping (bytes32 => int) cancelledOrderQty;
    }

    struct Order {
        address maker;
        address taker;
        address feeRecipient;
        uint makerFee;
        uint takerFee;
        uint price;
        uint expirationTimeStamp;
        int qty;
        bytes32 orderHash;
    }

    /*
    // PUBLIC METHODS
    */

    /// @notice returns the qty that is no longer available to trade for a given order
    /// @param orderHash hash of order to find filled and cancelled qty
    /// @return int quantity that is no longer able to filled from the supplied order hash
    function getQtyFilledOrCancelledFromOrder(OrderMappings storage self, bytes32 orderHash) internal view returns (int) {
        return self.filledOrderQty[orderHash].add(self.cancelledOrderQty[orderHash]);
    }

    /// @notice creates the hash for the given order parameters.
    /// @param contractAddress address of the calling contract, orders are unique to each contract
    /// @param orderAddresses array of 3 address. maker, taker, and feeRecipient
    /// @param unsignedOrderValues array of 5 unsigned integers. makerFee, takerFee, price, expirationTimeStamp and salt
    /// @param orderQty signed qty of the original order.
    function createOrderHash(
        address contractAddress,
        address[3] orderAddresses,
        uint[5] unsignedOrderValues,
        int orderQty
    ) public pure returns (bytes32)
    {
        return keccak256(
            contractAddress,
            orderAddresses[0],
            orderAddresses[1],
            orderAddresses[2],
            unsignedOrderValues[0],
            unsignedOrderValues[1],
            unsignedOrderValues[2],
            unsignedOrderValues[3],
            unsignedOrderValues[4],
            orderQty
        );
    }

    /// @notice confirms hash originated from signer
    /// @param signerAddress - address of order originator
    /// @param hash - original order hash
    /// @param v order signature
    /// @param r order signature
    /// @param s order signature
    function isValidSignature(
        address signerAddress,
        bytes32 hash,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public pure returns (bool)
    {
        return signerAddress == ecrecover(
            keccak256("\x19Ethereum Signed Message:\n32", hash),
            v,
            r,
            s
        );
    }

    /*
    // INTERNAL METHODS
    */

    /// @dev factory for orders to be created with needed hash.
    /// @param contractAddress address of the calling contract, orders are unique to each contract
    /// @param orderAddresses array of 3 address. maker, taker, and feeRecipient
    /// @param unsignedOrderValues array of 5 unsigned integers. makerFee, takerFee, price, expirationTimeStamp and salt
    /// @param orderQty signed qty of the original order.
    function createOrder(
        address contractAddress,
        address[3] orderAddresses,
        uint[5] unsignedOrderValues,
        int orderQty
    ) internal pure returns (Order order)
    {
        order.maker = orderAddresses[0];
        order.taker = orderAddresses[1];
        order.feeRecipient = orderAddresses[2];
        order.makerFee = unsignedOrderValues[0];
        order.takerFee = unsignedOrderValues[1];
        order.price = unsignedOrderValues[2];
        order.expirationTimeStamp = unsignedOrderValues[3];
        order.qty = orderQty;
        order.orderHash = createOrderHash(
            contractAddress,
            orderAddresses,
            unsignedOrderValues,
            orderQty
        );
        return order;
    }

    // @dev increment our filled order mappings to avoid overfill
    // @param self storage struct
    // @param orderHash hashed value for order
    // @param filledQty amount to add to our mapping
    function addFilledQtyToOrder(OrderMappings storage self, bytes32 orderHash, int filledQty) internal {
        self.filledOrderQty[orderHash] = self.filledOrderQty[orderHash].add(filledQty);
    }

    // @dev increment our cancelled order mappings
    // @param self storage struct
    // @param orderHash hashed value for order
    // @param cancelledQty amount to add to our mapping
    function addCancelledQtyToOrder(OrderMappings storage self, bytes32 orderHash, int cancelledQty) internal {
        self.cancelledOrderQty[orderHash] = self.cancelledOrderQty[orderHash].add(cancelledQty);
    }
}

