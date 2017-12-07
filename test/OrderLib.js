const OrderLib = artifacts.require("OrderLib");
const MarketContractOraclize = artifacts.require("MarketContractOraclize");
const utility = require('./utility.js');

contract('OrderLib', function(accounts) {
    let orderLib;
    it("Orders are signed correctly", async function() {
        orderLib = await OrderLib.deployed();
        const timeStamp = ((new Date()).getTime() / 1000) + 60*5; // order expires 5 minute from now.
        const orderAddresses = [accounts[0], accounts[1], accounts[2]];
        const unsignedOrderValues = [0, 0, 33025, timeStamp, 0];
        const orderQty = 5;   // user is attempting to buy 5
        const orderHash = await orderLib.createOrderHash.call(
            MarketContractOraclize.address,
            orderAddresses,
            unsignedOrderValues,
            orderQty
        );
        const orderSignature = utility.signMessage(web3, accounts[0], orderHash)
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