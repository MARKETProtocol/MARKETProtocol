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

import "../libraries/OrderLib.sol";

/// @title OrderLibMock
/// Mock contract for library OrderLib.sol
/// OrderLibMock allows for direct calling of non-view library methods in solidity-coverage.
/// Functions are preceded by _ to indicate that they are a mock function and not
/// a function re-declaration.
contract OrderLibMock {
  using OrderLib for OrderLib.OrderMappings;
  using OrderLib for OrderLib.Order;

  function _getQtyFilledOrCancelledFromOrder(
      OrderLib.OrderMappings storage orderMappings,
      bytes32 orderHash
  ) internal view returns (int)
  {
      return OrderLib.getQtyFilledOrCancelledFromOrder(orderMappings, orderHash);
  }

  function _createOrderHash(
      address contractAddress,
      address[3] orderAddresses,
      uint[5] unsignedOrderValues,
      int orderQty
  ) public pure returns (bytes32)
  {
      return OrderLib.createOrderHash(
        contractAddress,
        orderAddresses,
        unsignedOrderValues,
        orderQty);
  }

  function _isValidSignature(
      address signerAddress,
      bytes32 hash,
      uint8 v,
      bytes32 r,
      bytes32 s
  ) public pure returns (bool)
  {
      return OrderLib.isValidSignature(
        signerAddress,
        hash,
        v,
        r,
        s);
  }

  function _createOrder(
      address contractAddress,
      address[3] orderAddresses,
      uint[5] unsignedOrderValues,
      int orderQty
  ) internal pure returns (OrderLib.Order order)
  {
      return OrderLib.createOrder(
        contractAddress,
        orderAddresses,
        unsignedOrderValues,
        orderQty);
  }

  function _addFilledQtyToOrder(OrderLib.OrderMappings storage orderMappings, bytes32 orderHash, int filledQty) internal {
      OrderLib.addFilledQtyToOrder(orderMappings, orderHash, filledQty);
  }

  function _addCancelledQtyToOrder(OrderLib.OrderMappings storage orderMappings, bytes32 orderHash, int cancelledQty) internal {
      OrderLib.addCancelledQtyToOrder(orderMappings, orderHash, cancelledQty);
  }

}
