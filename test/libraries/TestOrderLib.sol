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

import "truffle/Assert.sol";
import "../../contracts/libraries/OrderLib.sol";


/// @title TestOrderLib tests for all of our order helper functions
/// @author Phil Elsasser <phil@marketprotcol.io>
contract TestOrderLib {

    address private MAKER = 0x627306090abaB3A6e1400e9345bC60c78a8BEf57;
    address private TAKER = 0xf17f52151EbEF6C7334FAD080c5704D77216b732;
    address private FEE_RECIPIENT = 0xC5fdf4076b8F3A5357c5E395ab970B5B54098Fef;
    address private BAD_MAKER_ADDRESS = 0x2191eF87E392377ec08E7c08Eb105Ef5448eCED5;     //used to check against

    function testCreateOrder() public {
        address contractAddress = address(this);
        address[3] memory orderAddresses = [MAKER, TAKER, FEE_RECIPIENT];
        uint makerFee = 5;
        uint takerFee = 7;
        uint price = 275;
        uint expirationTimeStamp = now + 1 days;
        uint salt = 1;
        uint[5] memory unsignedValues = [makerFee, takerFee, price, expirationTimeStamp, salt];
        int orderQty = 50;
        OrderLib.Order memory order = OrderLib.createOrder(contractAddress, orderAddresses, unsignedValues, orderQty);

        Assert.equal(order.maker, MAKER, "maker of order should match maker supplied on instantiation");
        Assert.equal(order.taker, TAKER, "taker of order should match taker supplied on instantiation");
        Assert.equal(order.feeRecipient, FEE_RECIPIENT, "feeRecipient of order should match feeRecipient supplied on instantiation");
        Assert.equal(order.makerFee, makerFee, "makerFee of order should match makerFee supplied on instantiation");
        Assert.equal(order.takerFee, takerFee, "takerFee of order should match takerFee supplied on instantiation");
        Assert.equal(order.price, price, "price of order should match price supplied on instantiation");
        Assert.equal(order.expirationTimeStamp, expirationTimeStamp, "expirationTimeStamp of order should match expirationTimeStamp supplied on instantiation");
        Assert.equal(order.qty, orderQty, "qty of order should match qty supplied on instantiation");

        bytes32 orderHash = OrderLib.createOrderHash(contractAddress, orderAddresses, unsignedValues, orderQty);
        Assert.equal(order.orderHash, orderHash, "orderHash of order should match orderHash created on instantiation");

        unsignedValues[4] = salt + 1;
        bytes32 orderHashNewSalt = OrderLib.createOrderHash(contractAddress, orderAddresses, unsignedValues, orderQty);
        Assert.isTrue(order.orderHash != orderHashNewSalt, "orderHash of order should not match orderHash with a new salt");

        orderAddresses[0] = BAD_MAKER_ADDRESS;
        bytes32 orderHashDiffMaker = OrderLib.createOrderHash(contractAddress, orderAddresses, unsignedValues, orderQty);
        Assert.isTrue(order.orderHash != orderHashDiffMaker, "orderHash of order should not match orderHash with a diff maker");
    }
}
