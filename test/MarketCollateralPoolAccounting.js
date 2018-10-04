const MarketContractOraclize = artifacts.require('TestableMarketContractOraclize');
const MarketCollateralPool = artifacts.require('MarketCollateralPool');
const MarketContractRegistry = artifacts.require('MarketContractRegistry');
const CollateralToken = artifacts.require('CollateralToken');
const MarketToken = artifacts.require('MarketToken');
const OrderLib = artifacts.require('OrderLibMock');
const Helpers = require('./helpers/Helpers.js');
const utility = require('./utility.js');

// basic tests to ensure MarketCollateralPool works and is set up to allow trading
contract('MarketCollateralPool.Accounting', function(accounts) {
  let collateralToken;
  let initBalance;
  let collateralPool;
  let marketContract;
  let marketContractRegistry;
  let marketToken;
  let orderLib;
  let qtyMultiplier;
  let priceFloor;
  let priceCap;
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
    qtyMultiplier = await marketContract.QTY_MULTIPLIER.call();
    priceFloor = await marketContract.PRICE_FLOOR.call();
    priceCap = await marketContract.PRICE_CAP.call();

    tradeHelper = await Helpers.TradeHelper(
      marketContract,
      orderLib,
      collateralToken,
      collateralPool
    );
  });

  it('Both accounts should be able to deposit to collateral pool contract', async function() {
    initBalance = await collateralToken.INITIAL_SUPPLY.call().valueOf();
    fourBalance = 10000;
    // transfer half of balance to second account
    const balanceToTransfer = initBalance / 2;
    await collateralToken.transfer(accounts[1], balanceToTransfer, { from: accounts[0] });
    await collateralToken.transfer(accounts[3], fourBalance, { from: accounts[0] });

    let error = null;
    try {
      await collateralPool.depositTokensForTrading(500, { from: accounts[5] });
    } catch (err) {
      error = err;
    }

    assert.ok(error instanceof Error, 'should not be able to deposit tokens until enabled');

    // currently the Market Token is deployed with no qty need to trade, so all accounts should
    // be enabled.
    const isAllowedToTradeAcctOne = await marketToken.isUserEnabledForContract.call(
      marketContract.address,
      accounts[0]
    );
    const isAllowedToTradeAcctTwo = await marketToken.isUserEnabledForContract.call(
      marketContract.address,
      accounts[1]
    );
    const isAllowedToTradeAcctFour = await marketToken.isUserEnabledForContract.call(
      marketContract.address,
      accounts[3]
    );
    await marketToken.setLockQtyToAllowTrading(10);
    error = null;

    try {
      await collateralPool.depositTokensForTrading(fourBalance, { from: accounts[3] });
    } catch (err) {
      error = err;
    }
    assert.ok(error instanceof Error, 'should not be able to deposit tokens until APPROVED');
    await marketToken.setLockQtyToAllowTrading(0);

    assert.isTrue(isAllowedToTradeAcctOne, "account isn't able to trade!");
    assert.isTrue(isAllowedToTradeAcctTwo, "account isn't able to trade!");
    assert.isTrue(isAllowedToTradeAcctFour, "account isn't able to trade!");

    const amountToDeposit = 5000000;
    // create approval for main contract to move tokens!
    await collateralToken.approve(collateralPool.address, amountToDeposit, { from: accounts[0] });
    await collateralToken.approve(collateralPool.address, amountToDeposit, { from: accounts[1] });
    await collateralToken.approve(collateralPool.address, fourBalance, { from: accounts[3] });

    // move tokens to the collateralPool
    await collateralPool.depositTokensForTrading(amountToDeposit, { from: accounts[0] });
    await collateralPool.depositTokensForTrading(amountToDeposit, { from: accounts[1] });
    await collateralPool.depositTokensForTrading(fourBalance, { from: accounts[3] });

    // trigger requires
    error = null;
    try {
      await collateralPool.depositTokensForTrading(amountToDeposit, { from: accounts[2] });
    } catch (err) {
      error = err;
    }
    assert.ok(error instanceof Error, 'should not be able to deposit tokens');

    error = null;
    try {
      await collateralPool.settleAndClose({ from: accounts[2] });
    } catch (err) {
      error = err;
    }
    assert.ok(error instanceof Error, 'should not be able call settleAndClose until settled');
    // end trigger requires

    // ensure balances are now inside the contract.
    const tradingBalanceAcctOne = await collateralPool.getUserAccountBalance.call(accounts[0]);
    const tradingBalanceAcctTwo = await collateralPool.getUserAccountBalance.call(accounts[1]);
    const tradingBalanceAcctFour = await collateralPool.getUserAccountBalance.call(accounts[3]);
    assert.equal(tradingBalanceAcctOne, amountToDeposit, "Balance doesn't equal tokens deposited");
    assert.equal(tradingBalanceAcctTwo, amountToDeposit, "Balance doesn't equal tokens deposited");
    assert.equal(tradingBalanceAcctFour, fourBalance, "4 Balance doesn't equal tokens deposited");
  });

  it('Reducing a position works correctly', async function() {

    const timeStamp = new Date().getTime() / 1000 + 60 * 5; // order expires 5 minute from now.
    const orderAddresses = [accountMaker, accountTaker, accounts[2]];
    const unsignedOrderValues = [0, 0, entryOrderPrice, timeStamp, 1];
    const secondEntryOrderPrice = entryOrderPrice - 100;
    const secondUnsignedOrderValues = [0, 0, secondEntryOrderPrice, timeStamp, 1]; // second order with new price.
    var orderQty = 2;

    // set up 2 different trades to create initial positions
    const orderHash = await orderLib._createOrderHash.call(
      marketContract.address,
      orderAddresses,
      unsignedOrderValues,
      orderQty
    );

    const secondOrderHash = await orderLib._createOrderHash.call(
      marketContract.address,
      orderAddresses,
      secondUnsignedOrderValues,
      orderQty
    );


    // create approval and deposit collateral tokens for trading.
    const amountToDeposit = 5000000;
    await collateralToken.approve(collateralPool.address, amountToDeposit, { from: accounts[0] });
    await collateralToken.approve(collateralPool.address, amountToDeposit, { from: accounts[1] });

    // move tokens to the collateralPool
    await collateralPool.depositTokensForTrading(amountToDeposit, { from: accounts[0] });
    await collateralPool.depositTokensForTrading(amountToDeposit, { from: accounts[1] });

    makerAccountBalanceBeforeTrade = await collateralPool.getUserAccountBalance.call(
      accounts[0]
    );
    takerAccountBalanceBeforeTrade = await collateralPool.getUserAccountBalance.call(
      accounts[1]
    );

    // Execute trade between maker and taker
    var qtyToFill = 1;
    var orderSignature = utility.signMessage(web3, accountMaker, orderHash);
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

    var makerNetPos = await collateralPool.getUserNetPosition.call(accountMaker);
    var takerNetPos = await collateralPool.getUserNetPosition.call(accountTaker);
    assert.equal(makerNetPos.toNumber(), 1, 'Maker should be long 1');
    assert.equal(takerNetPos.toNumber(), -1, 'Taker should be short 1');

    var makerPosCount = await collateralPool.getUserPositionCount.call(accountMaker);
    var takerPosCount = await collateralPool.getUserPositionCount.call(accountTaker);
    assert.equal(makerPosCount.toNumber(), 1, 'Maker should have one position struct');
    assert.equal(takerPosCount.toNumber(), 1, 'Taker should have one position struct');

    var makerPos = await collateralPool.getUserPosition.call(accountMaker, 0);
    var takerPos = await collateralPool.getUserPosition.call(accountTaker, 0);

    assert.equal(
      makerPos[0].toNumber(),
      entryOrderPrice,
      'Maker should have one position from entryOrderPrice'
    );

    assert.equal(
      takerPos[0].toNumber(),
      entryOrderPrice,
      'Maker should have one position from entryOrderPrice'
    );

    assert.equal(makerPos[1].toNumber(), 1, 'Maker should have one position, long +1');
    assert.equal(takerPos[1].toNumber(), -1, 'Taker should have one position, short -1');

    // Create a second position, from a new price.
    qtyToFill = 2;
    orderSignature = utility.signMessage(web3, accountMaker, secondOrderHash);
    await marketContract.tradeOrder(
      orderAddresses,
      secondUnsignedOrderValues,
      orderQty,
      qtyToFill,
      orderSignature[0], // v
      orderSignature[1], // r
      orderSignature[2], // s
      { from: accountTaker }
    );

    makerNetPos = await collateralPool.getUserNetPosition.call(accountMaker);
    takerNetPos = await collateralPool.getUserNetPosition.call(accountTaker);
    assert.equal(makerNetPos.toNumber(), 3, 'Maker should be long 3');
    assert.equal(takerNetPos.toNumber(), -3, 'Taker should be short 3');

    makerPosCount = await collateralPool.getUserPositionCount.call(accountMaker);
    takerPosCount = await collateralPool.getUserPositionCount.call(accountTaker);
    assert.equal(makerPosCount.toNumber(), 2, 'Maker should have 2 position structs');
    assert.equal(takerPosCount.toNumber(), 2, 'Taker should have 2 position structs');

    var makerLastPosition = await collateralPool.getUserPosition.call(accountMaker, 1);
    assert.equal(makerLastPosition[0].toNumber(), secondEntryOrderPrice, 'Maker should be long 2 from secondEntryOrderPrice');
    assert.equal(makerLastPosition[1].toNumber(), qtyToFill, 'Maker should be long 2 from secondEntryOrderPrice');

    var takerLastPosition = await collateralPool.getUserPosition.call(accountTaker, 1);
    assert.equal(takerLastPosition[0].toNumber(), secondEntryOrderPrice, 'Taker should be short 2 from secondEntryOrderPrice');
    assert.equal(takerLastPosition[1].toNumber(), qtyToFill * -1, 'Taker should be short 2 from secondEntryOrderPrice');

    // We are now going to create a trade that will reduce all parties open positions, exiting a trade.
    const exitOrderPrice = secondEntryOrderPrice - 100;
    const unsignedExitOrderValues = [0, 0, exitOrderPrice, timeStamp, 1]; // second order with new price.
    const exitOrderQty = -3;
    const exitOrderHash = await orderLib._createOrderHash.call(
      marketContract.address,
      orderAddresses,
      unsignedExitOrderValues,
      exitOrderQty
    );
    orderSignature = utility.signMessage(web3, accountMaker, exitOrderHash);
    // only fill 1 lot at time so we can ensure proper accounting
    await marketContract.tradeOrder(
      orderAddresses,
      unsignedExitOrderValues,
      exitOrderQty,
      -1,
      orderSignature[0], // v
      orderSignature[1], // r
      orderSignature[2], // s
      { from: accountTaker }
    );

    // All accounting is done LIFO, so we should be able to check the new positions of maker and taker and see the
    // reduction.
    makerLastPosition = await collateralPool.getUserPosition.call(accountMaker, 1);
    assert.equal(makerLastPosition[0].toNumber(), secondEntryOrderPrice, 'Maker should be long 1 from secondEntryOrderPrice');
    assert.equal(makerLastPosition[1].toNumber(), 1, 'Maker should be long 1 from secondEntryOrderPrice');

    var takerLastPosition = await collateralPool.getUserPosition.call(accountTaker, 1);
    assert.equal(takerLastPosition[0].toNumber(), secondEntryOrderPrice, 'Taker should be short 1 from secondEntryOrderPrice');
    assert.equal(takerLastPosition[1].toNumber(), -1, 'Taker should be short 1 from secondEntryOrderPrice');


    // fill another 1 lot, which should remove the secondEntryOrderPrice position from both users.
    await marketContract.tradeOrder(
      orderAddresses,
      unsignedExitOrderValues,
      exitOrderQty,
      -1,
      orderSignature[0], // v
      orderSignature[1], // r
      orderSignature[2], // s
      { from: accountTaker }
    );

    makerPosCount = await collateralPool.getUserPositionCount.call(accountMaker);
    takerPosCount = await collateralPool.getUserPositionCount.call(accountTaker);
    assert.equal(makerPosCount.toNumber(), 1, 'Maker should have 1 position struct');
    assert.equal(takerPosCount.toNumber(), 1, 'Taker should have 1 position struct');

    makerLastPosition = await collateralPool.getUserPosition.call(accountMaker, 0);
    assert.equal(makerLastPosition[0].toNumber(), entryOrderPrice, 'Maker should be long 1 from entryOrderPrice');
    assert.equal(makerLastPosition[1].toNumber(), 1, 'Maker should be long 1 from entryOrderPrice');

    var takerLastPosition = await collateralPool.getUserPosition.call(accountTaker, 0);
    assert.equal(takerLastPosition[0].toNumber(), entryOrderPrice, 'Taker should be short 1 from entryOrderPrice');
    assert.equal(takerLastPosition[1].toNumber(), -1, 'Taker should be short 1 from entryOrderPrice');
  });
});

