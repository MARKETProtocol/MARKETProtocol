const MarketContractOraclize = artifacts.require('MarketContractOraclize');
const MarketCollateralPool = artifacts.require('MarketCollateralPool');
const MarketContractRegistry = artifacts.require('MarketContractRegistry');
const CollateralToken = artifacts.require('CollateralToken');
const Helpers = require('./helpers/Helpers.js');
const utility = require('./utility.js');

// basic tests to ensure MarketCollateralPool works and is set up to allow trading
contract('MarketCollateralPool', function(accounts) {
  let balancePerAcct;
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
  let marketTradingHub;
  const entryOrderPrice = 33025;
  const accountMaker = accounts[0];
  const accountTaker = accounts[1];

  beforeEach(async function() {
    // marketToken = await MarketToken.deployed();
    // marketContractRegistry = await MarketContractRegistry.deployed();
    // var whiteList = await marketContractRegistry.getAddressWhiteList.call();
    // marketContract = await MarketContractOraclize.at(whiteList[1]);
    // collateralPool = await MarketCollateralPool.deployed();
    // orderLib = await OrderLib.deployed();
    // collateralToken = await CollateralToken.deployed();
    // qtyMultiplier = await marketContract.QTY_MULTIPLIER.call();
    // priceFloor = await marketContract.PRICE_FLOOR.call();
    // priceCap = await marketContract.PRICE_CAP.call();
    // marketTradingHub = await MarketTradingHub.deployed();
    // tradeHelper = await Helpers.TradeHelper(
    //   marketContract,
    //   orderLib,
    //   collateralToken,
    //   collateralPool,
    //   marketTradingHub
    // );
  });

  //
  // it('should close open positions and withdraw collateral to accounts when settleAndClose() is called', async function() {
  //   const entryOrderPrice = 3000;
  //   const settlementPrice = 20000; // force to settlement with price below price floor (20155)
  //   const orderQty = 2;
  //   const orderQtyToFill = 1;
  //
  //   await tradeHelper.tradeOrder(
  //     [marketContract.address, accounts[0], accounts[1], accounts[2]],
  //     [entryOrderPrice, orderQty, orderQtyToFill]
  //   );
  //   await tradeHelper.attemptToSettleContract(settlementPrice); // this should push our contract into settlement.
  //
  //   assert.isTrue(await marketContract.isSettled(), "Contract not settled properly!");
  //
  //   const expectedMakersTokenBalanceAfterSettlement = await tradeHelper.calculateSettlementToken(
  //     accounts[0],
  //     priceFloor,
  //     priceCap,
  //     qtyMultiplier,
  //     orderQtyToFill,
  //     settlementPrice
  //   );
  //
  //   const expectedTakersTokenBalanceAfterSettlement = await tradeHelper.calculateSettlementToken(
  //     accounts[1],
  //     priceFloor,
  //     priceCap,
  //     qtyMultiplier,
  //     -orderQtyToFill,
  //     settlementPrice
  //   );
  //
  //   // each account now calls settle and close, returning to them all collateral.
  //   await collateralPool.settleAndClose(marketContract.address, { from: accounts[0] });
  //   await collateralPool.settleAndClose(marketContract.address, { from: accounts[1] });
  //   await collateralPool.settleAndClose(marketContract.address, { from: accounts[3] });
  //
  //   // makers and takers collateral pool balance is cleared
  //   const makersCollateralBalanceAfterSettlement = await collateralPool.getUserUnallocatedBalance.call(
  //     collateralToken.address,
  //     accounts[0]
  //   );
  //   const takersCollateralBalanceAfterSettlement = await collateralPool.getUserUnallocatedBalance.call(
  //     collateralToken.address,
  //     accounts[1]
  //   );
  //
  //   assert.equal(
  //     makersCollateralBalanceAfterSettlement.toNumber(),
  //     0,
  //     'Makers collateral balance not returned'
  //   );
  //   assert.equal(
  //     takersCollateralBalanceAfterSettlement.toNumber(),
  //     0,
  //     'Takers collateral balance not returned'
  //   );
  //
  //   // check correct token amount is withdrawn to makers and takers account
  //   const makersTokenBalanceAfterSettlement = await collateralToken.balanceOf.call(accounts[0]);
  //   assert.equal(
  //     makersTokenBalanceAfterSettlement.toNumber(),
  //     expectedMakersTokenBalanceAfterSettlement.toNumber(),
  //     'Makers account incorrectly settled'
  //   );
  //
  //   const takersTokenBalanceAfterSettlement = await collateralToken.balanceOf.call(accounts[1]);
  //   assert.equal(
  //     takersTokenBalanceAfterSettlement.toNumber(),
  //     expectedTakersTokenBalanceAfterSettlement.toNumber(),
  //     'Takers account incorrectly settled'
  //   );
  // });

  it('should fail if settleAndClose() is called before settlement', async () => {

    // let error = null;
    // let settleAndCloseError = null;
    // try {
    //   await collateralPool.settleAndClose.call(marketContract.address, { from: accounts[0] });
    // } catch (err) {
    //   settleAndCloseError = err;
    // }
    // assert.ok(settleAndCloseError instanceof Error, 'settleAndClose() did not fail before settlement');
  });

});
