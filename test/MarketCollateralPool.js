const MarketContractOraclize = artifacts.require('MarketContractOraclize');
const MarketCollateralPool = artifacts.require('MarketCollateralPool');
const MarketContractRegistry = artifacts.require('MarketContractRegistry');
const CollateralToken = artifacts.require('CollateralToken');
const PositionToken = artifacts.require('PositionToken');
const utility = require('./utility.js');

// basic tests to ensure MarketCollateralPool works and is set up to allow trading
contract('MarketCollateralPool', function(accounts) {
  let balancePerAcct;
  let collateralToken;
  let initBalance;
  let collateralPool;
  let marketContract;
  let marketContractRegistry;
  let orderLib;
  let qtyMultiplier;
  let priceFloor;
  let priceCap;
  let tradeHelper;
  let marketTradingHub;
  const entryOrderPrice = 33025;
  const accountMaker = accounts[0];
  const accountTaker = accounts[1];

  before(async function() {
    marketContractRegistry = await MarketContractRegistry.deployed();
    var whiteList = await marketContractRegistry.getAddressWhiteList.call();
    marketContract = await MarketContractOraclize.at(whiteList[1]);
    collateralPool = await MarketCollateralPool.deployed();
    collateralToken = await CollateralToken.deployed();
    qtyMultiplier = await marketContract.QTY_MULTIPLIER.call();
    priceFloor = await marketContract.PRICE_FLOOR.call();
    priceCap = await marketContract.PRICE_CAP.call();
  });

  beforeEach(async function() {

  });

  it(`should mint position tokens`, async function() {

    // 1. Start with fresh account
    const initialBalance = await collateralToken.balanceOf.call(accounts[1]);
    assert.equal(initialBalance.toNumber(), 0, 'Account 1 already has a balance');

    // 2. should fail to mint when user has no collateral.
    let error = null;
    try {
      await collateralPool.mintPositionTokens(marketContract.address, 1, { from: accounts[1] });
    } catch (err) {
      error = err;
    }
    assert.ok(error instanceof Error, 'should not be able to mint with no collateral token balance');

    // 3. should fail to mint when user has not approved transfer of collateral (erc20 approve)
    const accountBalance = await collateralToken.balanceOf.call(accounts[0]);
    assert.isTrue(accountBalance.toNumber() != 0, 'Account 0 does not have a balance of collateral');

    const initialApproval = await collateralToken.allowance.call(accounts[0], collateralPool.address);
    assert.equal(initialApproval.toNumber(), 0, 'Account 0 already has an approval');

    error = null;
    try {
      await collateralPool.mintPositionTokens(marketContract.address, 1, { from: accounts[0] });
    } catch (err) {
      error = err;
    }
    assert.ok(error instanceof Error, 'should not be able to mint with no collateral approval balance');

    // 4. should allow to mint when user has collateral tokens and has approved them
    console.log(await marketContract.SHORT_POSITION_TOKEN());
    console.log(await marketContract.LONG_POSITION_TOKEN());

    const posToken = PositionToken.at(await marketContract.SHORT_POSITION_TOKEN());
    console.log(await posToken.owner());
    console.log(await posToken.MARKET_CONTRACT_ADDRESS());
    console.log(await posToken.name());

    const amountToApprove = 1e22;
    await collateralToken.approve(collateralPool.address, amountToApprove);
    await collateralPool.mintPositionTokens(marketContract.address, 100, { from: accounts[0]});


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
