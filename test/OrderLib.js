const OrderLib = artifacts.require('OrderLibMock');
const utility = require('./utility.js');
const MarketContractOraclize = artifacts.require('TestableMarketContractOraclize');
const MarketCollateralPool = artifacts.require('MarketCollateralPool');
const MarketContractRegistry = artifacts.require('MarketContractRegistry');

contract('OrderLib', function(accounts) {
  let orderLib;
  let marketContractRegistry;
  let marketContract;

  it('Orders are signed correctly', async function() {
    orderLib = await OrderLib.deployed();
    marketContractRegistry = await MarketContractRegistry.deployed();
    var whiteList = await marketContractRegistry.getAddressWhiteList.call();
    marketContract = await MarketContractOraclize.at(whiteList[1]);

    const timeStamp = new Date().getTime() / 1000 + 60 * 5; // order expires 5 minute from now.
    const orderAddresses = [accounts[0], accounts[1], accounts[2]];
    const unsignedOrderValues = [0, 0, 33025, timeStamp, 0];
    const orderQty = 5; // user is attempting to buy 5

    const orderHash = await orderLib._createOrderHash.call(
      marketContract.address,
      orderAddresses,
      unsignedOrderValues,
      orderQty
    );
    const orderSignature = utility.signMessage(web3, accounts[0], orderHash);
    assert.isTrue(
      await orderLib._isValidSignature.call(
        accounts[0],
        orderHash,
        orderSignature[0],
        orderSignature[1],
        orderSignature[2]
      ),
      "Order hash doesn't match signer"
    );
    assert.isTrue(
      !(await orderLib._isValidSignature.call(
        accounts[1],
        orderHash,
        orderSignature[0],
        orderSignature[1],
        orderSignature[2]
      )),
      'Order hash matches a non signer'
    );
  });
});
