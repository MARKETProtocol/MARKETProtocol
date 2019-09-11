const BN = require('bn.js');
const CollateralToken = artifacts.require('CollateralToken');
const MarketCollateralPool = artifacts.require('MarketCollateralPool');
const MarketContractRegistry = artifacts.require('MarketContractRegistry');
const MarketToken = artifacts.require('MarketToken');
const PositionToken = artifacts.require('PositionToken');
const truffleAssert = require('truffle-assertions');
const utility = require('./utility.js');

// tests when marketContract.contractType = Inverse to ensure MarketCollateralPool works and is set up to allow trading
contract('MarketCollateralPool(type = Inverse)', function(accounts) {
  let collateralToken;
  let collateralPool;
  let feeMarketContract;
  let marketContractRegistry;
  let mktToken;
  let qtyMultiplier;
  let priceFloor;
  let priceCap;
  let longPositionToken;
  let shortPositionToken;
  let snapshotId;
  let initialMktBalance;
  let collateralFee = 1000;
  let mktFee = 500;

  before(async function() {
    marketContractRegistry = await MarketContractRegistry.deployed();
  });

  beforeEach(async function() {
    snapshotId = await utility.createEVMSnapshot();
    collateralPool = await MarketCollateralPool.deployed();
    collateralToken = await CollateralToken.deployed();
    mktToken = await MarketToken.deployed(); // .at(await collateralPool.mktToken());

    feeMarketContract = await utility.createMarketContract(
      collateralToken,
      collateralPool,
      accounts[0],
      accounts[0],
      [
        '140' + '0'.repeat(10),
        '300' + '0'.repeat(10),
        10, // price decimals
        '1' + '0'.repeat(23),
        collateralFee,
        mktFee,
        utility.expirationInDays(1),
        1 // inverse
      ]
    );

    await marketContractRegistry.addAddressToWhiteList(feeMarketContract.address, {
      from: accounts[0]
    });

    qtyMultiplier = await feeMarketContract.QTY_MULTIPLIER.call();
    priceFloor = await feeMarketContract.PRICE_FLOOR.call();
    priceCap = await feeMarketContract.PRICE_CAP.call();
    longPositionToken = await PositionToken.at(await feeMarketContract.LONG_POSITION_TOKEN());
    shortPositionToken = await PositionToken.at(await feeMarketContract.SHORT_POSITION_TOKEN());

    initialMktBalance = await mktToken.balanceOf.call(accounts[0]);
    initialCollateralBalance = await collateralToken.balanceOf.call(accounts[0]);
  });

  afterEach(async function() {
    await utility.restoreEVMSnapshotsnapshotId(snapshotId);
  });

  describe('mintPositionTokens()', function() {
    let qtyToMint = new BN('100000');
    let collateralFeePerUnit;
    let mintResult;

    beforeEach(async function() {
      collateralFeePerUnit = await feeMarketContract.COLLATERAL_TOKEN_FEE_PER_UNIT.call();

      // approve tokens
      const amountToApprove = new BN('10000000000000000000000'); // 1e22
      await collateralToken.approve(collateralPool.address, amountToApprove, {
        from: accounts[0]
      });
      await mktToken.approve(collateralPool.address, amountToApprove);

      longPositionToken = await PositionToken.at(await feeMarketContract.LONG_POSITION_TOKEN());
      shortPositionToken = await PositionToken.at(await feeMarketContract.SHORT_POSITION_TOKEN());

      initialBalance = await collateralToken.balanceOf.call(accounts[0]);
      mintResult = await collateralPool.mintPositionTokens(
        feeMarketContract.address,
        qtyToMint,
        false,
        {
          from: accounts[0]
        }
      );
    });

    it('should emit TokensMinted', async function() {
      const amountToBeLocked = qtyToMint.mul(
        utility.calculateTotalCollateralForInverseContract(priceFloor, priceCap, qtyMultiplier)
      );

      let tokensMintedEvent;
      await truffleAssert.eventEmitted(mintResult, 'TokensMinted', mintedEvent => {
        tokensMintedEvent = mintedEvent;
        return true;
      });
      assert.equal(
        tokensMintedEvent.marketContract,
        feeMarketContract.address,
        'incorrect marketContract arg for TokensMinted'
      );
      assert.equal(tokensMintedEvent.user, accounts[0], 'incorrect user arg for TokensMinted');
      assert.equal(
        tokensMintedEvent.qtyMinted.toNumber(),
        qtyToMint,
        'incorrect qtyMinted arg for TokensMinted'
      );
      assert.equal(
        tokensMintedEvent.collateralLocked.toNumber(),
        amountToBeLocked,
        'incorrect collateralLocked arg for TokensMinted'
      );
    });

    it('should charge correct collateralFees', async function() {
      const expectedCollateralTransfer = (await feeMarketContract.COLLATERAL_PER_UNIT()).mul(
        qtyToMint
      );
      assert.isTrue(
        // notice the tail consisting of zeros (division error)
        expectedCollateralTransfer.eq(new BN('3809523809500000')),
        'wrong collateral fee calculation'
      );

      const finalCollateralBalance = await collateralToken.balanceOf.call(accounts[0]);
      const actualCollateralFee = initialCollateralBalance
        .sub(finalCollateralBalance)
        .sub(expectedCollateralTransfer);

      const expectedCollateralFee = collateralFeePerUnit.mul(qtyToMint);
      assert.isTrue(
        actualCollateralFee.eq(expectedCollateralFee),
        'wrong collateral fee charged for minting'
      );
    });

    it('should not charge mkt fees', async function() {
      const finalMktBalance = await mktToken.balanceOf.call(accounts[0]);
      assert.isTrue(initialMktBalance.eq(finalMktBalance), 'mkt token also charged for fees');
    });
  });

  describe('redeemPositionTokens()', function() {
    it('should redeem token sets and return correct amount of collateral', async function() {
      // 1. approve collateral and mint tokens
      const amountToApprove = new BN('10000000000000000000000'); // 1e22
      await collateralToken.approve(collateralPool.address, amountToApprove);
      const qtyToMint = new BN('100');
      await collateralPool.mintPositionTokens(feeMarketContract.address, qtyToMint, false, {
        from: accounts[0]
      });
      const initialLongPosTokenBalance = await longPositionToken.balanceOf.call(accounts[0]);
      const initialShortPosTokenBalance = await shortPositionToken.balanceOf.call(accounts[0]);

      // 2. redeem tokens
      const qtyToRedeem = new BN('50');
      const collateralBalanceBeforeRedeem = await collateralToken.balanceOf.call(accounts[0]);
      await collateralPool.redeemPositionTokens(feeMarketContract.address, qtyToRedeem, {
        from: accounts[0]
      });

      // 3. assert final tokens balance are as expected
      const expectedFinalLongPosTokenBalance = initialLongPosTokenBalance.sub(qtyToRedeem);
      const expectedFinalShortPosTokenBalance = initialShortPosTokenBalance.sub(qtyToRedeem);
      const finalLongPosTokenBalance = await longPositionToken.balanceOf.call(accounts[0]);
      const finalShortPosTokenBalance = await shortPositionToken.balanceOf.call(accounts[0]);

      assert.isTrue(
        finalLongPosTokenBalance.eq(expectedFinalLongPosTokenBalance),
        'incorrect long position token balance after redeeming'
      );
      assert.isTrue(
        finalShortPosTokenBalance.eq(expectedFinalShortPosTokenBalance),
        'incorrect short position token balance after redeeming'
      );

      // 4. assert correct collateral is returned
      const collateralAmountToBeReleased = qtyToRedeem.mul(
        utility.calculateTotalCollateralForInverseContract(priceFloor, priceCap, qtyMultiplier)
      );
      const expectedCollateralBalanceAfterRedeem = collateralBalanceBeforeRedeem.add(
        collateralAmountToBeReleased
      );
      const actualCollateralBalanceAfterRedeem = await collateralToken.balanceOf.call(accounts[0]);

      assert.isTrue(
        actualCollateralBalanceAfterRedeem.eq(expectedCollateralBalanceAfterRedeem),
        'incorrect collateral amount returned after redeeming'
      );
    });
  });

  describe('settleAndClose()', function() {
    it('should redeem short and long tokens after settlement', async function() {
      let error = null;
      let result = null;

      // 1. approve collateral and mint tokens
      const amountToApprove = new BN('10000000000000000000000'); // 1e22
      await collateralToken.approve(collateralPool.address, amountToApprove);
      const qtyToMint = new BN('1');
      await collateralPool.mintPositionTokens(feeMarketContract.address, qtyToMint, false, {
        from: accounts[0]
      });

      // 2. force contract to settlement
      const settlementPrice = await utility.settleContract(
        feeMarketContract,
        priceCap.sub(new BN('10' + '0'.repeat(10))),
        accounts[0]
      );
      await utility.increase(87000); // extend time past delay for withdrawal of funds

      // 3. redeem all short position tokens after settlement should pass
      const shortTokenBalanceBeforeRedeem = await shortPositionToken.balanceOf.call(accounts[0]);
      const shortTokenQtyToRedeem = new BN('1');
      try {
        result = await collateralPool.settleAndClose(
          feeMarketContract.address,
          0,
          shortTokenQtyToRedeem,
          {
            from: accounts[0]
          }
        );
      } catch (err) {
        error = err;
      }
      assert.isNull(error, 'should be able to redeem short tokens after settlement');

      // 4. balance of short tokens should be updated.
      const expectedShortTokenBalanceAfterRedeem = shortTokenBalanceBeforeRedeem.sub(
        shortTokenQtyToRedeem
      );
      const actualShortTokenBalanceAfterRedeem = await shortPositionToken.balanceOf.call(
        accounts[0]
      );
      assert.isTrue(
        actualShortTokenBalanceAfterRedeem.eq(expectedShortTokenBalanceAfterRedeem),
        'short position tokens balance was not reduced'
      );

      // 5. ensure correct events are emitted for short settlement
      const shortCollateralAmountReleased = utility.calculateCollateralToReturnForInverseContract(
        priceFloor,
        priceCap,
        qtyMultiplier,
        shortTokenQtyToRedeem.mul(new BN('-1')),
        settlementPrice
      );
      assert.isTrue(
        shortCollateralAmountReleased.eq(new BN('1149425287')),
        'utility.calculateCollateralToReturnForInverseContract is not correct'
      );

      // assert correct TokensRedeemed event emitted
      let shortTokensRedeemedEvent;
      await truffleAssert.eventEmitted(result, 'TokensRedeemed', redeemed => {
        shortTokensRedeemedEvent = redeemed;
        return true;
      });
      assert.equal(
        shortTokensRedeemedEvent.marketContract,
        feeMarketContract.address,
        'incorrect marketContract arg for TokensRedeemed'
      );
      assert.equal(
        shortTokensRedeemedEvent.user,
        accounts[0],
        'incorrect user arg for TokensRedeemed'
      );
      assert.isTrue(
        shortTokensRedeemedEvent.shortQtyRedeemed.eq(shortTokenQtyToRedeem),
        'incorrect qtyRedeemed arg for TokensRedeemed'
      );

      assert.isTrue(
        shortCollateralAmountReleased.eq(shortTokensRedeemedEvent.collateralUnlocked),
        'incorrect collateralUnlocked arg for TokensRedeemed'
      );

      // 6. redeem all long position tokens after settlement should pass
      const longTokenBalanceBeforeRedeem = await longPositionToken.balanceOf.call(accounts[0]);
      const longTokenQtyToRedeem = new BN('1');
      error = null;
      result = null;
      try {
        result = await collateralPool.settleAndClose(
          feeMarketContract.address,
          longTokenQtyToRedeem,
          0,
          {
            from: accounts[0]
          }
        );
      } catch (err) {
        error = err;
      }
      assert.isNull(error, 'should be able to redeem long tokens after settlement');

      // 7. balance of long tokens should be updated.
      const expectedLongTokenBalanceAfterRedeem = longTokenBalanceBeforeRedeem.sub(
        longTokenQtyToRedeem
      );
      const actualLongTokenBalanceAfterRedeem = await longPositionToken.balanceOf.call(accounts[0]);
      assert.isTrue(
        actualLongTokenBalanceAfterRedeem.eq(expectedLongTokenBalanceAfterRedeem),
        'long position tokens balance was not reduced'
      );

      // 8. ensure correct events are emitted for long settlement
      const longCollateralAmountReleased = utility.calculateCollateralToReturnForInverseContract(
        priceFloor,
        priceCap,
        qtyMultiplier,
        longTokenQtyToRedeem,
        settlementPrice
      );
      assert.isTrue(
        longCollateralAmountReleased.eq(new BN('36945812808')),
        'utility.calculateCollateralToReturnForInverseContract is not correct'
      );

      // assert correct TokensRedeemed event emitted
      let longTokensRedeemedEvent;
      await truffleAssert.eventEmitted(result, 'TokensRedeemed', redeemed => {
        longTokensRedeemedEvent = redeemed;
        return true;
      });
      assert.equal(
        longTokensRedeemedEvent.marketContract,
        feeMarketContract.address,
        'incorrect marketContract arg for TokensRedeemed'
      );
      assert.equal(
        longTokensRedeemedEvent.user,
        accounts[0],
        'incorrect user arg for TokensRedeemed'
      );
      assert.isTrue(
        longTokensRedeemedEvent.longQtyRedeemed.eq(longTokenQtyToRedeem),
        'incorrect qtyRedeemed arg for TokensRedeemed'
      );
      assert.isTrue(
        longTokensRedeemedEvent.collateralUnlocked.eq(longCollateralAmountReleased),
        'incorrect collateralUnlocked arg for TokensRedeemed'
      );
    });

    it('should return correct amount of collateral when redeemed after settlement', async function() {
      // 1. approve collateral and mint tokens
      const amountToApprove = new BN('10000000000000000000000'); // 1e22
      await collateralToken.approve(collateralPool.address, amountToApprove);
      const qtyToMint = new BN('1');
      await collateralPool.mintPositionTokens(feeMarketContract.address, qtyToMint, false, {
        from: accounts[0]
      });

      // 2. transfer part of the long token
      await longPositionToken.transfer(accounts[1], 1, { from: accounts[0] });

      // 3. force contract to settlement
      const settlementPrice = await utility.settleContract(
        feeMarketContract,
        priceCap.sub(new BN('10')),
        accounts[0]
      );
      await utility.increase(87000); // extend time past delay for withdrawal of funds

      // 4. redeem all shorts on settlement
      const collateralBalanceBeforeRedeem = await collateralToken.balanceOf.call(accounts[0]);
      const qtyToRedeem = await shortPositionToken.balanceOf.call(accounts[0]);
      await collateralPool.settleAndClose(feeMarketContract.address, 0, qtyToRedeem, {
        from: accounts[0]
      });

      // 5. should return appropriate collateral
      const collateralToReturn = utility.calculateCollateralToReturnForInverseContract(
        priceFloor,
        priceCap,
        qtyMultiplier,
        qtyToRedeem.mul(new BN('-1')),
        settlementPrice
      );
      const expectedCollateralBalanceAfterRedeem = collateralBalanceBeforeRedeem.add(
        collateralToReturn
      );
      const actualCollateralBalanceAfterRedeem = await collateralToken.balanceOf.call(accounts[0]);
      assert.isTrue(
        actualCollateralBalanceAfterRedeem.eq(expectedCollateralBalanceAfterRedeem),
        'short position tokens balance was not reduced'
      );
    });
  });
});
