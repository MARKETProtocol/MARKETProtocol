/**
 * Helper functions to make testing easier and more readable when perform trades.
 *
 * @param MarketContractOraclize
 * @param OrderLib
 * @return {Promise.<{
 *          tradeOrder: tradeOrder,
 *          cancelOrder: cancelOrder,
 *          settleOrder: settleOrder,
 *          calculateSettlementToken: calculateSettlementToken
 *         }>}
 */

const utility = require('../utility');

module.exports = async function(
  marketContract,
  orderLib,
  collateralToken,
  collateralPool,
  tradingHub
) {
  async function tradeOrder(
    [marketContractAddress, accountMaker, accountTaker, feeAccount],
    [orderPrice, orderQty, qtyToFill],
    isExpired = false,
    makerFee = 0,
    takerFee = 0
  ) {
    const timeStamp = new Date().getTime() / 1000 + 60 * (isExpired ? -5 : 5); // expires/expired 5 mins (ago)
    const orderAddresses = [marketContractAddress, accountMaker, accountTaker, feeAccount];
    const unsignedOrderValues = [makerFee, takerFee, orderPrice, timeStamp, 1];

    const orderHash = await orderLib._createOrderHash.call(
      orderAddresses,
      unsignedOrderValues,
      orderQty
    );
    const orderSignature = utility.signMessage(web3, accountMaker, orderHash);

    await tradingHub.tradeOrder(
      orderAddresses,
      unsignedOrderValues,
      orderQty,
      qtyToFill,
      orderSignature[0], // v
      orderSignature[1], // r
      orderSignature[2], // s
      { from: accountTaker }
    );
    return { orderHash, orderSignature, unsignedOrderValues };
  }

  async function cancelOrder(
    [marketContractAddress, accountMaker, accountTaker, feeAccount],
    [entryOrderPrice, orderQty, qtyToCancel],
    isExpired = false
  ) {
    const timeStamp = new Date().getTime() / 1000 + 60 * (isExpired ? -5 : 5); // expires/expired 5 mins (ago)
    const orderAddresses = [marketContractAddress, accountMaker, accountTaker, feeAccount];
    const unsignedOrderValues = [0, 0, entryOrderPrice, timeStamp, 1];
    const orderHash = await orderLib._createOrderHash.call(
      orderAddresses,
      unsignedOrderValues,
      orderQty
    );

    await tradingHub.cancelOrder(orderAddresses, unsignedOrderValues, orderQty, qtyToCancel);
    return { orderHash };
  }

  /**
   * Attempts to settle our testable market contract.  If a settlement price is entered that is above or below
   * the given PRICE_CAP or PRICE_FLOOR, this will force the contract into settlement.
   *
   * @param settlementPrice - price to attempt to settle contract with (must be above or below CAP / FLOOR)
   */
  async function attemptToSettleContract(settlementPrice) {
    await marketContract.updateLastPrice(settlementPrice);
  }

  /**
   * Calculates the amount of token to be settled to address for order at settlementPrice
   *
   * @param address
   * @param priceFloor
   * @param priceCap
   * @param qtyMultiplier
   * @param orderToFill
   * @param settlementPrice
   * @return {Promise.<void>}
   */
  async function calculateSettlementToken(
    address,
    priceFloor,
    priceCap,
    qtyMultiplier,
    orderQtyToFill,
    settlementPrice
  ) {
    const tokenBalanceOfUser = await collateralToken.balanceOf.call(address);
    const userAccountBalance = await collateralPool.getUserUnallocatedBalance.call(
      collateralToken.address,
      address
    );
    const collateralLeft = utility.calculateNeededCollateral(
      priceFloor,
      priceCap,
      qtyMultiplier,
      orderQtyToFill,
      settlementPrice
    );
    return tokenBalanceOfUser.plus(userAccountBalance).plus(collateralLeft);
  }

  return {
    tradeOrder,
    cancelOrder,
    attemptToSettleContract,
    calculateSettlementToken
  };
};
