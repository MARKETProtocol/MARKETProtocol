const BN = require('bn.js');
const CollateralToken = artifacts.require('CollateralToken');
const PositionToken = artifacts.require('PositionToken');
const utility = require('./utility');

contract('MarketContract(type = Inverse)', function(accounts) {
  let collateralToken;
  let marketContract;
  let priceFloor;
  let priceCap;
  let qtyMultiplier;

  before(async function() {
    priceFloor = new BN('140' + '0'.repeat(10)); // multiple of 7
    priceCap = new BN('300' + '0'.repeat(10)); // multiple of 3
    const priceDecimalPlaces = new BN('10');
    qtyMultiplier = new BN('1' + '0'.repeat(23));
    const expiration = Math.floor(new Date().getTime() / 1000 + 60 * 50);
    const fees = new BN('25');

    collateralToken = await CollateralToken.deployed();
    marketContract = await utility.createMarketContract(
      collateralToken,
      { address: accounts[0] }, // setting first account as collateral pool
      accounts[0],
      null,
      [priceFloor, priceCap, priceDecimalPlaces, qtyMultiplier, fees, fees, expiration, 1]
    );
  });

  describe('constructor', function() {
    it('should set needed variables correctly', async function() {
      assert.isTrue(
        (await marketContract.QTY_MULTIPLIER()).eq(qtyMultiplier),
        'qty multiplier is not correct'
      );

      const collateralPerUnit = utility.calculateTotalCollateralForInverseContract(
        priceFloor,
        priceCap,
        qtyMultiplier
      );
      assert.isTrue(
        (await marketContract.COLLATERAL_PER_UNIT()).eq(collateralPerUnit),
        'collateral per unit is not correct'
      );
      assert.isTrue(
        collateralPerUnit.eq(new BN('38095238095')),
        'utility.calculateTotalCollateralForInverseContract is not correct'
      );
      assert.isTrue(
        // qtyMultiplier.div(priceFloor).add(qtyMultiplier.div(priceCap))
        //   .div(new BN('2')).mul(fees).div(new BN('10000')).toString()
        (await marketContract.COLLATERAL_TOKEN_FEE_PER_UNIT()).eq(new BN('130952380')),
        'fee is not correct'
      );
      assert.isTrue(
        (await marketContract.MKT_TOKEN_FEE_PER_UNIT()).eq(new BN('130952380')),
        'mkt fee is not correct'
      );
    });
  });

  describe('mintPositionTokens', function() {
    it('should successfully mint', async function() {
      const qtyToMint = 100000;
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
  });
});
