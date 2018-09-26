const MarketContractOraclize = artifacts.require('TestableMarketContractOraclize');
const MarketCollateralPool = artifacts.require('MarketCollateralPool');
const MarketContractRegistry = artifacts.require('MarketContractRegistry');
const MarketToken = artifacts.require('MarketToken');
const CollateralToken = artifacts.require('CollateralToken');
const OrderLib = artifacts.require('OrderLibMock');
const Helpers = require('./helpers/Helpers.js');
const utility = require('./utility.js');

const ErrorCodes = {
  ORDER_EXPIRED: 0,
  ORDER_DEAD: 1
};

// basic tests for interacting with market contract.
contract('MarketContractOraclize', function(accounts) {
  let collateralPool;
  let marketToken;
  let marketContract;
  let marketContractRegistry;
  let collateralToken;
  let orderLib;
  let makerAccountBalanceBeforeTrade;
  let takerAccountBalanceBeforeTrade;
  let tradeHelper;
  const entryOrderPrice = 33025;
  const accountMaker = accounts[0];
  const accountTaker = accounts[1];

  beforeEach(async function() {
    marketToken = await MarketToken.deployed();
    marketContractRegistry = await MarketContractRegistry.deployed();
    var whiteList = await marketContractRegistry.getAddressWhiteList.call();
    marketContract = await MarketContractOraclize.at(whiteList[1]);
    collateralPool = await MarketCollateralPool.at(
      await marketContract.MARKET_COLLATERAL_POOL_ADDRESS.call()
    );
    orderLib = await OrderLib.deployed();
    collateralToken = await CollateralToken.deployed();
    tradeHelper = await Helpers.TradeHelper(
      marketContract,
      orderLib,
      collateralToken,
      collateralPool
    );
  });

  it('Trade occurs, cancel occurs, balances transferred, positions updated', async function() {
    const timeStamp = new Date().getTime() / 1000 + 60 * 5; // order expires 5 minute from now.
    const orderAddresses = [accountMaker, accountTaker, accounts[2]];
    const unsignedOrderValues = [0, 0, entryOrderPrice, timeStamp, 1];
    const orderQty = 5; // user is attempting to buy 5
    const orderHash = await orderLib._createOrderHash.call(
      marketContract.address,
      orderAddresses,
      unsignedOrderValues,
      orderQty
    );

    // transfer half of the collateral tokens to the second account.
    initBalance = await collateralToken.INITIAL_SUPPLY.call().valueOf();
    const balanceToTransfer = initBalance / 2;
    await collateralToken.transfer(accounts[1], balanceToTransfer, { from: accounts[0] });

    // create approval and deposit collateral tokens for trading.
    const amountToDeposit = 5000000;
    await collateralToken.approve(collateralPool.address, amountToDeposit, { from: accounts[0] });
    await collateralToken.approve(collateralPool.address, amountToDeposit, { from: accounts[1] });

    // move tokens to the collateralPool
    await collateralPool.depositTokensForTrading(collateralToken.address, amountToDeposit, { from: accounts[0] });
    await collateralPool.depositTokensForTrading(collateralToken.address, amountToDeposit, { from: accounts[1] });

    makerAccountBalanceBeforeTrade = await collateralPool.getUserUnallocatedBalance.call(collateralToken.address,
      accounts[0]
    );
    takerAccountBalanceBeforeTrade = await collateralPool.getUserUnallocatedBalance.call(collateralToken.address,
      accounts[1]
    );

    // Execute trade between maker and taker for partial amount of order.
    const qtyToFill = 1;
    const orderSignature = utility.signMessage(web3, accountMaker, orderHash);
    await marketContract.tradeOrder(
      orderAddresses,
      unsignedOrderValues,
      orderQty, // qty is five
      qtyToFill, // let us fill a one lot
      orderSignature[0], // v
      orderSignature[1], // r
      orderSignature[2], // s
      { from: accountTaker }
    );

    const makerNetPos = await collateralPool.getUserNetPosition.call(marketContract.address, accountMaker);
    const takerNetPos = await collateralPool.getUserNetPosition.call(marketContract.address, accountTaker);
    assert.equal(makerNetPos.toNumber(), 1, 'Maker should be long 1');
    assert.equal(takerNetPos.toNumber(), -1, 'Taker should be short 1');

    const qtyFilled = await marketContract.getQtyFilledOrCancelledFromOrder.call(orderHash);
    assert.equal(qtyFilled.toNumber(), 1, "Fill Qty doesn't match expected");

    await marketContract.cancelOrder(orderAddresses, unsignedOrderValues, 5, 1); //cancel part of order
    const qtyFilledOrCancelled = await marketContract.getQtyFilledOrCancelledFromOrder.call(
      orderHash
    );
    assert.equal(
      qtyFilledOrCancelled.toNumber(),
      2,
      "Fill Or Cancelled Qty doesn't match expected"
    );

    // after the execution we should have collateral transferred from users to the pool, check all balances
    // here.
    const priceFloor = await marketContract.PRICE_FLOOR.call();
    const priceCap = await marketContract.PRICE_CAP.call();
    const qtyMultiplier = await marketContract.QTY_MULTIPLIER.call();
    const actualCollateralPoolBalance = await collateralPool.getCollateralPoolBalance.call(marketContract.address);

    const longCollateral = (entryOrderPrice - priceFloor) * qtyMultiplier * qtyToFill;
    const shortCollateral = (priceCap - entryOrderPrice) * qtyMultiplier * qtyToFill;
    const totalExpectedCollateralBalance = longCollateral + shortCollateral;

    assert.equal(
      totalExpectedCollateralBalance,
      actualCollateralPoolBalance,
      "Collateral pool isn't funded correctly"
    );

    const makerAccountBalanceAfterTrade = await collateralPool.getUserUnallocatedBalance.call(collateralToken.address,
      accounts[0]
    );
    const takerAccountBalanceAfterTrade = await collateralPool.getUserUnallocatedBalance.call(collateralToken.address,
      accounts[1]
    );

    assert.equal(
      makerAccountBalanceAfterTrade,
      makerAccountBalanceBeforeTrade - longCollateral,
      'Maker balance is wrong'
    );
    assert.equal(
      takerAccountBalanceAfterTrade,
      takerAccountBalanceBeforeTrade - shortCollateral,
      'Taker balance is wrong'
    );
  });

  const exitOrderPrice = 36025;
  it('Trade is unwound, correct collateral amount returns to user balances', async function() {
    const orderAddresses = [accountMaker, accountTaker, accounts[2]];
    const orderPrice = 36025;
    const orderQty = -5; // user is attempting to sell -5

    // Execute trade between maker and taker for partial amount of order.
    const qtyToFill = -1;
    const { orderHash, unsignedOrderValues } = await tradeHelper.tradeOrder(orderAddresses, [
      orderPrice,
      orderQty,
      qtyToFill
    ]);

    const makerNetPos = await collateralPool.getUserNetPosition.call(marketContract.address, accountMaker);
    const takerNetPos = await collateralPool.getUserNetPosition.call(marketContract.address, accountTaker);
    assert.equal(makerNetPos.toNumber(), 0, 'Maker should be flat');
    assert.equal(takerNetPos.toNumber(), 0, 'Taker should be flat');

    const qtyFilled = await marketContract.getQtyFilledOrCancelledFromOrder.call(orderHash);
    assert.equal(qtyFilled.toNumber(), -1, "Fill Qty doesn't match expected");

    await marketContract.cancelOrder(orderAddresses, unsignedOrderValues, -5, -1); //cancel part of order
    const qtyFilledOrCancelled = await marketContract.getQtyFilledOrCancelledFromOrder.call(
      orderHash
    );
    assert.equal(
      qtyFilledOrCancelled.toNumber(),
      -2,
      "Fill Or Cancelled Qty doesn't match expected"
    );

    // after the execution we should have collateral transferred from pool to the users since they are now flat!
    const actualCollateralPoolBalance = await collateralPool.getCollateralPoolBalance.call(marketContract.address);
    assert.equal(
      actualCollateralPoolBalance.toNumber(),
      0,
      'Collateral pool should be completely empty'
    );

    const makerAccountBalanceAfterTrade = await collateralPool.getUserUnallocatedBalance.call(
      collateralToken.address,
      accounts[0]
    );
    const takerAccountBalanceAfterTrade = await collateralPool.getUserUnallocatedBalance.call(
      collateralToken.address,
      accounts[1]
    );
    const qtyMultiplier = await marketContract.QTY_MULTIPLIER.call();
    const profitForMaker = (exitOrderPrice - entryOrderPrice) * qtyMultiplier;

    assert.equal(
      makerAccountBalanceAfterTrade - makerAccountBalanceBeforeTrade,
      profitForMaker,
      "Maker balance is wrong - profit amount doesn't make sense"
    );
    assert.equal(
      takerAccountBalanceAfterTrade - takerAccountBalanceBeforeTrade,
      profitForMaker * -1,
      "Taker balance is wrong - loss amount doesn't make sense"
    );
  });

  it('should only allow remaining quantity to be filled for an overfilled trade.', async function() {
    const timeStamp = new Date().getTime() / 1000 + 60 * 5; // order expires 5 minute from now.
    const orderAddresses = [accountMaker, accountTaker, accounts[2]];
    const unsignedOrderValues = [0, 0, entryOrderPrice, timeStamp, 1];
    const orderQty = 5; // user is attempting to buy 5
    const qtyToFill = 10; // order is to be filled by 10
    const orderHash = await orderLib._createOrderHash.call(
      marketContract.address,
      orderAddresses,
      unsignedOrderValues,
      orderQty
    );

    const expectedQtyFilled = 5;

    // Execute trade between maker and taker for overfilled amount of order.
    const orderSignature = utility.signMessage(web3, accountMaker, orderHash);
    const actualQtyFilled = await marketContract.tradeOrder.call(
      orderAddresses,
      unsignedOrderValues,
      orderQty, // 5
      qtyToFill, // 10
      orderSignature[0], // v
      orderSignature[1], // r
      orderSignature[2], // s
      { from: accountTaker }
    );

    assert.equal(
      expectedQtyFilled,
      actualQtyFilled.toNumber(),
      "Quantity filled doesn't match expected"
    );
  });

  it('should only allow remaining quantity to be cancelled for an over cancelled trade.', async function() {
    const orderAddresses = [accountMaker, accountTaker, accounts[2]];
    const orderQty = -5; // user is attempting to sell 5
    const qtyToFill = -1; // order is to be filled by 1

    // Execute trade between maker and taker for partial amount of order.
    const { unsignedOrderValues } = await tradeHelper.tradeOrder(orderAddresses, [
      entryOrderPrice,
      orderQty,
      qtyToFill
    ]);

    const expectedQtyCancelled = -4;
    const qtyToCancel = -7;
    // over cancel order
    const actualQtyCancelled = await marketContract.cancelOrder.call(
      orderAddresses,
      unsignedOrderValues,
      orderQty,
      qtyToCancel
    );

    assert.equal(
      expectedQtyCancelled,
      actualQtyCancelled.toNumber(),
      "Quantity cancelled doesn't match expected."
    );
  });

  it('should fail for attempts to fill expired order', async function() {
    const isExpired = true;
    const orderQty = 5; // user is attempting to buy 5
    const qtyToFill = 1; // order is to be filled by 1

    // Execute trade between maker and taker for partial amount of order.
    const { orderHash } = await tradeHelper.tradeOrder(
      [accountMaker, accountTaker, accounts[2]],
      [entryOrderPrice, orderQty, qtyToFill],
      isExpired
    );

    const events = await utility.getEvent(marketContract, 'Error');
    assert.equal(
      ErrorCodes.ORDER_EXPIRED,
      events[0].args.errorCode.toNumber(),
      'Error event is not order expired.'
    );

    const orderQtyFilled = await marketContract.getQtyFilledOrCancelledFromOrder.call(orderHash);
    assert.equal(0, orderQtyFilled.toNumber(), 'Quantity filled is not zero.');
  });

  it('should fail for attempts to cancel expired order', async function() {
    const isExpired = true;
    const orderQty = 5; // user is attempting to buy 5
    const qtyToCancel = 1;

    // Execute trade between maker and taker for partial amount of order.
    const { orderHash } = await tradeHelper.cancelOrder(
      [accountMaker, accountTaker, accounts[2]],
      [entryOrderPrice, orderQty, qtyToCancel],
      isExpired
    );

    const events = await utility.getEvent(marketContract, 'Error');
    assert.equal(
      ErrorCodes.ORDER_EXPIRED,
      events[0].args.errorCode.toNumber(),
      'Error event is not order expired.'
    );

    const orderQtyFilled = await marketContract.getQtyFilledOrCancelledFromOrder.call(orderHash);
    assert.equal(0, orderQtyFilled.toNumber(), 'Quantity cancelled is not zero.');
  });

  it('should fail for attempts to trade zero quantity', async function() {
    const expiredTimestamp = new Date().getTime() / 1000 + 60 * 5; // order expires in 5 minutes.
    const orderAddresses = [accountMaker, accountTaker, accounts[2]];
    const unsignedOrderValues = [0, 0, entryOrderPrice, expiredTimestamp, 1];
    const zeroOrderQty = 0;
    const qtyToFill = 4;
    const orderHash = await orderLib._createOrderHash.call(
      marketContract.address,
      orderAddresses,
      unsignedOrderValues,
      zeroOrderQty
    );

    // Execute trade between maker and taker for partial amount of order.
    const orderSignature = utility.signMessage(web3, accountMaker, orderHash);
    let error = null;
    try {
      await marketContract.tradeOrder.call(
        orderAddresses,
        unsignedOrderValues,
        zeroOrderQty, // 5
        qtyToFill, // fill one slot
        orderSignature[0], // v
        orderSignature[1], // r
        orderSignature[2], // s
        { from: accountTaker }
      );
    } catch (err) {
      error = err;
    }

    assert.ok(error instanceof Error, 'Zero Quantity order did not fail');
  });

  it('should fail for attempts to create maker order and fill as taker from same account', async function() {
    const expiredTimestamp = new Date().getTime() / 1000 + 60 * 5; // order expires in 5 minutes.
    const makerAndTakerAccount = accountMaker; // same address for maker and taker
    const orderAddresses = [makerAndTakerAccount, makerAndTakerAccount, accounts[2]];
    const unsignedOrderValues = [0, 0, entryOrderPrice, expiredTimestamp, 1];
    const orderQty = 5;
    const qtyToFill = 1; // order is to be filled by 1
    const orderHash = await orderLib._createOrderHash.call(
      marketContract.address,
      orderAddresses,
      unsignedOrderValues,
      orderQty
    );

    // Execute trade between maker and taker for partial amount of order.
    const orderSignature = utility.signMessage(web3, accountMaker, orderHash);
    let error = null;
    try {
      await marketContract.tradeOrder.call(
        orderAddresses,
        unsignedOrderValues,
        orderQty, // 5
        qtyToFill, // fill one slot
        orderSignature[0], // v
        orderSignature[1], // r
        orderSignature[2], // s
        { from: accountTaker }
      );
    } catch (err) {
      error = err;
    }
    assert.ok(error instanceof Error, 'Order did not fail');
  });

  it('should fail for attempts to self-trade', async function() {
    const expiredTimestamp = new Date().getTime() / 1000 + 60 * 5;
    const orderAddresses = [accountMaker, null, accounts[2]];
    const unsignedOrderValues = [0, 0, entryOrderPrice, expiredTimestamp, 1];
    const orderQty = 5;
    const qtyToFill = 1;
    const orderHash = await orderLib._createOrderHash.call(
      marketContract.address,
      orderAddresses,
      unsignedOrderValues,
      orderQty
    );

    const orderSignature = utility.signMessage(web3, accountMaker, orderHash);
    let error = null;
    try {
      await marketContract.tradeOrder.call(
        orderAddresses,
        unsignedOrderValues,
        orderQty,
        qtyToFill,
        orderSignature[0],
        orderSignature[1],
        orderSignature[2],
        { from: accountMaker }
      );
    } catch (err) {
      error = err;
    }
    assert.ok(error instanceof Error, 'Order did not fail');
  });

  it('should fail for attempts to order and fill with price changed', async function() {
    const expiredTimestamp = new Date().getTime() / 1000 + 60 * 5; // order expires in 5 minutes.
    const orderAddresses = [accountMaker, accountTaker, accounts[2]];
    const unsignedOrderValues = [0, 0, entryOrderPrice, expiredTimestamp, 1];
    const orderQty = 5;
    const qtyToFill = 1; // order is to be filled by 1
    const orderHash = await orderLib._createOrderHash.call(
      marketContract.address,
      orderAddresses,
      unsignedOrderValues,
      orderQty
    );

    const changedOrderPrice = entryOrderPrice + 500;
    const changedUnsignedOrderValues = [0, 0, changedOrderPrice, expiredTimestamp, 1];

    // Execute trade between maker and taker for partial amount of order.
    const orderSignature = utility.signMessage(web3, accountMaker, orderHash);
    let error = null;
    try {
      await marketContract.tradeOrder.call(
        orderAddresses,
        changedUnsignedOrderValues,
        orderQty, // 5
        qtyToFill, // fill one slot
        orderSignature[0], // v
        orderSignature[1], // r
        orderSignature[2], // s
        { from: accountTaker }
      );
    } catch (err) {
      error = err;
    }

    assert.ok(error instanceof Error, 'Order did not fail');
  });

  it('should fail for attempt to cancel twice full qty', async function() {
    const orderQty = 2;
    const orderToCancel = 2;

    await tradeHelper.cancelOrder(
      [accounts[0], accounts[1], accounts[2]],
      [entryOrderPrice, orderQty, orderToCancel]
    );

    await tradeHelper.cancelOrder(
      [accounts[0], accounts[1], accounts[2]],
      [entryOrderPrice, orderQty, orderToCancel]
    );

    const events = await utility.getEvent(marketContract, 'Error');
    assert.equal(
      ErrorCodes.ORDER_DEAD,
      events[0].args.errorCode.toNumber(),
      'Error event is not order dead.'
    );
  });

  it('should fail for attempt to trade after settlement', async function() {
    const orderQty = 2;
    const orderToFill = 2;
    const settlementPrice = await marketContract.PRICE_FLOOR() - 1;
    const isExpired = true;
    await tradeHelper.tradeOrder(
      [accounts[0], accounts[1], accounts[2]],
      [entryOrderPrice, orderQty, orderToFill],
      isExpired
    );

    await tradeHelper.attemptToSettleContract(settlementPrice);
    assert.isTrue(await marketContract.isSettled(), "Contract not settled properly");

    let error;
    try {
      await tradeHelper.tradeOrder(
        [accounts[0], accounts[1], accounts[2]],
        [entryOrderPrice, orderQty, orderToFill]
      );
    } catch (err) {
      error = err;
    }

    assert.ok(error instanceof Error, 'tradeOrder() should fail after settlement');
  });

  it('should fail for attempt to call Oraclize callback', async function() {
    let error;
    try {
      await marketContract._callback.call();
    } catch (err) {
      error = err;
    }

    assert.ok(error instanceof Error, 'Oraclize callback should fail if not called by Oraclize');
  });

  it('should fail for attempt to self-trade', async function() {
    const orderQty = 2;
    const orderToFill = 2;

    let error;
    try {
      await tradeHelper.tradeOrder(
        [accounts[0], accounts[0], accounts[2]],
        [entryOrderPrice, orderQty, orderToFill]
      );
    } catch (err) {
      error = err;
    }

    assert.ok(error instanceof Error, 'tradeOrder() should fail for self-trade attempt');
  });

  it('should fail for attempt to cancel after settlement', async function() {
    const orderQty = 2;
    const orderToCancel = 1;
    const settlementPrice = await marketContract.PRICE_FLOOR() - 1;

    await tradeHelper.attemptToSettleContract(settlementPrice);
    assert.isTrue(await marketContract.isSettled(), "Contract not settled properly");

    let error;
    try {
      await tradeHelper.cancelOrder(
        [accounts[0], accounts[1], accounts[2]],
        [entryOrderPrice, orderQty, orderToCancel]
      );
    } catch (err) {
      error = err;
    }

    assert.ok(error instanceof Error, 'cancelOrder() should fail after settlement');
  });
});

