const MarketContractOraclize = artifacts.require('TestableMarketContractOraclize');
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
  let qtyMultiplier;
  let priceFloor;
  let priceCap;
  let longPositionToken;
  let shortPositionToken;
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
    longPositionToken = PositionToken.at(await marketContract.LONG_POSITION_TOKEN());
    shortPositionToken = PositionToken.at(await marketContract.SHORT_POSITION_TOKEN());
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
    const amountToApprove = 1e22;
    await collateralToken.approve(collateralPool.address, amountToApprove);
    const qtyToMint = 100;
    await collateralPool.mintPositionTokens(marketContract.address, qtyToMint, { from: accounts[0]});
    const longPosTokenBalance = await longPositionToken.balanceOf(accounts[0]);
    const shortPosTokenBalance = await shortPositionToken.balanceOf(accounts[0]);

    assert.equal(longPosTokenBalance.toNumber(), qtyToMint, `incorrect amount of long tokens minted`);
    assert.equal(shortPosTokenBalance.toNumber(), qtyToMint,`incorrect amount of long tokens minted`);
  });

  it(`should lock the correct amount of collateral`, async function() {

  });

  it(`should redeem token sets`, async function() {
    
  });

  it(`should return correct amount of collateral when redeemed`, async function() {

  });

  it(`should redeem single tokens after settlement`, async function() {

  });

  it(`should return correct amount of collateral when redeemed after settlement`, async function() {

  });

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
