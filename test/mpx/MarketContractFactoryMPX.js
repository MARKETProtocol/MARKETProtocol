const MarketContractMPX = artifacts.require('MarketContractMPX');
const MarketContractFactoryMPX = artifacts.require('MarketContractFactoryMPX');
const CollateralToken = artifacts.require('CollateralToken');
const MarketContractRegistry = artifacts.require('MarketContractRegistry');
const truffleAssert = require('truffle-assertions');

contract('MarketContractFactoryMPX', function(accounts) {
  const expiration = Math.round(new Date().getTime() / 1000 + 60 * 50); //expires 50 minutes from now.
  const oracleURL = 'api.coincap.io/v2/rates/bitcoin';
  const oracleStatistic = 'rateUsd';
  const contractName = [
    web3.utils.asciiToHex('ETHUSD', 32),
    web3.utils.asciiToHex('LETH', 32),
    web3.utils.asciiToHex('SETH', 32)
  ];
  const priceCap = 60465;
  const priceFloor = 20155;
  const priceDecimalPlaces = 2;
  const qtyMultiplier = 10;
  const feesInCollateralToken = 20;
  const feesInMKTToken = 10;

  let marketContractFactory;
  let marketContractRegistry;

  before(async function() {
    marketContractFactory = await MarketContractFactoryMPX.deployed();
    marketContractRegistry = await MarketContractRegistry.deployed();
  });

  it('Deploys a new MarketContract with the correct variables', async function() {
    let result = await marketContractFactory.deployMarketContractMPX(
      contractName,
      CollateralToken.address,
      [
        priceFloor,
        priceCap,
        priceDecimalPlaces,
        qtyMultiplier,
        feesInCollateralToken,
        feesInMKTToken,
        expiration
      ],
      oracleURL,
      oracleStatistic
    );

    // Should fire the MarketContractCreated event!
    let marketContractAddress;
    await truffleAssert.eventEmitted(result, 'MarketContractCreated', createdEvent => {
      marketContractAddress = createdEvent.contractAddress;
      return true;
    });

    const marketContract = await MarketContractMPX.at(marketContractAddress);
    assert.equal(await marketContract.ORACLE_URL(), oracleURL);
    assert.equal(await marketContract.ORACLE_STATISTIC(), oracleStatistic);
    assert.equal((await marketContract.EXPIRATION()).toNumber(), expiration);
    assert.equal((await marketContract.QTY_MULTIPLIER()).toNumber(), qtyMultiplier);
    assert.equal((await marketContract.PRICE_DECIMAL_PLACES()).toNumber(), priceDecimalPlaces);
    assert.equal((await marketContract.PRICE_FLOOR()).toNumber(), priceFloor);
    assert.equal((await marketContract.PRICE_CAP()).toNumber(), priceCap);
    assert.equal(await marketContract.COLLATERAL_TOKEN_ADDRESS(), CollateralToken.address);
    assert.equal(
      (await marketContract.CONTRACT_NAME()).replace(/\0.*$/g, ''),
      web3.utils.toUtf8(contractName[0])
    );
  });

  it('Adds a new MarketContract to the white list', async function() {
    const result = await marketContractFactory.deployMarketContractMPX(
      contractName,
      CollateralToken.address,
      [
        priceFloor,
        priceCap,
        priceDecimalPlaces,
        qtyMultiplier,
        feesInCollateralToken,
        feesInMKTToken,
        expiration
      ],
      oracleURL,
      oracleStatistic
    );

    // Should fire the MarketContractCreated event!
    let marketContractAddress;
    await truffleAssert.eventEmitted(result, 'MarketContractCreated', async createdEvent => {
      marketContractAddress = createdEvent.contractAddress;
      return true;
    });

    let registryTransaction = await truffleAssert.createTransactionResult(
      marketContractRegistry,
      result.tx
    );
    await truffleAssert.eventEmitted(
      registryTransaction,
      'AddressAddedToWhitelist',
      whitelistEvent => {
        return marketContractAddress === whitelistEvent.contractAddress;
      }
    );
  });

  it('Allows the registry address to be changed only by the owner', async function() {
    const originalRegistryAddress = await marketContractFactory.marketContractRegistry();
    let error = null;
    try {
      await marketContractFactory.setRegistryAddress(accounts[1], { from: accounts[1] });
    } catch (err) {
      error = err;
    }
    assert.ok(error instanceof Error, 'should not be able to set registry from non-owner account');

    await marketContractFactory.setRegistryAddress(accounts[1], { from: accounts[0] });

    assert.equal(
      await marketContractFactory.marketContractRegistry(),
      accounts[1],
      'did not correctly set the registry address'
    );

    error = null;
    try {
      await marketContractFactory.setRegistryAddress(null, { from: accounts[0] });
    } catch (err) {
      error = err;
    }
    assert.ok(error instanceof Error, 'should not be able to set registry to null address');

    await marketContractFactory.setRegistryAddress(originalRegistryAddress, { from: accounts[0] }); // set address back
  });

  it('Allows the oracle hub address to be changed only by the owner', async function() {
    const originalHubAddress = await marketContractFactory.oracleHub();
    let error = null;
    try {
      await marketContractFactory.setOracleHubAddress(accounts[1], { from: accounts[1] });
    } catch (err) {
      error = err;
    }
    assert.ok(
      error instanceof Error,
      'should not be able to set the hub address from non-owner account'
    );

    await marketContractFactory.setOracleHubAddress(accounts[1], { from: accounts[0] });

    assert.equal(
      await marketContractFactory.oracleHub(),
      accounts[1],
      'did not correctly set the hub address'
    );

    error = null;
    try {
      await marketContractFactory.setOracleHubAddress(null, { from: accounts[0] });
    } catch (err) {
      error = err;
    }
    assert.ok(error instanceof Error, 'should not be able to set hub to null address');

    await marketContractFactory.setOracleHubAddress(originalHubAddress, { from: accounts[0] }); // set address back
  });
});
