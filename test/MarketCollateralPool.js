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
  let snapshotId;

  const MarketSides = {
    Long: 0,
    Short: 1,
    Both: 2
  };

  before(async function() {
    marketContractRegistry = await MarketContractRegistry.deployed();
  });

  beforeEach(async function() {
    snapshotId = await utility.createEVMSnapshot();
    collateralPool = await MarketCollateralPool.deployed();
    collateralToken = await CollateralToken.deployed();
    marketContract = await utility.createMarketContract(
      collateralToken,
      collateralPool,
      accounts[0]
    );

    await marketContractRegistry.addAddressToWhiteList(marketContract.address, {
      from: accounts[0]
    });

    qtyMultiplier = await marketContract.QTY_MULTIPLIER.call();
    priceFloor = await marketContract.PRICE_FLOOR.call();
    priceCap = await marketContract.PRICE_CAP.call();
    longPositionToken = PositionToken.at(await marketContract.LONG_POSITION_TOKEN());
    shortPositionToken = PositionToken.at(await marketContract.SHORT_POSITION_TOKEN());
  });

  afterEach(async function() {
    await utility.restoreEVMSnapshotsnapshotId(snapshotId);
  });

  describe('mintPositionTokens()', function() {
    it('should fail for non whitelisted addresses', async function() {
      // 1. create unregistered contract
      const unregisteredContract = await utility.createMarketContract(
        collateralToken,
        collateralPool,
        accounts[0]
      );

      // 2. Approve appropriate tokens
      const amountToApprove = 1e22;
      await collateralToken.approve(collateralPool.address, amountToApprove, { from: accounts[0] });

      // 3. minting tokens should fail
      let error = null;
      try {
        await collateralPool.mintPositionTokens(unregisteredContract.address, 1, {
          from: accounts[0]
        });
      } catch (err) {
        error = err;
      }
      assert.ok(
        error instanceof Error,
        'should not be able to mint from contracts not whitelisted'
      );
    });

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
      assert.ok(
        error instanceof Error,
        'should not be able to mint with no collateral token balance'
      );

      // 3. should fail to mint when user has not approved transfer of collateral (erc20 approve)
      const accountBalance = await collateralToken.balanceOf.call(accounts[0]);
      assert.isTrue(
        accountBalance.toNumber() !== 0,
        'Account 0 does not have a balance of collateral'
      );

      await collateralToken.approve(collateralPool.address, 0); // set zero approval
      const initialApproval = await collateralToken.allowance.call(
        accounts[0],
        collateralPool.address
      );
      assert.equal(initialApproval.toNumber(), 0, 'Account 0 already has an approval');

      error = null;
      try {
        await collateralPool.mintPositionTokens(marketContract.address, 1, { from: accounts[0] });
      } catch (err) {
        error = err;
      }
      assert.ok(
        error instanceof Error,
        'should not be able to mint with no collateral approval balance'
      );

      // 4. should allow to mint when user has collateral tokens and has approved them
      const amountToApprove = 1e22;
      await collateralToken.approve(collateralPool.address, amountToApprove);
      const qtyToMint = 100;
      await collateralPool.mintPositionTokens(marketContract.address, qtyToMint, {
        from: accounts[0]
      });
      const longPosTokenBalance = await longPositionToken.balanceOf(accounts[0]);
      const shortPosTokenBalance = await shortPositionToken.balanceOf(accounts[0]);

      assert.equal(
        longPosTokenBalance.toNumber(),
        qtyToMint,
        'incorrect amount of long tokens minted'
      );
      assert.equal(
        shortPosTokenBalance.toNumber(),
        qtyToMint,
        'incorrect amount of short tokens minted'
      );
    });

    it('should lock the correct amount of collateral', async function() {
      // 1. Get initial token balance balance
      const initialCollateralBalance = await collateralToken.balanceOf.call(accounts[0]);

      // 2. approve collateral and mint tokens
      const amountToApprove = 1e22;
      await collateralToken.approve(collateralPool.address, amountToApprove);
      const qtyToMint = 100;
      await collateralPool.mintPositionTokens(marketContract.address, qtyToMint, {
        from: accounts[0]
      });

      // 3. balance after should be equal to expected balance
      const amountToBeLocked =
        qtyToMint * utility.calculateTotalCollateral(priceFloor, priceCap, qtyMultiplier);
      const expectedBalanceAfterMint = initialCollateralBalance.minus(amountToBeLocked);
      const actualBalanceAfterMint = await collateralToken.balanceOf.call(accounts[0]);

      assert.equal(
        actualBalanceAfterMint.toNumber(),
        expectedBalanceAfterMint.toNumber(),
        'incorrect collateral amount locked for minting'
      );
    });

    it('should fail if contract is settled', async function() {
      // 1. force contract to settlement
      await utility.settleContract(marketContract, priceCap, accounts[0]);

      // 2. approve collateral and mint tokens should fail
      const amountToApprove = 1e22;
      await collateralToken.approve(collateralPool.address, amountToApprove);
      const qtyToMint = 1;

      let error = null;
      try {
        await collateralPool.mintPositionTokens(marketContract.address, qtyToMint, {
          from: accounts[0]
        });
      } catch (err) {
        error = err;
      }

      assert.ok(
        error instanceof Error,
        'should not be able to mint position tokens after settlement'
      );
    });

    it('should emit TokensMinted', async function() {
      // 1. Approve and mint tokens
      const amountToApprove = 1e22;
      await collateralToken.approve(collateralPool.address, amountToApprove);
      const qtyToMint = 100;
      const amountToBeLocked =
        qtyToMint * utility.calculateTotalCollateral(priceFloor, priceCap, qtyMultiplier);
      await collateralPool.mintPositionTokens(marketContract.address, qtyToMint, {
        from: accounts[0]
      });

      // 2. assert correct TokensMinted event emitted
      const emittedEvents = await utility.getEvent(collateralPool, 'TokensMinted');
      const tokensMintedEvent = emittedEvents[0];

      assert.equal(tokensMintedEvent.event, 'TokensMinted', 'event TokensMinted was not emitted');
      assert.equal(
        tokensMintedEvent.args.marketContract,
        marketContract.address,
        'incorrect marketContract arg for TokensMinted'
      );
      assert.equal(tokensMintedEvent.args.user, accounts[0], 'incorrect user arg for TokensMinted');
      assert.equal(
        tokensMintedEvent.args.qtyMinted.toNumber(),
        qtyToMint,
        'incorrect qtyMinted arg for TokensMinted'
      );
      assert.equal(
        tokensMintedEvent.args.collateralLocked.toNumber(),
        amountToBeLocked,
        'incorrect collateralLocked arg for TokensMinted'
      );
    });
  });

  describe('redeemPositionTokens()', function() {
    it('should fail for non whitelisted addresses', async function() {
      // 1. create unregistered contract
      const unregisteredContract = await utility.createMarketContract(
        collateralToken,
        collateralPool,
        accounts[0]
      );

      // 2. redeemingPositionTokens should fail for correct reason.
      let error = null;
      try {
        await collateralPool.redeemPositionTokens(unregisteredContract.address, 1, {
          from: accounts[0]
        });
      } catch (err) {
        error = err;
      }

      // TODO: When we upgrade to truffle 5, update test to check for actual failure reason
      assert.ok(
        error instanceof Error,
        'should not be able to mint from contracts not whitelisted'
      );
    });

    it('should redeem token sets and return correct amount of collateral', async function() {
      // 1. approve collateral and mint tokens
      const amountToApprove = 1e22;
      await collateralToken.approve(collateralPool.address, amountToApprove);
      const qtyToMint = 100;
      await collateralPool.mintPositionTokens(marketContract.address, qtyToMint, {
        from: accounts[0]
      });
      const initialLongPosTokenBalance = await longPositionToken.balanceOf(accounts[0]);
      const initialShortPosTokenBalance = await shortPositionToken.balanceOf(accounts[0]);

      // 2. redeem tokens
      const qtyToRedeem = 50;
      const collateralBalanceBeforeRedeem = await collateralToken.balanceOf.call(accounts[0]);
      await collateralPool.redeemPositionTokens(marketContract.address, qtyToRedeem, {
        from: accounts[0]
      });

      // 3. assert final tokens balance are as expected
      const expectedFinalLongPosTokenBalance = initialLongPosTokenBalance.minus(qtyToRedeem);
      const expectedFinalShortPosTokenBalance = initialShortPosTokenBalance.minus(qtyToRedeem);
      const finalLongPosTokenBalance = await longPositionToken.balanceOf(accounts[0]);
      const finalShortPosTokenBalance = await shortPositionToken.balanceOf(accounts[0]);

      assert.equal(
        finalLongPosTokenBalance.toNumber(),
        expectedFinalLongPosTokenBalance.toNumber(),
        'incorrect long position token balance after redeeming'
      );
      assert.equal(
        finalShortPosTokenBalance.toNumber(),
        expectedFinalShortPosTokenBalance.toNumber(),
        'incorrect short position token balance after redeeming'
      );

      // 4. assert correct collateral is returned
      const collateralAmountToBeReleased =
        qtyToRedeem * utility.calculateTotalCollateral(priceFloor, priceCap, qtyMultiplier);
      const expectedCollateralBalanceAfterRedeem = collateralBalanceBeforeRedeem.plus(
        collateralAmountToBeReleased
      );
      const actualCollateralBalanceAfterRedeem = await collateralToken.balanceOf.call(accounts[0]);

      assert.equal(
        actualCollateralBalanceAfterRedeem.toNumber(),
        expectedCollateralBalanceAfterRedeem.toNumber(),
        'incorrect collateral amount returned after redeeming'
      );
    });

    it('should emit TokensRedeemed', async function() {
      // 1. approve collateral and mint tokens
      const amountToApprove = 1e22;
      await collateralToken.approve(collateralPool.address, amountToApprove);
      const qtyToMint = 100;
      await collateralPool.mintPositionTokens(marketContract.address, qtyToMint, {
        from: accounts[0]
      });

      // 2. redeem tokens
      const qtyToRedeem = 50;
      const collateralAmountToBeReleased =
        qtyToRedeem * utility.calculateTotalCollateral(priceFloor, priceCap, qtyMultiplier);
      await collateralPool.redeemPositionTokens(marketContract.address, qtyToRedeem, {
        from: accounts[0]
      });

      // 2. assert correct TokensMinted event emitted
      const emittedEvents = await utility.getEvent(collateralPool, 'TokensRedeemed');
      const tokensRedeemedEvent = emittedEvents[0];

      assert.equal(
        tokensRedeemedEvent.event,
        'TokensRedeemed',
        'event TokensRedeemed was not emitted'
      );
      assert.equal(
        tokensRedeemedEvent.args.marketContract,
        marketContract.address,
        'incorrect marketContract arg for TokensRedeemed'
      );
      assert.equal(
        tokensRedeemedEvent.args.user,
        accounts[0],
        'incorrect user arg for TokensRedeemed'
      );
      assert.equal(
        tokensRedeemedEvent.args.qtyRedeemed.toNumber(),
        qtyToRedeem,
        'incorrect qtyRedeemed arg for TokensRedeemed'
      );
      assert.equal(
        tokensRedeemedEvent.args.collateralUnlocked.toNumber(),
        collateralAmountToBeReleased,
        'incorrect collateralUnlocked arg for TokensRedeemed'
      );
      assert.equal(
        tokensRedeemedEvent.args.marketSide.toNumber(),
        MarketSides.Both,
        'incorrect marketSide arg for TokensRedeemed'
      );
    });

    it('should fail to redeem single tokens before settlement', async function() {
      // 1. approve collateral and mint tokens
      const amountToApprove = 1e22;
      await collateralToken.approve(collateralPool.address, amountToApprove);
      const qtyToMint = 1;
      await collateralPool.mintPositionTokens(marketContract.address, qtyToMint, {
        from: accounts[0]
      });
      const shortTokenBalance = (await shortPositionToken.balanceOf.call(accounts[0])).toNumber();
      const longTokenBalance = (await longPositionToken.balanceOf.call(accounts[0])).toNumber();
      assert.isTrue(
        shortTokenBalance === longTokenBalance,
        'long token and short token balances are not equals'
      );

      // 2. transfer part of the long token
      await longPositionToken.transfer(accounts[1], 1, { from: accounts[0] });

      // 3. attempting to redeem all shorts before settlement should fails
      let error = null;
      try {
        const qtyToRedeem = (await shortPositionToken.balanceOf.call(accounts[0])).toNumber();
        await collateralPool.redeemPositionTokens(marketContract.address, qtyToRedeem, {
          from: accounts[0]
        });
      } catch (err) {
        error = err;
      }

      assert.ok(
        error instanceof Error,
        'should not be able to redeem single tokens before settlement'
      );
    });
  });

  describe('settleAndClose()', function() {
    it('should fail if called before settlement', async () => {
      let settleAndCloseError = null;
      try {
        await collateralPool.settleAndClose(marketContract.address, { from: accounts[0] });
      } catch (err) {
        settleAndCloseError = err;
      }
      assert.ok(
        settleAndCloseError instanceof Error,
        'settleAndClose() did not fail before settlement'
      );
    });

    it('should fail if user has insufficient tokens', async function() {
      let error = null;

      // 1. approve collateral and mint tokens
      const amountToApprove = 1e22;
      await collateralToken.approve(collateralPool.address, amountToApprove);
      const qtyToMint = 1;
      await collateralPool.mintPositionTokens(marketContract.address, qtyToMint, {
        from: accounts[0]
      });

      // 2. force contract to settlement
      const settlementPrice = await utility.settleContract(marketContract, priceCap, accounts[0]);

      // 3. attempt to redeem too much long tokens
      const longTokenQtyToRedeem = (await longPositionToken.balanceOf.call(accounts[0])).plus(1);
      try {
        await collateralPool.settleAndClose(marketContract.address, longTokenQtyToRedeem, {
          from: accounts[0]
        });
      } catch (err) {
        error = err;
      }
      assert.instanceOf(error, Error, 'should not be able to redeem insufficient long tokens');

      // 4. attempt to redeem too much short tokens
      error = null;
      const shortTokenQtyToRedeem = (await longPositionToken.balanceOf.call(accounts[0]))
        .plus(1)
        .times(-1);
      try {
        await collateralPool.settleAndClose(marketContract.address, shortTokenQtyToRedeem, {
          from: accounts[0]
        });
      } catch (err) {
        error = err;
      }
      assert.instanceOf(error, Error, 'should not be able to redeem insufficient short tokens');
    });

    it('should redeem short and long tokens after settlement', async function() {
      let error = null;

      // 1. approve collateral and mint tokens
      const amountToApprove = 1e22;
      await collateralToken.approve(collateralPool.address, amountToApprove);
      const qtyToMint = 1;
      await collateralPool.mintPositionTokens(marketContract.address, qtyToMint, {
        from: accounts[0]
      });

      // 2. force contract to settlement
      const settlementPrice = await utility.settleContract(marketContract, priceCap, accounts[0]);
      await utility.increase(87000); // extend time past delay for withdrawal of funds

      // 3. redeem all short position tokens after settlement should pass
      const shortTokenBalanceBeforeRedeem = await shortPositionToken.balanceOf.call(accounts[0]);
      const shortTokenQtyToRedeem = -1;
      try {
        await collateralPool.settleAndClose(marketContract.address, shortTokenQtyToRedeem, {
          from: accounts[0]
        });
      } catch (err) {
        error = err;
      }
      assert.isNull(error, 'should be able to redeem short tokens after settlement');

      // 4. balance of short tokens should be updated.
      const expectedShortTokenBalanceAfterRedeem = shortTokenBalanceBeforeRedeem.plus(
        shortTokenQtyToRedeem
      );
      const actualShortTokenBalanceAfterRedeem = await shortPositionToken.balanceOf.call(
        accounts[0]
      );
      assert.equal(
        actualShortTokenBalanceAfterRedeem.toNumber(),
        expectedShortTokenBalanceAfterRedeem.toNumber(),
        'short position tokens balance was not reduced'
      );

      // 5. ensure correct events are emitted for short settlement
      const shortCollateralAmountReleased = utility.calculateNeededCollateral(
        priceFloor,
        priceCap,
        qtyMultiplier,
        shortTokenQtyToRedeem,
        settlementPrice
      );
      let emittedEvents = await utility.getEvent(collateralPool, 'TokensRedeemed');
      const shortTokensRedeemedEvent = emittedEvents[0];

      assert.equal(
        shortTokensRedeemedEvent.event,
        'TokensRedeemed',
        'event TokensRedeemed was not emitted'
      );
      assert.equal(
        shortTokensRedeemedEvent.args.marketContract,
        marketContract.address,
        'incorrect marketContract arg for TokensRedeemed'
      );
      assert.equal(
        shortTokensRedeemedEvent.args.user,
        accounts[0],
        'incorrect user arg for TokensRedeemed'
      );
      assert.equal(
        shortTokensRedeemedEvent.args.qtyRedeemed.toNumber(),
        Math.abs(shortTokenQtyToRedeem),
        'incorrect qtyRedeemed arg for TokensRedeemed'
      );
      assert.equal(
        shortTokensRedeemedEvent.args.collateralUnlocked.toNumber(),
        shortCollateralAmountReleased,
        'incorrect collateralUnlocked arg for TokensRedeemed'
      );
      assert.equal(
        shortTokensRedeemedEvent.args.marketSide.toNumber(),
        MarketSides.Short,
        'incorrect marketSide arg for TokensRedeemed'
      );

      // 6. redeem all long position tokens after settlement should pass
      const longTokenBalanceBeforeRedeem = await longPositionToken.balanceOf.call(accounts[0]);
      const longTokenQtyToRedeem = 1;
      error = null;
      try {
        await collateralPool.settleAndClose(marketContract.address, longTokenQtyToRedeem, {
          from: accounts[0]
        });
      } catch (err) {
        error = err;
      }
      assert.isNull(error, 'should be able to redeem long tokens after settlement');

      // 7. balance of long tokens should be updated.
      const expectedLongTokenBalanceAfterRedeem = longTokenBalanceBeforeRedeem.minus(
        longTokenQtyToRedeem
      );
      const actualLongTokenBalanceAfterRedeem = await longPositionToken.balanceOf.call(accounts[0]);
      assert.equal(
        actualLongTokenBalanceAfterRedeem.toNumber(),
        expectedLongTokenBalanceAfterRedeem.toNumber(),
        'long position tokens balance was not reduced'
      );

      // 8. ensure correct events are emitted for long settlement
      const longCollateralAmountReleased = utility.calculateNeededCollateral(
        priceFloor,
        priceCap,
        qtyMultiplier,
        longTokenQtyToRedeem,
        settlementPrice
      );
      emittedEvents = await utility.getEvent(collateralPool, 'TokensRedeemed');
      const longTokensRedeemedEvent = emittedEvents[0];

      assert.equal(
        longTokensRedeemedEvent.event,
        'TokensRedeemed',
        'event TokensRedeemed was not emitted'
      );
      assert.equal(
        longTokensRedeemedEvent.args.marketContract,
        marketContract.address,
        'incorrect marketContract arg for TokensRedeemed'
      );
      assert.equal(
        longTokensRedeemedEvent.args.user,
        accounts[0],
        'incorrect user arg for TokensRedeemed'
      );
      assert.equal(
        longTokensRedeemedEvent.args.qtyRedeemed.toNumber(),
        longTokenQtyToRedeem,
        'incorrect qtyRedeemed arg for TokensRedeemed'
      );
      assert.equal(
        longTokensRedeemedEvent.args.collateralUnlocked.toNumber(),
        longCollateralAmountReleased,
        'incorrect collateralUnlocked arg for TokensRedeemed'
      );
      assert.equal(
        longTokensRedeemedEvent.args.marketSide.toNumber(),
        MarketSides.Long,
        'incorrect marketSide arg for TokensRedeemed'
      );
    });

    it('should return correct amount of collateral when redeemed after settlement', async function() {
      // 1. approve collateral and mint tokens
      const amountToApprove = 1e22;
      await collateralToken.approve(collateralPool.address, amountToApprove);
      const qtyToMint = 1;
      await collateralPool.mintPositionTokens(marketContract.address, qtyToMint, {
        from: accounts[0]
      });

      // 2. transfer part of the long token
      await longPositionToken.transfer(accounts[1], 1, { from: accounts[0] });

      // 3. force contract to settlement
      const settlementPrice = await utility.settleContract(marketContract, priceCap, accounts[0]);
      await utility.increase(87000); // extend time past delay for withdrawal of funds

      // 4. redeem all shorts on settlement
      const collateralBalanceBeforeRedeem = await collateralToken.balanceOf.call(accounts[0]);
      const qtyToRedeem = (await shortPositionToken.balanceOf.call(accounts[0])).toNumber();
      await collateralPool.settleAndClose(marketContract.address, -qtyToRedeem, {
        from: accounts[0]
      });

      // 5. should return appropriate collateral
      const collateralToReturn = utility.calculateNeededCollateral(
        priceFloor,
        priceCap,
        qtyMultiplier,
        qtyToRedeem,
        settlementPrice
      );
      const expectedCollateralBalanceAfterRedeem = collateralBalanceBeforeRedeem.plus(
        collateralToReturn
      );
      const actualCollateralBalanceAfterRedeem = await collateralToken.balanceOf.call(accounts[0]);
      assert.equal(
        actualCollateralBalanceAfterRedeem.toNumber(),
        expectedCollateralBalanceAfterRedeem.toNumber(),
        'short position tokens balance was not reduced'
      );
    });
  });
});
