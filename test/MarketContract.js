const BN = require('bn.js');
const CollateralToken = artifacts.require('CollateralToken');
const MarketCollateralPool = artifacts.require('MarketCollateralPool');
const PositionToken = artifacts.require('PositionToken');
const utility = require('./utility');

contract('MarketContract', function(accounts) {
  let marketContract;
  let collateralToken;
  let collateralPool;

  before(async function() {
    collateralToken = await CollateralToken.deployed();
    collateralPool = await MarketCollateralPool.deployed();
  });

  describe('constructor', function() {
    it('should set needed variables correctly', async function() {
      const name = web3.utils.toUtf8(web3.utils.asciiToHex('BTC', 32));
      const priceFloor = new BN('50');
      const priceCap = new BN('100');
      const priceDecimalPlaces = new BN('2');
      const qtyMultiplier = new BN('10');
      const expiration = Math.floor(new Date().getTime() / 1000 + 60 * 50);
      const fees = new BN('0');

      marketContract = await utility.createMarketContract(
        collateralToken,
        collateralPool,
        accounts[0],
        null,
        [priceFloor, priceCap, priceDecimalPlaces, qtyMultiplier, fees, fees, expiration]
      );

      assert.isTrue(
        (await marketContract.PRICE_FLOOR()).eq(priceFloor),
        'price floor is not correct'
      );
      assert.isTrue((await marketContract.PRICE_CAP()).eq(priceCap), 'price cap is not correct');
      assert.isTrue(
        (await marketContract.PRICE_DECIMAL_PLACES()).eq(priceDecimalPlaces),
        'price decimal places is not correct'
      );
      assert.isTrue(
        (await marketContract.QTY_MULTIPLIER()).eq(qtyMultiplier),
        'qty multiplier is not correct'
      );
      assert.equal(await marketContract.EXPIRATION(), expiration, 'expiration is not correct');
      // strip null chars from string!
      assert.equal(
        (await marketContract.CONTRACT_NAME()).replace(/\0.*$/g, ''),
        name,
        'contract name is not correct'
      );

      assert.equal(
        await marketContract.COLLATERAL_TOKEN_ADDRESS(),
        collateralToken.address,
        'collateral token address is not correct'
      );
      assert.equal(
        await marketContract.COLLATERAL_POOL_ADDRESS(),
        collateralPool.address,
        'collateral pool address is not correct'
      );

      const collateralPerUnit = utility.calculateTotalCollateral(
        priceFloor,
        priceCap,
        qtyMultiplier
      );
      assert.isTrue(
        (await marketContract.COLLATERAL_PER_UNIT()).eq(collateralPerUnit),
        'collateral per unit is not correct'
      );
    });

    it('should fail if price floor is greater than price cap', async function() {
      const higherPriceFloor = 500;
      const lowerPriceCap = 100;
      const priceDecimalPlaces = 2;
      const qtyMultiplier = 10;
      const expiration = Math.floor(new Date().getTime() / 1000 + 60 * 50);

      await utility.shouldFail(async function() {
        await utility.createMarketContract(collateralToken, collateralPool, accounts[0], null, [
          higherPriceFloor,
          lowerPriceCap,
          priceDecimalPlaces,
          qtyMultiplier,
          expiration
        ]);
      });
    });

    it('should fail if expiration is in the past', async function() {
      const priceFloor = 50;
      const priceCap = 100;
      const priceDecimalPlaces = 2;
      const qtyMultiplier = 10;
      const pastExpiration = Math.floor(new Date().getTime() / 1000 - 60 * 50); // 50 mins in the past

      await utility.shouldFail(async function() {
        await utility.createMarketContract(collateralToken, collateralPool, accounts[0], null, [
          priceFloor,
          priceCap,
          priceDecimalPlaces,
          qtyMultiplier,
          pastExpiration
        ]);
      });
    });
  });

  describe('mintPositionTokens', function() {
    it('should successfully mint', async function() {
      marketContract = await utility.createMarketContract(
        collateralToken,
        { address: accounts[0] }, // setting first account as collateral pool
        accounts[0]
      );

      const qtyToMint = 1;
      const longPositionTokens = await PositionToken.at(await marketContract.LONG_POSITION_TOKEN());
      const shortPositionTokens = await PositionToken.at(
        await marketContract.SHORT_POSITION_TOKEN()
      );

      await marketContract.mintPositionTokens(qtyToMint, accounts[1], { from: accounts[0] });

      assert.equal(
        (await longPositionTokens.balanceOf.call(accounts[1])).toNumber(),
        qtyToMint,
        'long position tokens not minted'
      );
      assert.equal(
        (await shortPositionTokens.balanceOf.call(accounts[1])).toNumber(),
        qtyToMint,
        'short position tokens not minted'
      );
    });

    it('should fail if caller is not collateral pool', async function() {
      marketContract = await utility.createMarketContract(
        collateralToken,
        collateralPool,
        accounts[0]
      );

      await utility.shouldFail(async function() {
        await marketContract.mintPositionTokens(1, accounts[1], { from: accounts[0] });
      });
    });
  });

  describe('redeemLongToken', function() {
    it('should fail if caller is not collateral pool', async function() {
      marketContract = await utility.createMarketContract(
        collateralToken,
        { address: accounts[0] },
        accounts[0]
      );

      await marketContract.mintPositionTokens(1, accounts[1], { from: accounts[0] });

      await utility.shouldFail(async function() {
        await marketContract.redeemLongToken(1, accounts[1], { from: accounts[1] });
      });
    });
  });

  describe('redeemShortToken', function() {
    it('should fail if caller is not collateral pool', async function() {
      marketContract = await utility.createMarketContract(
        collateralToken,
        { address: accounts[0] },
        accounts[0]
      );

      await marketContract.mintPositionTokens(1, accounts[1], { from: accounts[0] });

      await utility.shouldFail(async function() {
        await marketContract.redeemShortToken(1, accounts[1], { from: accounts[1] });
      });
    });
  });
});
