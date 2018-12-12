const MarketContractOraclize = artifacts.require('MarketContractOraclize');
const MarketCollateralPool = artifacts.require('MarketCollateralPool');
const MarketContractRegistry = artifacts.require('MarketContractRegistry');
const CollateralToken = artifacts.require('CollateralToken');
const PositionToken = artifacts.require('PositionToken');
const utility = require('./utility.js');

// basic tests to ensure MarketCollateralPool works and is set up to allow trading
contract('MarketCollateralPool', function(accounts) {
  let collateralToken;
  let collateralPool;
  let marketContract;
  let marketContractRegistry;
  let qtyMultiplier;
  let priceFloor;
  let priceCap;
  let longPositionToken;
  let shortPositionToken;

  const expiration = new Date().getTime() / 1000 + 60 * 50; // order expires 50 minutes from now.
  const oracleDataSoure = 'URL';
  const oracleQuery = 'json(https://api.kraken.com/0/public/Ticker?pair=ETHUSD).result.XETHZUSD.c.0';

  before(async function() {
    marketContractRegistry = await MarketContractRegistry.deployed();
  });

  // forces the contract to be settled
  async function settleContract() {
    const settlementPrice = priceCap.plus(10);
    await marketContract.oracleCallBack(settlementPrice, { from: accounts[0] }); // price above cap!
    return settlementPrice;
  }

  beforeEach(async function() {
    collateralPool = await MarketCollateralPool.deployed();
    collateralToken = await CollateralToken.deployed();
    marketContract = await MarketContractOraclize.new(
      'MyNewContract',
      [
        accounts[0],
        collateralToken.address,
        collateralPool.address
      ],
      accounts[0],  // substitute our address for the oracleHubAddress so we can callback from queries.
      [
        0,
        150,
        2,
        2,
        expiration
      ],
      oracleDataSoure,
      oracleQuery
    );

    await marketContractRegistry.addAddressToWhiteList(marketContract.address, { from: accounts[0] });
    qtyMultiplier = await marketContract.QTY_MULTIPLIER.call();
    priceFloor = await marketContract.PRICE_FLOOR.call();
    priceCap = await marketContract.PRICE_CAP.call();
    longPositionToken = PositionToken.at(await marketContract.LONG_POSITION_TOKEN());
    shortPositionToken = PositionToken.at(await marketContract.SHORT_POSITION_TOKEN());
  });

  describe('mintPositionTokens()', function() {
    it('should mint position tokens', async function() {
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
      await collateralPool.mintPositionTokens(marketContract.address, qtyToMint, { from: accounts[0] });
      const longPosTokenBalance = await longPositionToken.balanceOf(accounts[0]);
      const shortPosTokenBalance = await shortPositionToken.balanceOf(accounts[0]);

      assert.equal(longPosTokenBalance.toNumber(), qtyToMint, 'incorrect amount of long tokens minted');
      assert.equal(shortPosTokenBalance.toNumber(), qtyToMint, 'incorrect amount of long tokens minted');
    });

    it('should lock the correct amount of collateral', async function() {
      // 1. Get initial token balance balance
      const initialCollateralBalance = await collateralToken.balanceOf.call(accounts[0]);

      // 2. approve collateral and mint tokens
      const amountToApprove = 1e22;
      await collateralToken.approve(collateralPool.address, amountToApprove);
      const qtyToMint = 100;
      await collateralPool.mintPositionTokens(marketContract.address, qtyToMint, { from: accounts[0] });

      // 3. balance after should be equal to expected balance
      const amountToBeLocked = qtyToMint * utility.calculateTotalCollateral(priceFloor, priceCap, qtyMultiplier);
      const expectedBalanceAfterMint = initialCollateralBalance.minus(amountToBeLocked);
      const actualBalanceAfterMint = await collateralToken.balanceOf.call(accounts[0]);

      assert.equal(expectedBalanceAfterMint.toNumber(), actualBalanceAfterMint.toNumber(), 'incorrect collateral amount locked for minting');
    });

    it('should fail if contract is settled', async () => {
      // 1. force contract to settlement
      await settleContract();

      // 2. approve collateral and mint tokens should fail
      const amountToApprove = 1e22;
      await collateralToken.approve(collateralPool.address, amountToApprove);
      const qtyToMint = 1;

      let error = null;
      try {
        await collateralPool.mintPositionTokens(marketContract.address, qtyToMint, { from: accounts[0] });
      } catch (err) {
        error = err;
      }

      assert.ok(error instanceof Error, 'should not be able to mint position tokens after settlement');
    });
  });

  describe('redeemPositionTokens()', function() {
    it('should redeem token sets and return correct amount of collateral', async function() {
      // 1. approve collateral and mint tokens
      const amountToApprove = 1e22;
      await collateralToken.approve(collateralPool.address, amountToApprove);
      const qtyToMint = 100;
      await collateralPool.mintPositionTokens(marketContract.address, qtyToMint, { from: accounts[0] });
      const initialLongPosTokenBalance = await longPositionToken.balanceOf(accounts[0]);
      const initialShortPosTokenBalance = await shortPositionToken.balanceOf(accounts[0]);

      // 2. redeem tokens
      const qtyToRedeem = 50;
      const collateralBalanceBeforeRedeem = await collateralToken.balanceOf.call(accounts[0]);
      await collateralPool.redeemPositionTokens(marketContract.address, qtyToRedeem, { from: accounts[0] });

      // 3. assert final tokens balance are as expected
      const expectedFinalLongPosTokenBalance = initialLongPosTokenBalance.minus(qtyToRedeem);
      const expectedFinalShortPosTokenBalance = initialShortPosTokenBalance.minus(qtyToRedeem);
      const finalLongPosTokenBalance = await longPositionToken.balanceOf(accounts[0]);
      const finalShortPosTokenBalance = await shortPositionToken.balanceOf(accounts[0]);

      assert.equal(expectedFinalLongPosTokenBalance.toNumber(), finalLongPosTokenBalance.toNumber(), 'incorrect long position token balance after redeeming');
      assert.equal(expectedFinalShortPosTokenBalance.toNumber(), finalShortPosTokenBalance.toNumber(), 'incorrect short position token balance after redeeming');

      // 4. assert correct collateral is returned
      const collateralAmountToBeReleased = qtyToRedeem * utility.calculateTotalCollateral(priceFloor, priceCap, qtyMultiplier);
      const expectedCollateralBalanceAfterRedeem = collateralBalanceBeforeRedeem.plus(collateralAmountToBeReleased);
      const actualCollateralBalanceAfterRedeem = await collateralToken.balanceOf.call(accounts[0]);

      assert.equal(expectedCollateralBalanceAfterRedeem.toNumber(), actualCollateralBalanceAfterRedeem.toNumber(), 'incorrect collateral amount returned after redeeming');
    });

    it('should fail to redeem single tokens before settlement', async function() {
      // 1. approve collateral and mint tokens
      const amountToApprove = 1e22;
      await collateralToken.approve(collateralPool.address, amountToApprove);
      const qtyToMint = 1;
      await collateralPool.mintPositionTokens(marketContract.address, qtyToMint, { from: accounts[0] });
      const shortTokenBalance = (await shortPositionToken.balanceOf.call(accounts[0])).toNumber();
      const longTokenBalance = (await longPositionToken.balanceOf.call(accounts[0])).toNumber();
      assert.equal(shortTokenBalance, longTokenBalance, 'long token and short token balances are not equals');

      // 2. transfer part of the long token
      await longPositionToken.transfer(accounts[1], 1, { from: accounts[0] });

      // 3. attempting to redeem all shorts before settlement should fails
      let error = null;
      try {
        const qtyToRedeem = (await shortPositionToken.balanceOf.call(accounts[0])).toNumber();
        await collateralPool.redeemPositionTokens(marketContract.address, qtyToRedeem, { from: accounts[0] });
      } catch (err) {
        error = err;
      }

      assert.ok(error instanceof Error, 'should not be able to redeem single tokens before settlement');
    });
  });

  describe('settleAndClose()', function() {
    it('should fail if settleAndClose() is called before settlement', async () => {
      let settleAndCloseError = null;
      try {
        await collateralPool.settleAndClose(marketContract.address, { from: accounts[0] });
      } catch (err) {
        settleAndCloseError = err;
      }
      assert.ok(settleAndCloseError instanceof Error, 'settleAndClose() did not fail before settlement');
    });

    it('should redeem single short tokens after settlement', async function() {
      // 1. approve collateral and mint tokens
      const amountToApprove = 1e22;
      await collateralToken.approve(collateralPool.address, amountToApprove);
      const qtyToMint = 1;
      await collateralPool.mintPositionTokens(marketContract.address, qtyToMint, { from: accounts[0] });

      // 2. transfer part of the long token
      await longPositionToken.transfer(accounts[1], 1, { from: accounts[0] });

      // 3. force contract to settlement
      await settleContract();

      // 4. redeem all short position tokens after settlement should pass
      const balanceBeforeRedeem = await shortPositionToken.balanceOf.call(accounts[0]);
      const qtyToRedeem = -1;
      let error = null;
      try {
        await collateralPool.settleAndClose(marketContract.address, qtyToRedeem, { from: accounts[0] });
      } catch (err) {
        error = err;
      }
      assert.isNull(error, 'should be able to redeem single tokens after settlement');

      // 5. balance of short tokens should be updated.
      const expectedBalanceAfterRedeem = balanceBeforeRedeem.plus(qtyToRedeem);
      const actualBalanceAfterRedeem = await shortPositionToken.balanceOf.call(accounts[0]);
      assert.equal(expectedBalanceAfterRedeem.toNumber(), actualBalanceAfterRedeem.toNumber(), 'short position tokens balance was not reduced');
    });

    it('should return correct amount of collateral when redeemed after settlement', async function() {
      // 1. approve collateral and mint tokens
      const amountToApprove = 1e22;
      await collateralToken.approve(collateralPool.address, amountToApprove);
      const qtyToMint = 1;
      await collateralPool.mintPositionTokens(marketContract.address, qtyToMint, { from: accounts[0] });

      // 2. transfer part of the long token
      await longPositionToken.transfer(accounts[1], 1, { from: accounts[0] });

      // 3. force contract to settlement
      const settlementPrice = await settleContract();

      // 4. redeem all shorts on settlement
      const collateralBalanceBeforeRedeem = await collateralToken.balanceOf.call(accounts[0]);
      const qtyToRedeem = (await shortPositionToken.balanceOf.call(accounts[0])).toNumber();
      await collateralPool.settleAndClose(marketContract.address, -qtyToRedeem, { from: accounts[0] });

      // 5. should return appropriate collateral
      const collateralToReturn = utility.calculateNeededCollateral(priceFloor, priceCap, qtyMultiplier, qtyToRedeem, settlementPrice);
      const expectedCollateralBalanceAfterRedeem = collateralBalanceBeforeRedeem.plus(collateralToReturn);
      const actualCollateralBalanceAfterRedeem = await collateralToken.balanceOf.call(accounts[0]);
      assert.equal(expectedCollateralBalanceAfterRedeem.toNumber(), actualCollateralBalanceAfterRedeem.toNumber(), 'short position tokens balance was not reduced');

    });
  });

});
