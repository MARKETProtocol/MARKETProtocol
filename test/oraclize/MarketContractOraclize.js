const MarketContractOraclize = artifacts.require('MarketContractOraclize');
const CollateralToken = artifacts.require('CollateralToken');

contract('MarketContractOraclize', function(accounts) {
  const expiration = new Date().getTime() / 1000 + 60 * 50; // order expires 50 minutes from now.
  const oracleDataSoure = 'URL';
  const oracleQuery =
    'json(https://api.kraken.com/0/public/Ticker?pair=ETHUSD).result.XETHZUSD.c.0';
  let marketContract;

  before(async function() {
    marketContract = await MarketContractOraclize.new(
      'MyNewContract',
      [accounts[0], CollateralToken.address],
      accounts[0], // substitute our address for the oracleHubAddress so we can callback from queries.
      [0, 150, 2, 2, expiration],
      oracleDataSoure,
      oracleQuery
    );
  });

  it('Constructor sets needed variables correctly', async function() {
    assert.equal(await marketContract.ORACLE_DATA_SOURCE(), oracleDataSoure);
    assert.equal(await marketContract.ORACLE_QUERY(), oracleQuery);
    assert.equal(await marketContract.ORACLE_HUB_ADDRESS(), accounts[0]);
  });

  it('oracleCallBack can only be called by the oracleHub', async function() {
    let error = null;
    try {
      await marketContract.oracleCallBack(100, { from: accounts[1] });
    } catch (err) {
      error = err;
    }
    assert.ok(
      error instanceof Error,
      'should not be able to be called from an address that is an oracleHub'
    );

    const txHash = await marketContract.oracleCallBack(100, { from: accounts[0] });
    assert.notEqual(txHash, null, 'oracleCallBack from oracle hub address failed');
  });

  it('oracleCallBack can push contract into settlement', async function() {
    assert.isTrue(!(await marketContract.isSettled()), 'marketContract is already settled');
    await marketContract.oracleCallBack(175, { from: accounts[0] }); // price above cap!
    assert.isTrue(await marketContract.isSettled(), 'marketContract is not settled');
  });

  it('oracleCallBack can not be called after settlement', async function() {
    assert.isTrue(await marketContract.isSettled(), 'marketContract is not settled');
    let error = null;
    try {
      await marketContract.oracleCallBack(175, { from: accounts[0] }); // price above cap!
    } catch (err) {
      error = err;
    }
    assert.ok(error instanceof Error, 'should not be able to be called after expiration');
  });

  it('Should fail to deploy a contract with priceFloor equal to priceCap', async function() {
    const marketContractExpirationInTenSeconds = Math.floor(Date.now() / 1000) + 10;
    let error = null;
    try {
      await MarketContractOraclize.new(
        'ETHUSD-EQUALPRICECAPPRICEFLOOR',
        [accountMaker, marketToken.address, collateralToken.address, collateralPool.address],
        [100000, 100000, 2, 1, marketContractExpirationInTenSeconds],
        'URL',
        'json(https://api.kraken.com/0/public/Ticker?pair=ETHUSD).result.XETHZUSD.c.0',
        { gas: gasLimit, accountMaker }
      );
    } catch (err) {
      error = err;
    }
    assert.ok(error instanceof Error, 'Contract with priceFloor equal to priceCap is possible');
  });

  it('Should fail to deploy a contract with expiration in the past', async function() {
    const marketContractExpirationTenSecondsAgo = Math.floor(Date.now() / 1000) - 10;
    let error = null;
    try {
      await MarketContractOraclize.new(
        'ETHUSD-EQUALPRICECAPPRICEFLOOR',
        [accountMaker, marketToken.address, collateralToken.address, collateralPool.address],
        [10, 100, 2, 1, marketContractExpirationTenSecondsAgo],
        'URL',
        'json(https://api.kraken.com/0/public/Ticker?pair=ETHUSD).result.XETHZUSD.c.0',
        { gas: gasLimit, accountMaker }
      );
    } catch (err) {
      error = err;
    }
    assert.ok(error instanceof Error, 'Contract with expiration in the past is possible');
  });

  it('Should fail to deploy a contract with expiration set after 60 days', async function() {
    const marketContractExpirationInSixtyOneDays =
      Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 61;
    let error = null;
    try {
      await MarketContractOraclize.new(
        'ETHUSD-EQUALPRICECAPPRICEFLOOR',
        [accountMaker, marketToken.address, collateralToken.address, collateralPool.address],
        [10, 100, 2, 1, marketContractExpirationInSixtyOneDays],
        'URL',
        'json(https://api.kraken.com/0/public/Ticker?pair=ETHUSD).result.XETHZUSD.c.0',
        { gas: gasLimit, accountMaker }
      );
    } catch (err) {
      error = err;
    }
    assert.ok(error instanceof Error, 'Contract with expiration set after 60 days is possible');
  });
});
