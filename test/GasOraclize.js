const MarketContractOraclize = artifacts.require("TestableMarketContractOraclize");
const MarketCollateralPool = artifacts.require("MarketCollateralPool");
const MarketToken = artifacts.require("MarketToken");
const CollateralToken = artifacts.require("CollateralToken");
const OrderLib = artifacts.require("OrderLib");
const Helpers = require('./helpers/Helpers.js')
const utility = require('./utility.js');

const ErrorCodes = {
    ORDER_EXPIRED: 0,
    ORDER_DEAD: 1,
}


contract('MarketContractOraclize.Callback', function(accounts) {
    let orderLib;
    let tradeHelper;
    let collateralPool;
    let collateralToken;
    let marketToken;
    let marketContract;

    const accountMaker = accounts[0];

    before(async function() {
        collateralPool = await MarketCollateralPool.deployed();
        marketToken = await MarketToken.deployed();
        marketContract = await MarketContractOraclize.deployed();
        orderLib = await OrderLib.deployed();
        collateralToken = await CollateralToken.deployed();
        tradeHelper = await Helpers.TradeHelper(MarketContractOraclize, OrderLib, CollateralToken, MarketCollateralPool);
    })

    it("gas used by Oraclize callback is within specified limit", async function() {
        // execute the most expensive path for Oraclize callback: settle the contract
        console.log("Creating contract " + new Date().toISOString());
        const marketContractExpirationInTenSeconds = Math.floor(Date.now() / 1000) + 10;
        const oraclizeQueryCallbackRepeat = 7; // callback will be fired once
        const priceFloor = 1;
        const priceCap = 1000000; // 10k USD
        MarketContractOraclize.new(
            "ETHUSD-10",
            marketToken.address,
            collateralToken.address,
            [priceFloor, priceCap, 2, 1, marketContractExpirationInTenSeconds],
            "URL",
            "json(https://api.kraken.com/0/public/Ticker?pair=ETHUSD).result.XETHZUSD.c.0",
            oraclizeQueryCallbackRepeat,
            { gas: 6200000, value: web3.toWei('.1', 'ether'), accountMaker}
        ).then(async function(deployedMarketContract) {
            console.log("Contract deployed " + new Date().toISOString());
            console.log("Contract address " + deployedMarketContract.address);
            let oraclizeCallbackGasCost = await deployedMarketContract.QUERY_CALLBACK_GAS.call();
            console.log("Market Contract Oraclize callback gas limit : " + oraclizeCallbackGasCost.toNumber());
            let contractSettledEvent = deployedMarketContract.ContractSettled();
            contractSettledEvent.watch((err, response) => {
                    console.log("Contract settled at " + new Date().toISOString());
                    console.log(response.transactionHash);
                    console.log(response.args.settlePrice.toNumber() / 100);
                    contractSettledEvent.stopWatching();
                    assert.equal(response.event, 'ContractSettled');
                    let txReceipt = web3.eth.getTransactionReceipt(response.transactionHash);
                    console.log("Oraclize callback gas used : " + txReceipt.gasUsed);
                    return response;
            });
        })
    })
});
