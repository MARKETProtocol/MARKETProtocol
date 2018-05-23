pragma solidity ^0.4.23;

import "../libraries/OrderLib.sol";

/// @title OrderLibMock
/// Mock contract for library OrderLib.sol
/// OrderLibMock allows for direct calling of non-view library methods.
/// functions are preceded by _ to indicate that they are a mock function and not
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
