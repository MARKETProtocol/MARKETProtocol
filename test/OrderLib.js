const OrderLib = artifacts.require("OrderLib");
const MarketContractOraclize = artifacts.require("MarketContractOraclize");
const utility = require('./utility.js');

contract('OrderLib', function(accounts) {
    var orderLib;
    it("Orders are signed correctly", async function() {
        orderLib = await OrderLib.deployed();
        var timeStamp = ((new Date()).getTime() / 1000) + 60*5; // order expires 5 minute from now.
        var orderAddresses = [accounts[0], accounts[1], accounts[2]];
        var unsignedOrderValues = [0, 0, 33025, timeStamp, 0];
        var orderQty = 5;   // user is attempting to buy 5
        var orderHash = await orderLib.createOrderHash.call(
            MarketContractOraclize.address,
            orderAddresses,
            unsignedOrderValues,
            orderQty
        );
        var orderSignature = utility.signMessage(web3, accounts[0], orderHash)
        assert.isTrue(await orderLib.isValidSignature.call(
            accounts[0],
            orderHash,
            orderSignature[0],
            orderSignature[1],
            orderSignature[2]),
            "Order hash doesn't match signer"
        );
        assert.isTrue(!await orderLib.isValidSignature.call(
            accounts[1],
            orderHash,
            orderSignature[0],
            orderSignature[1],
            orderSignature[2]),
            "Order hash matches a non signer"
        );
    });
});