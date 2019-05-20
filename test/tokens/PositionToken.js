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
    longPositionToken = await PositionToken.at(await marketContract.LONG_POSITION_TOKEN());
    shortPositionToken = await PositionToken.at(await marketContract.SHORT_POSITION_TOKEN());
  });

  describe('Token symbols correctly created', function() {
    it(`long position token symbol`, async function() {
      assert.equal(
        (await longPositionToken.symbol()).replace(/\0.*$/g, ''),
        'LBTC',
        'should set symbol of long position token correctly from constructor'
      );
    });

    it(`short position token symbol`, async function() {
      assert.equal(
        (await shortPositionToken.symbol()).replace(/\0.*$/g, ''),
        'SBTC',
        'should set symbol of long position token correctly from constructor'
      );
    });
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
      const amountToApprove = '10000000000000000000000'; // 10e22 as a string to avoid issues with web3 bugs
      await collateralToken.approve(collateralPool.address, amountToApprove);
      const qtyToMint = 100;
      await collateralPool.mintPositionTokens(marketContract.address, qtyToMint, false, {
        from: userAddress
      });

      const initialLongPosTokenBalance = await longPositionToken.balanceOf.call(userAddress);
      const initialShortPosTokenBalance = await shortPositionToken.balanceOf.call(userAddress);

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
      const expectedFinalLongPosTokenBalance = initialLongPosTokenBalance - qtyToRedeem;
      const expectedFinalShortPosTokenBalance = initialShortPosTokenBalance - qtyToRedeem;

      const finalLongPosTokenBalance = await longPositionToken.balanceOf.call(userAddress);
      const finalShortPosTokenBalance = await shortPositionToken.balanceOf.call(userAddress);

      assert.equal(
        finalLongPosTokenBalance.toNumber(),
        expectedFinalLongPosTokenBalance,
        'incorrect long position token balance after redeeming'
      );
      assert.equal(
        finalShortPosTokenBalance.toNumber(),
        expectedFinalShortPosTokenBalance,
        'incorrect short position token balance after redeeming'
      );

      // 4. assert final tokens total supply are as expected
      const expectedFinalLongPosTokenSupply = initialLongPosTokenSupply - qtyToRedeem;
      const expectedFinalShortPosTokenSupply = initialShortPosTokenSupply - qtyToRedeem;

      const finalLongPosTokenSupply = await longPositionToken.totalSupply();
      const finalShortPosTokenSupply = await shortPositionToken.totalSupply();

      assert.equal(
        finalLongPosTokenSupply.toNumber(),
        expectedFinalLongPosTokenSupply,
        'incorrect long position token total supply after redeeming'
      );
      assert.equal(
        finalShortPosTokenSupply.toNumber(),
        expectedFinalShortPosTokenSupply,
        'incorrect short position token total supply after redeeming'
      );
    });
  });
});
