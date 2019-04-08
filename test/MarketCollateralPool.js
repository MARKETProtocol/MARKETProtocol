const MarketCollateralPool = artifacts.require('MarketCollateralPool');
const MarketContractRegistry = artifacts.require('MarketContractRegistry');
const CollateralToken = artifacts.require('CollateralToken');
const PositionToken = artifacts.require('PositionToken');
const MarketToken = artifacts.require('MarketToken');
const utility = require('./utility.js');

// basic tests to ensure MarketCollateralPool works and is set up to allow trading
contract('MarketCollateralPool', function(accounts) {
  let collateralToken;
  let collateralPool;
  let marketContract;
  let feeMarketContract;
  let marketContractRegistry;
  let mktToken;
  let qtyMultiplier;
  let priceFloor;
  let priceCap;
  let longPositionToken;
  let shortPositionToken;
  let snapshotId;
  let initialCollateralBalance;
  let initialMktBalance;
  let mktFeePerUnit;
  let collateralFeePerUnit;
  let collateralFee = 1000;
  let mktFee = 500;

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
    mktToken = await MarketToken.deployed(); // .at(await collateralPool.mktToken());
    marketContract = await utility.createMarketContract(
      collateralToken,
      collateralPool,
      accounts[0],
      accounts[0],
      [0, 150, 2, 1, 0, 0, utility.expirationInDays(1)]
    );

    feeMarketContract = await utility.createMarketContract(
      collateralToken,
      collateralPool,
      accounts[0],
      accounts[0],
      [0, 150, 2, 2, collateralFee, mktFee, utility.expirationInDays(1)]
    );

    await marketContractRegistry.addAddressToWhiteList(marketContract.address, {
      from: accounts[0]
    });
    await marketContractRegistry.addAddressToWhiteList(feeMarketContract.address, {
      from: accounts[0]
    });

    qtyMultiplier = await marketContract.QTY_MULTIPLIER.call();
    priceFloor = await marketContract.PRICE_FLOOR.call();
    priceCap = await marketContract.PRICE_CAP.call();
    longPositionToken = PositionToken.at(await marketContract.LONG_POSITION_TOKEN());
    shortPositionToken = PositionToken.at(await marketContract.SHORT_POSITION_TOKEN());

    initialMktBalance = await mktToken.balanceOf.call(accounts[0]);
    initialCollateralBalance = await collateralToken.balanceOf.call(accounts[0]);
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
        await collateralPool.mintPositionTokens(unregisteredContract.address, 1, false, {
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

    it('should fail if contract is settled', async function() {
      // 1. force contract to settlement
      await utility.settleContract(marketContract, priceCap, accounts[0]);

      // 2. approve collateral and mint tokens should fail
      const amountToApprove = 1e22;
      await collateralToken.approve(collateralPool.address, amountToApprove);

      await utility.shouldFail(async () => {
        const qtyToMint = 1;
        await collateralPool.mintPositionTokens(marketContract.address, qtyToMint, false, {
          from: accounts[0]
        });
      }, 'should not be able to mint position tokens after settlement');
    });

    it('should emit TokensMinted', async function() {
      // 1. Approve and mint tokens
      const amountToApprove = 1e22;
      await collateralToken.approve(collateralPool.address, amountToApprove);
      const qtyToMint = 100;
      const amountToBeLocked =
        qtyToMint * utility.calculateTotalCollateral(priceFloor, priceCap, qtyMultiplier);
      await collateralPool.mintPositionTokens(marketContract.address, qtyToMint, false, {
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

    it('should lock the correct amount of collateral', async function() {
      // 1. approve collateral and mint tokens
      const amountToApprove = 1e22;
      await collateralToken.approve(collateralPool.address, amountToApprove);
      const qtyToMint = 100;
      await collateralPool.mintPositionTokens(marketContract.address, qtyToMint, false, {
        from: accounts[0]
      });

      // 2. balance after should be equal to expected balance
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

    it('should mint with zero MKT fee', async function() {
      // 1. approve collateral and mint tokens
      const amountToApprove = 1e22;
      await collateralToken.approve(collateralPool.address, amountToApprove);
      await mktToken.approve(collateralPool.address, amountToApprove);
      const qtyToMint = 100;
      await collateralPool.mintPositionTokens(marketContract.address, qtyToMint, false, {
        from: accounts[0]
      });

      // 2. balance after should be equal to expected balance
      const expectedMktFees = 0;
      const finalMktBalance = await mktToken.balanceOf.call(accounts[0]);
      const actualMktFees = finalMktBalance.minus(initialMktBalance).toNumber();

      assert.equal(actualMktFees, expectedMktFees, 'non-zero mkt fees charged');
    });

    describe('when marketContract has both MKT and Collateral fees', async function() {
      let qtyToMint = 5;
      let collateralFeePerUnit;
      let mktFeePerUnit;

      beforeEach(async function() {
        collateralFeePerUnit = await feeMarketContract.COLLATERAL_TOKEN_FEE_PER_UNIT.call();
        mktFeePerUnit = await feeMarketContract.MKT_TOKEN_FEE_PER_UNIT.call();

        // approve tokens
        await collateralToken.approve(collateralPool.address, 1e22, { from: accounts[0] });
        await mktToken.approve(collateralPool.address, 1e22);

        longPositionToken = PositionToken.at(await feeMarketContract.LONG_POSITION_TOKEN());
        shortPositionToken = PositionToken.at(await feeMarketContract.SHORT_POSITION_TOKEN());
      });

      it('should mint position tokens', async function() {
        // 1. Start with fresh account
        const initialBalance = await collateralToken.balanceOf.call(accounts[1]);
        assert.equal(initialBalance.toNumber(), 0, 'Account 1 already has a balance');

        // 2. should fail to mint when user has no collateral.
        let error = null;
        try {
          await collateralPool.mintPositionTokens(marketContract.address, 1, false, {
            from: accounts[1]
          });
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
          await collateralPool.mintPositionTokens(feeMarketContract.address, 1, false, {
            from: accounts[0]
          });
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
        await collateralPool.mintPositionTokens(feeMarketContract.address, qtyToMint, false, {
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

      describe('when isAttemptToPayInMKT is true', function() {
        beforeEach(async function() {
          // mint
          await collateralPool.mintPositionTokens(feeMarketContract.address, qtyToMint, true, {
            from: accounts[0]
          });
        });

        it('should charge correct mktFees', async function() {
          const expectedMktFee = mktFeePerUnit.toNumber() * qtyToMint;

          const finalMktBalance = await mktToken.balanceOf.call(accounts[0]);
          const actualMktFee = initialMktBalance.minus(finalMktBalance).toNumber();

          assert.equal(actualMktFee, expectedMktFee, 'wrong mkt fee charged for minting');
        });

        it('should not charge collateral fees', async function() {
          const expectedCollateralTransfer =
            (await feeMarketContract.COLLATERAL_PER_UNIT()).toNumber() * qtyToMint;

          const finalCollateralBalance = await collateralToken.balanceOf.call(accounts[0]);
          const actualCollateralTransfer = initialCollateralBalance
            .minus(finalCollateralBalance)
            .toNumber();

          assert.equal(
            actualCollateralTransfer,
            expectedCollateralTransfer,
            'collateral token also charged for fees'
          );
        });
      });

      describe('when isAttemptToPayInMKT is false', function() {
        beforeEach(async function() {
          // mint with isAttemptToPayInMKT == false
          await collateralPool.mintPositionTokens(feeMarketContract.address, qtyToMint, false, {
            from: accounts[0]
          });
        });

        it('should charge correct collateralFees', async function() {
          const expectedCollateralFee = collateralFeePerUnit.toNumber() * qtyToMint;
          const expectedCollateralTransfer =
            (await feeMarketContract.COLLATERAL_PER_UNIT()).toNumber() * qtyToMint;

          const finalCollateralBalance = await collateralToken.balanceOf.call(accounts[0]);
          const actualCollateralFee = initialCollateralBalance
            .minus(finalCollateralBalance)
            .minus(expectedCollateralTransfer)
            .toNumber();

          assert.equal(
            actualCollateralFee,
            expectedCollateralFee,
            'wrong collateral fee charged for minting'
          );
        });

        it('should not charge mkt fees', async function() {
          const finalMktBalance = await mktToken.balanceOf.call(accounts[0]);

          assert.equal(
            initialMktBalance.toNumber(),
            finalMktBalance.toNumber(),
            'mkt token also charged for fees'
          );
        });
      });
    });

    describe('when marketContract has only MKT fees', async function() {
      let qtyToMint = 5;
      let mktFeeMarketContract;

      beforeEach(async function() {
        mktFeeMarketContract = await utility.createMarketContract(
          collateralToken,
          collateralPool,
          accounts[0],
          accounts[0],
          [0, 150, 2, 1, 0, mktFee, utility.expirationInDays(1)]
        );
        mktFeePerUnit = await mktFeeMarketContract.MKT_TOKEN_FEE_PER_UNIT.call();

        await marketContractRegistry.addAddressToWhiteList(mktFeeMarketContract.address, {
          from: accounts[0]
        });
      });

      describe('when isAttemptToPayInMKT is true', function() {
        beforeEach(async function() {
          await mktToken.approve(collateralPool.address, 1e22, {
            from: accounts[0]
          });

          await collateralToken.approve(collateralPool.address, 1e22);

          // mint
          await collateralPool.mintPositionTokens(mktFeeMarketContract.address, qtyToMint, true, {
            from: accounts[0]
          });
        });

        it('should charge correct mktFees', async function() {
          const expectedMktFee = mktFeePerUnit.toNumber() * qtyToMint;

          const finalMktBalance = await mktToken.balanceOf.call(accounts[0]);
          const actualMktFee = initialMktBalance.minus(finalMktBalance).toNumber();

          assert.equal(actualMktFee, expectedMktFee, 'wrong mkt fee charged for minting');
        });

        it('should not charge collateral fees', async function() {
          const expectedCollateralTransfer =
            (await mktFeeMarketContract.COLLATERAL_PER_UNIT()).toNumber() * qtyToMint;

          const finalCollateralBalance = await collateralToken.balanceOf.call(accounts[0]);
          const actualCollateralTransfer = initialCollateralBalance
            .minus(finalCollateralBalance)
            .toNumber();

          assert.equal(
            actualCollateralTransfer,
            expectedCollateralTransfer,
            'collateral token also charged for fees'
          );
        });
      });

      describe('when isAttemptToPayInMKT is false', function() {
        it('should still charge in mktFees', async function() {
          const qtyToMint = 5;

          const expectedMktFee = mktFeePerUnit.toNumber() * qtyToMint;
          await mktToken.approve(collateralPool.address, expectedMktFee, {
            from: accounts[0]
          });

          await collateralToken.approve(collateralPool.address, 1e22);

          // mint with isAttemptToPayInMKT == false
          await collateralPool.mintPositionTokens(mktFeeMarketContract.address, qtyToMint, false, {
            from: accounts[0]
          });

          const finalMktBalance = await mktToken.balanceOf.call(accounts[0]);
          const actualMktFee = initialMktBalance.minus(finalMktBalance).toNumber();
          assert.equal(actualMktFee, expectedMktFee, 'mkt fees have been bypassed');
        });
      });
    });

    describe('when marketContract has only Collateral fees', async function() {
      let qtyToMint = 5;
      let collateralFeeMarketContract;

      beforeEach(async function() {
        collateralFeeMarketContract = await utility.createMarketContract(
          collateralToken,
          collateralPool,
          accounts[0],
          accounts[0],
          [0, 150, 2, 1, collateralFee, 0, utility.expirationInDays(1)]
        );
        collateralFeePerUnit = await collateralFeeMarketContract.COLLATERAL_TOKEN_FEE_PER_UNIT.call();

        await marketContractRegistry.addAddressToWhiteList(collateralFeeMarketContract.address, {
          from: accounts[0]
        });
      });

      describe('when isAttemptToPayInMKT is true', function() {
        beforeEach(async function() {
          // approve tokens
          await collateralToken.approve(collateralPool.address, 1e22, { from: accounts[0] });
          await mktToken.approve(collateralPool.address, 1e22);

          // mint with isAttemptToPayInMKT == true
          await collateralPool.mintPositionTokens(
            collateralFeeMarketContract.address,
            qtyToMint,
            true,
            {
              from: accounts[0]
            }
          );
        });

        it('should still charge correct collateralFees', async function() {
          const expectedCollateralFee = collateralFeePerUnit.toNumber() * qtyToMint;
          const expectedCollateralTransfer =
            (await collateralFeeMarketContract.COLLATERAL_PER_UNIT()).toNumber() * qtyToMint;

          const finalCollateralBalance = await collateralToken.balanceOf.call(accounts[0]);
          const actualCollateralFee = initialCollateralBalance
            .minus(finalCollateralBalance)
            .minus(expectedCollateralTransfer)
            .toNumber();

          assert.equal(
            actualCollateralFee,
            expectedCollateralFee,
            'wrong collateral fee charged for minting'
          );
        });

        it('should not charge mkt fees', async function() {
          const finalMktBalance = await mktToken.balanceOf.call(accounts[0]);

          assert.equal(
            initialMktBalance.toNumber(),
            finalMktBalance.toNumber(),
            'mkt token also charged for fees'
          );
        });
      });

      describe('when isAttemptToPayInMKT is false', function() {
        beforeEach(async function() {
          // approve tokens
          await collateralToken.approve(collateralPool.address, 1e22, { from: accounts[0] });
          await mktToken.approve(collateralPool.address, 1e22);

          // mint with isAttemptToPayInMKT == false
          await collateralPool.mintPositionTokens(
            collateralFeeMarketContract.address,
            qtyToMint,
            false,
            {
              from: accounts[0]
            }
          );
        });

        it('should still charge correct collateralFees', async function() {
          const expectedCollateralFee = collateralFeePerUnit.toNumber() * qtyToMint;
          const expectedCollateralTransfer =
            (await collateralFeeMarketContract.COLLATERAL_PER_UNIT()).toNumber() * qtyToMint;

          const finalCollateralBalance = await collateralToken.balanceOf.call(accounts[0]);
          const actualCollateralFee = initialCollateralBalance
            .minus(finalCollateralBalance)
            .minus(expectedCollateralTransfer)
            .toNumber();

          assert.equal(
            actualCollateralFee,
            expectedCollateralFee,
            'wrong collateral fee charged for minting'
          );
        });

        it('should not charge mkt fees', async function() {
          const finalMktBalance = await mktToken.balanceOf.call(accounts[0]);

          assert.equal(
            initialMktBalance.toNumber(),
            finalMktBalance.toNumber(),
            'mkt token also charged for fees'
          );
        });
      });
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
      await collateralPool.mintPositionTokens(marketContract.address, qtyToMint, false, {
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
      await collateralPool.mintPositionTokens(marketContract.address, qtyToMint, false, {
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
      await collateralPool.mintPositionTokens(marketContract.address, qtyToMint, false, {
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
        await collateralPool.settleAndClose(marketContract.address, 1, { from: accounts[0] });
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
      await collateralPool.mintPositionTokens(marketContract.address, qtyToMint, false, {
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

    it('should fail if time not pass settlement delay', async function() {
      let error = null;

      // 1. force contract to settlement
      await utility.settleContract(marketContract, priceCap, accounts[0]);

      // 2. move time a little ahead but less than postSettlement < 1 day
      await utility.increase(7000);

      // 3. attempting to redeem token should fail

      await utility.shouldFail(
        async () => {
          const shortTokenQtyToRedeem = -1;
          await collateralPool.settleAndClose(marketContract.address, shortTokenQtyToRedeem, {
            from: accounts[0]
          });
        },
        'should be able to settle and close',
        'Contract is not past settlement delay',
        'should have for contract not past settlement delay'
      );
    });

    it('should redeem short and long tokens after settlement', async function() {
      let error = null;

      // 1. approve collateral and mint tokens
      const amountToApprove = 1e22;
      await collateralToken.approve(collateralPool.address, amountToApprove);
      const qtyToMint = 1;
      await collateralPool.mintPositionTokens(marketContract.address, qtyToMint, false, {
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
      await collateralPool.mintPositionTokens(marketContract.address, qtyToMint, false, {
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

  describe('withdrawFees()', function() {
    beforeEach(async function() {
      // approve tokens
      await collateralToken.approve(collateralPool.address, 1e22, { from: accounts[0] });
      await mktToken.approve(collateralPool.address, 1e22);
    });

    it('should fail if no fees available for token address', async function() {
      await utility.shouldFail(
        async function() {
          await collateralPool.withdrawFees(collateralToken.address, accounts[1], {
            from: accounts[0]
          });
        },
        'did not fail on withdrawal of zero fees',
        'No fees available for withdrawal',
        'did not fail for no fees available'
      );
    });

    it('should fail if sender is not owner of collateralPool', async function() {
      await utility.shouldFail(async function() {
        const notOwner = accounts[1];
        await collateralPool.withdrawFees(collateralToken.address, accounts[1], {
          from: notOwner
        });
      }, 'did not fail for sender !== owner');
    });

    it('should be able to withdraw collateral token fees', async function() {
      const qtyToMint = 5;
      collateralFeePerUnit = await feeMarketContract.COLLATERAL_TOKEN_FEE_PER_UNIT.call();
      const expectedFeesWithdrawn = collateralFeePerUnit.toNumber() * qtyToMint;

      // mint tokens with collateral fees
      await collateralPool.mintPositionTokens(feeMarketContract.address, qtyToMint, false, {
        from: accounts[0]
      });

      // withdraw collateral tokens to account[1]
      const initialReceipientBalance = await collateralToken.balanceOf(accounts[1]);
      await collateralPool.withdrawFees(collateralToken.address, accounts[1], {
        from: accounts[0]
      });

      const finalRecipientBalance = await collateralToken.balanceOf(accounts[1]);
      const actualFeesWithdrawn = finalRecipientBalance.minus(initialReceipientBalance).toNumber();

      assert.equal(
        actualFeesWithdrawn,
        expectedFeesWithdrawn,
        'incorrect collateral fees withdrawn'
      );
    });

    it('should be able to withdraw mkt token fees', async function() {
      const qtyToMint = 5;
      mktFeePerUnit = await feeMarketContract.MKT_TOKEN_FEE_PER_UNIT.call();
      const expectedFeesWithdrawn = mktFeePerUnit.toNumber() * qtyToMint;

      // mint tokens with mkt fees
      await collateralPool.mintPositionTokens(feeMarketContract.address, qtyToMint, true, {
        from: accounts[0]
      });

      // withdraw fees to account[1]
      const initialReceipientBalance = await mktToken.balanceOf(accounts[1]);
      await collateralPool.withdrawFees(mktToken.address, accounts[1], {
        from: accounts[0]
      });

      const finalReceipientBalance = await mktToken.balanceOf(accounts[1]);
      const actualFeesWithdrawn = finalReceipientBalance.minus(initialReceipientBalance).toNumber();

      assert.equal(actualFeesWithdrawn, expectedFeesWithdrawn, 'incorrect mkt fees withdrawn');
    });
  });

  describe('setMKTTokenAddress()', function() {
    it('should fail if attempting to set MKT address to null', async function() {
      await utility.shouldFail(
        async function() {
          await collateralPool.setMKTTokenAddress('0x0000000000000000000000000000000000000000', {
            from: accounts[0]
          });
        },
        'did not fail on attempt to set MKT Token Address to null',
        'Cannot set MKT Token Address To Null',
        'did not fail with null MKT Token address'
      );
    });

    it('should fail if attempting to set MKT address from non owner address', async function() {
      await utility.shouldFail(
        async function() {
          await collateralPool.setMKTTokenAddress(collateralToken.address, {
            from: accounts[3]
          });
        },
        'did not fail on attempt to set MKT Token Address from non owner address',
        '',
        'did not fail from non owner address'
      );
    });

    it('should work attempting to set MKT address from owner address', async function() {
      await collateralPool.setMKTTokenAddress(collateralToken.address, {
        from: accounts[0]
      });

      const newlySetAddress = await collateralPool.mktToken.call();

      assert.equal(
        newlySetAddress,
        collateralToken.address,
        'unable to set new MKT Token Address from owner account'
      );
    });
  });
});