contract('MarketContractOraclize.Fees', function(accounts) {
  let orderLib;
  let tradeHelper;
  let collateralPool;
  let collateralToken;
  let marketToken;
  let marketContract;
  let marketContractRegistry;

  let collateralPoolBalanceBeforeTrade;
  let makerAccountBalanceBeforeTrade;
  let takerAccountBalanceBeforeTrade;
  let feeRecipientAccountBalanceBeforeTrade;

  let collateralPoolBalanceAfterTrade;
  let makerAccountBalanceAfterTrade;
  let takerAccountBalanceAfterTrade;
  let feeRecipientAccountBalanceAfterTrade;

  const accountMaker = accounts[0];
  const accountTaker = accounts[1];
  const accountFeeRecipient = accounts[2];

  beforeEach(async function() {
    collateralPoolBalanceBeforeTrade = await collateralPool.getCollateralPoolBalance.call(marketContract.address);
    makerAccountBalanceBeforeTrade = await collateralPool.getUserUnallocatedBalance.call(
      collateralToken.address,
      accountMaker
    );
    takerAccountBalanceBeforeTrade = await collateralPool.getUserUnallocatedBalance.call(
      collateralToken.address,
      accountTaker
    );
    feeRecipientAccountBalanceBeforeTrade = await marketToken.balanceOf.call(accountFeeRecipient);
  });

  before(async function() {
    marketToken = await MarketToken.deployed();
    marketContractRegistry = await MarketContractRegistry.deployed();
    var whiteList = await marketContractRegistry.getAddressWhiteList.call();
    marketContract = await MarketContractOraclize.at(whiteList[1]);
    collateralPool = await MarketCollateralPool.at(
      await marketContract.MARKET_COLLATERAL_POOL_ADDRESS.call()
    );
    orderLib = await OrderLib.deployed();
    collateralToken = await CollateralToken.deployed();
    tradeHelper = await Helpers.TradeHelper(
      marketContract,
      orderLib,
      collateralToken,
      collateralPool
    );

    // transfer half of the collateral tokens to the second account.
    initBalance = await collateralToken.INITIAL_SUPPLY.call().valueOf();
    const balanceToTransfer = initBalance / 2;
    await collateralToken.transfer(accountTaker, balanceToTransfer, { from: accountMaker });

    // create approval and deposit collateral tokens for trading.
    const amountToDeposit = 5000000;
    await collateralToken.approve(collateralPool.address, amountToDeposit, { from: accountMaker });
    await collateralToken.approve(collateralPool.address, amountToDeposit, { from: accountTaker });

    // move tokens to the collateralPool
    await collateralPool.depositTokensForTrading(collateralToken.address, amountToDeposit, { from: accountMaker });
    await collateralPool.depositTokensForTrading(collateralToken.address, amountToDeposit, { from: accountTaker });

    // provide taker with MKT to pay fee and approve spend of fees.
    await marketToken.transfer(accountTaker, 1000, { from: accountMaker });
    await marketToken.approve(marketContract.address, 1000, { from: accountMaker });
    await marketToken.approve(marketContract.address, 1000, { from: accountTaker });
  });

  async function collectBalancesAfterTrade() {
    collateralPoolBalanceAfterTrade = await collateralPool.getCollateralPoolBalance.call(marketContract.address);
    makerAccountBalanceAfterTrade = await collateralPool.getUserUnallocatedBalance.call(
      collateralToken.address,
      accountMaker
    );
    takerAccountBalanceAfterTrade = await collateralPool.getUserUnallocatedBalance.call(
      collateralToken.address,
      accountTaker
    );
    feeRecipientAccountBalanceAfterTrade = await marketToken.balanceOf.call(accountFeeRecipient);
  }

  async function executeTradeWithFees(makerFee, takerFee) {
    const orderQty = 2;
    const qtyToFill = 2;
    const orderPrice = 100;
    const orderAddresses = [accountMaker, accountTaker, accountFeeRecipient];

    const { orderHash, unsignedOrderValues } = await tradeHelper.tradeOrder(
      orderAddresses,
      [orderPrice, orderQty, qtyToFill],
      false,
      makerFee,
      takerFee
    );

    return orderHash;
  }

  it('maker and taker should pay zero MKT token fees when fees are zero', async function() {
    let orderHash = await executeTradeWithFees(0, 0);
    await collectBalancesAfterTrade();

    const qtyFilled = await marketContract.getQtyFilledOrCancelledFromOrder.call(orderHash);
    assert.equal(qtyFilled.toNumber(), 2, "Fill Qty doesn't match expected");

    assert.equal(
      feeRecipientAccountBalanceBeforeTrade.toNumber(),
      feeRecipientAccountBalanceAfterTrade.toNumber(),
      'Fee recipient balance differs after trade'
    );
  });

  it('maker pays the correct fee amount', async function() {
    let orderHash = await executeTradeWithFees(1, 0);
    await collectBalancesAfterTrade();

    const qtyFilled = await marketContract.getQtyFilledOrCancelledFromOrder.call(orderHash);
    assert.equal(qtyFilled.toNumber(), 2, "Fill Qty doesn't match expected");

    assert.equal(
      feeRecipientAccountBalanceBeforeTrade.toNumber(),
      feeRecipientAccountBalanceAfterTrade.toNumber() - 1,
      'Fee recipient did not receive fee'
    );
  });

  it('taker pays the correct fee amount', async function() {
    let orderHash = await executeTradeWithFees(0, 1);
    await collectBalancesAfterTrade();

    const qtyFilled = await marketContract.getQtyFilledOrCancelledFromOrder.call(orderHash);
    assert.equal(qtyFilled.toNumber(), 2, "Fill Qty doesn't match expected");

    assert.equal(
      feeRecipientAccountBalanceBeforeTrade.toNumber(),
      feeRecipientAccountBalanceAfterTrade.toNumber() - 1,
      'Fee recipient did not receive fee'
    );
  });

  it('maker and taker pay MKT fees', async function() {
    let orderHash = await executeTradeWithFees(1, 1);
    await collectBalancesAfterTrade();

    const qtyFilled = await marketContract.getQtyFilledOrCancelledFromOrder.call(orderHash);
    assert.equal(qtyFilled.toNumber(), 2, "Fill Qty doesn't match expected");

    assert.equal(
      feeRecipientAccountBalanceBeforeTrade.toNumber(),
      feeRecipientAccountBalanceAfterTrade.toNumber() - 2,
      'Fee recipient did not receive fee'
    );
  });

  it('fails if fee greater than balance', async function() {
    try {
      await executeTradeWithFees(makerAccountBalanceBeforeTrade + 1, 0);
    } catch (err) {
      error = err;
    }
    assert.ok(error instanceof Error, 'Fees greater than balance are possible');
  });

  it('fails if maker fee is negative', async function() {
    try {
      await executeTradeWithFees(-1, 0);
    } catch (err) {
      error = err;
    }
    assert.ok(error instanceof Error, 'Negative maker fees are possible');
  });

  it('fails if taker fee is negative', async function() {
    try {
      await executeTradeWithFees(0, -1);
    } catch (err) {
      error = err;
    }
    assert.ok(error instanceof Error, 'Negative taker fees are possible');
  });
});
