const MarketContractOraclize = artifacts.require('TestableMarketContractOraclize');
const MarketCollateralPool = artifacts.require('MarketCollateralPool');
const MarketToken = artifacts.require('MarketToken');
const MarketContractRegistry = artifacts.require('MarketContractRegistry');
const CollateralToken = artifacts.require('CollateralToken');
const OrderLib = artifacts.require('OrderLib');
const utility = require('./utility.js');

contract('MarketContractRegistry', function(accounts) {
  let collateralPool;
  let marketToken;
  let marketContract;
  let collateralToken;
  let marketContractRegistry;

  beforeEach(async function() {
    collateralPool = await MarketCollateralPool.deployed();
    marketToken = await MarketToken.deployed();
    marketContract = await MarketContractOraclize.deployed();
    collateralToken = await CollateralToken.deployed();
    marketContractRegistry = await MarketContractRegistry.deployed();
  });

  it('Only owner is able to add or remove contracts to the white list', async function() {
    const ownerAddress = await marketContractRegistry.owner.call();
    assert.equal(accounts[0], ownerAddress, "owner isn't our first account");

    var isAddressWhiteListed = await marketContractRegistry.isAddressWhiteListed.call(
      marketContract.address
    );
    assert.isTrue(isAddressWhiteListed, 'Deployed Market Contract is not White Listed');

    var addressWhiteList = await marketContractRegistry.getAddressWhiteList.call();
    var addressIndex = -1;
    for (i = 0; i < addressWhiteList.length; i++) {
      var deployedAddress = addressWhiteList[i];
      if (deployedAddress == marketContract.address) {
        addressIndex = i;
        break;
      }
    }
    assert.isTrue(addressIndex != -1, 'Address not found in white list');

    let error = null;
    try {
      await marketContractRegistry.removeContractFromWhiteList(
        marketContract.address,
        addressIndex,
        { from: accounts[1] }
      );
    } catch (err) {
      error = err;
    }
    assert.ok(error instanceof Error, "Removing contract from whitelist by non owner didn't fail!");

    isAddressWhiteListed = await marketContractRegistry.isAddressWhiteListed.call(
      marketContract.address
    );
    assert.isTrue(
      isAddressWhiteListed,
      'Market Contract was removed from white list by non owner!'
    );

    await marketContractRegistry.removeContractFromWhiteList(marketContract.address, addressIndex, {
      from: accounts[0]
    });

    isAddressWhiteListed = await marketContractRegistry.isAddressWhiteListed.call(
      marketContract.address
    );
    assert.isTrue(
      !isAddressWhiteListed,
      'Market Contract was not removed from white list by owner'
    );

    error = null;
    try {
      await marketContractRegistry.addAddressToWhiteList(marketContract.address, {
        from: accounts[1]
      });
    } catch (err) {
      error = err;
    }
    assert.ok(error instanceof Error, "Adding contract to whitelist by non owner didn't fail!");

    await marketContractRegistry.addAddressToWhiteList(marketContract.address, {
      from: accounts[0]
    });
    isAddressWhiteListed = await marketContractRegistry.isAddressWhiteListed.call(
      marketContract.address
    );
    assert.isTrue(
      isAddressWhiteListed,
      'Market Contract was not added back to white list by owner'
    );
  });

  it('Non white listed contract cannot be removed', async function() {
    const ownerAddress = await marketContractRegistry.owner.call();
    assert.equal(accounts[0], ownerAddress, "owner isn't our first account");

    var isAddressWhiteListed = await marketContractRegistry.isAddressWhiteListed.call(
      marketContract.address
    );
    assert.isTrue(isAddressWhiteListed, 'Deployed Market Contract is not White Listed');

    var addressWhiteList = await marketContractRegistry.getAddressWhiteList.call();
    var addressIndex = -1;
    for (i = 0; i < addressWhiteList.length; i++) {
      var deployedAddress = addressWhiteList[i];
      if (deployedAddress == marketContract.address) {
        addressIndex = i;
        break;
      }
    }
    assert.isTrue(addressIndex != -1, 'Address not found in white list');

    await marketContractRegistry.removeContractFromWhiteList(marketContract.address, addressIndex, {
      from: accounts[0]
    });

    isAddressWhiteListed = await marketContractRegistry.isAddressWhiteListed.call(
      marketContract.address
    );
    assert.isTrue(
      !isAddressWhiteListed,
      'Market Contract was not removed from white list by owner'
    );

    error = null;
    try {
      await marketContractRegistry.removeContractFromWhiteList(
        marketContract.address,
        addressIndex,
        { from: accounts[0] }
      );
    } catch (err) {
      error = err;
    }
    assert.ok(
      error instanceof Error,
      "removing non white listed contract to whitelist by non owner didn't fail!"
    );

    await marketContractRegistry.addAddressToWhiteList(marketContract.address, {
      from: accounts[0]
    });
    isAddressWhiteListed = await marketContractRegistry.isAddressWhiteListed.call(
      marketContract.address
    );
    assert.isTrue(
      isAddressWhiteListed,
      'Market Contract was not added back to white list by owner'
    );
  });

  it('White listed contract cannot be removed with bad index', async function() {
    const ownerAddress = await marketContractRegistry.owner.call();
    assert.equal(accounts[0], ownerAddress, "owner isn't our first account");

    var isAddressWhiteListed = await marketContractRegistry.isAddressWhiteListed.call(
      marketContract.address
    );
    assert.isTrue(isAddressWhiteListed, 'Deployed Market Contract is not White Listed');

    // we need to deploy a second market contract and add it to the white list in order
    // for us to test the case where there are multiple addresses in the white list and we
    // attempt to remove one with an incorrect index.
    var addressWhiteList = await marketContractRegistry.getAddressWhiteList.call();
    var addressIndex = -1;
    for (i = 0; i < addressWhiteList.length; i++) {
      var deployedAddress = addressWhiteList[i];
      if (deployedAddress == marketContract.address) {
        addressIndex = i;
        break;
      }
    }
    assert.isTrue(addressIndex != -1, 'Address not found in white list');
    // find a valid index, but not the correct one for this contract and attempt to remove it!
    var wrongIndex = addressIndex == addressWhiteList.length - 1 ? 0 : addressWhiteList.length - 1;
    error = null;
    try {
      await marketContractRegistry.removeContractFromWhiteList(
        marketContract.address,
        wrongIndex, //random index
        { from: accounts[0] }
      );
    } catch (err) {
      error = err;
    }
    assert.ok(
      error instanceof Error,
      "removing non white listed contract to whitelist by non owner didn't fail!"
    );
  });
});
