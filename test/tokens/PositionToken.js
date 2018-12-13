const MarketCollateralPool = artifacts.require('MarketCollateralPool');
const MarketContractRegistry = artifacts.require('MarketContractRegistry');
const CollateralToken = artifacts.require('CollateralToken');
const PositionToken = artifacts.require('PositionToken');
const utility = require('../utility.js');

// basic tests to ensure PositionToken works and is set up to allow minting and redeeming tokens
contract('PositionToken', function(accounts) {
  let collateralToken;
  let collateralPool;
  let marketContract;
  let marketContractRegistry;
  let qtyMultiplier;
  let priceFloor;
  let priceCap;
  let longPositionToken;
  let shortPositionToken;

  const userAddress = accounts[0];

  before(async function() {
    marketContractRegistry = await MarketContractRegistry.deployed();
  });

  beforeEach(async function() {
    collateralPool = await MarketCollateralPool.deployed();
    collateralToken = await CollateralToken.deployed();
    marketContract = await utility.createMarketContract(
      collateralToken,
      collateralPool,
      userAddress
    );

    await marketContractRegistry.addAddressToWhiteList(marketContract.address, {
      from: userAddress
    });

    qtyMultiplier = await marketContract.QTY_MULTIPLIER.call();
    priceFloor = await marketContract.PRICE_FLOOR.call();
    priceCap = await marketContract.PRICE_CAP.call();
    longPositionToken = PositionToken.at(await marketContract.LONG_POSITION_TOKEN());
    shortPositionToken = PositionToken.at(await marketContract.SHORT_POSITION_TOKEN());
  });

  describe('onlyOwner can call mintAndSendToken and redeemToken', function() {
    it(`mint position tokens fails calling directly`, async function() {
      let error = null;
      try {
        await longPositionToken.mintAndSendToken(1, userAddress);
      } catch (err) {
        error = err;
      }

      assert.ok(
        error instanceof Error,
        `should throw an error upon calling mint token method directly`
      );
    });

    it(`redeem position tokens fails calling directly`, async function() {
      let error = null;
      try {
        await longPositionToken.redeemToken(1, userAddress);
      } catch (err) {
        error = err;
      }

      assert.ok(
        error instanceof Error,
        `should throw an error upon calling redeem token method directly`
      );
    });
  });

  describe('total supply and balances of long and short position tokens', function() {
    it(`mintAndSendToken and redeemToken updates total supply and balances of minter/redeemer correctly`, async function() {
      // 1. approve collateral and mint tokens
      const amountToApprove = 1e22;
      await collateralToken.approve(collateralPool.address, amountToApprove);
      const qtyToMint = 100;
      await collateralPool.mintPositionTokens(marketContract.address, qtyToMint, {
        from: userAddress
      });

      const initialLongPosTokenBalance = await longPositionToken.balanceOf(userAddress);
      const initialShortPosTokenBalance = await shortPositionToken.balanceOf(userAddress);

      assert.equal(
        initialLongPosTokenBalance.toNumber(),
        qtyToMint,
        'incorrect amount of long tokens minted'
      );
      assert.equal(
        initialShortPosTokenBalance.toNumber(),
        qtyToMint,
        'incorrect amount of short tokens minted'
      );

      const initialLongPosTokenSupply = await longPositionToken.totalSupply();
      const initialShortPosTokenSupply = await shortPositionToken.totalSupply();

      assert.equal(
        initialLongPosTokenSupply.toNumber(),
        qtyToMint,
        'incorrect amount of long tokens total supply'
      );
      assert.equal(
        initialShortPosTokenSupply.toNumber(),
        qtyToMint,
        'incorrect amount of short tokens total supply'
      );

      // 2. redeem tokens
      const qtyToRedeem = 50;
      await collateralPool.redeemPositionTokens(marketContract.address, qtyToRedeem, {
        from: userAddress
      });

      // 3. assert final tokens balance are as expected
      const expectedFinalLongPosTokenBalance = initialLongPosTokenBalance.minus(qtyToRedeem);
      const expectedFinalShortPosTokenBalance = initialShortPosTokenBalance.minus(qtyToRedeem);

      const finalLongPosTokenBalance = await longPositionToken.balanceOf(userAddress);
      const finalShortPosTokenBalance = await shortPositionToken.balanceOf(userAddress);

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

      // 4. assert final tokens total supply are as expected
      const expectedFinalLongPosTokenSupply = initialLongPosTokenSupply.minus(qtyToRedeem);
      const expectedFinalShortPosTokenSupply = initialShortPosTokenSupply.minus(qtyToRedeem);

      const finalLongPosTokenSupply = await longPositionToken.totalSupply();
      const finalShortPosTokenSupply = await shortPositionToken.totalSupply();

      assert.equal(
        finalLongPosTokenSupply.toNumber(),
        expectedFinalLongPosTokenSupply.toNumber(),
        'incorrect long position token total supply after redeeming'
      );
      assert.equal(
        finalShortPosTokenSupply.toNumber(),
        expectedFinalShortPosTokenSupply.toNumber(),
        'incorrect short position token total supply after redeeming'
      );
    });
  });
});
