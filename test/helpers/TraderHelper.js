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

module.exports = async function(MarketContractOraclize, OrderLib, CollateralToken, CollateralPool) {
  const marketContract = await MarketContractOraclize.deployed();
  const orderLib = await OrderLib.deployed();
  const collateralToken = await CollateralToken.deployed();
  const collateralPool = await CollateralPool.deployed();

  async function tradeOrder(
    [accountMaker, accountTaker, feeAccount],
    [orderPrice, orderQty, qtyToFill],
    isExpired = false,
    makerFee = 0,
    takerFee = 0
  ) {
    const timeStamp = new Date().getTime() / 1000 + 60 * (isExpired ? -5 : 5); // expires/expired 5 mins (ago)
    const orderAddresses = [accountMaker, accountTaker, feeAccount];
    const unsignedOrderValues = [makerFee, takerFee, orderPrice, timeStamp, 1];
    const orderHash = await orderLib.createOrderHash.call(
      MarketContractOraclize.address,
      orderAddresses,
      unsignedOrderValues,
      orderQty
    );

    const orderSignature = utility.signMessage(web3, accountMaker, orderHash);
    await marketContract.tradeOrder(
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
    [accountMaker, accountTaker, feeAccount],
    [entryOrderPrice, orderQty, qtyToCancel],
    isExpired = false
  ) {
    const timeStamp = new Date().getTime() / 1000 + 60 * (isExpired ? -5 : 5); // expires/expired 5 mins (ago)
    const orderAddresses = [accountMaker, accountTaker, feeAccount];
    const unsignedOrderValues = [0, 0, entryOrderPrice, timeStamp, 1];
    const orderHash = await orderLib.createOrderHash.call(
      MarketContractOraclize.address,
      orderAddresses,
      unsignedOrderValues,
      orderQty
    );

    await marketContract.cancelOrder(orderAddresses, unsignedOrderValues, orderQty, qtyToCancel);
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
    const userAccountBalance = await collateralPool.getUserAccountBalance.call(address);
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
