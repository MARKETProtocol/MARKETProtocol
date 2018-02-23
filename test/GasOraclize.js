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
        const marketContractExpirationInTenSeconds = Math.floor(Date.now() / 1000) + 10;
        const oraclizeQueryCallbackRepeat = 7; // callback will be fired once
        const priceFloor = 1;
        const priceCap = 1000000; // 10k USD
        let sleep = (ms) => {
            return new Promise(resolve => setTimeout(resolve, ms));
        };
        let gasLimit = 6200000;  // gas limit for development network
        let block = web3.eth.getBlock("latest");
        if (block.gasLimit > 7000000) {  // coverage network
            gasLimit = block.gasLimit;
        }
        MarketContractOraclize.new(
            "ETHUSD-10",
            marketToken.address,
            collateralToken.address,
            [priceFloor, priceCap, 2, 1, marketContractExpirationInTenSeconds],
            "URL",
            "json(https://api.kraken.com/0/public/Ticker?pair=ETHUSD).result.XETHZUSD.c.0",
            oraclizeQueryCallbackRepeat,
            { gas: gasLimit, value: web3.toWei('.1', 'ether'), accountMaker}
        ).then(async function(deployedMarketContract) {
            /*
            console.log("Contract deployed " + new Date().toISOString());
            console.log("Contract address " + deployedMarketContract.address);\
            */
            let oraclizeCallbackGasCost = await deployedMarketContract.QUERY_CALLBACK_GAS.call();
            // console.log("Market Contract Oraclize callback gas limit : " + oraclizeCallbackGasCost.toNumber());
            let contractSettledEvent = deployedMarketContract.ContractSettled();
            let txReceipt = null;  // Oraclize callback transaction receipt
            contractSettledEvent.watch((err, response) => {
                if (err) {
                    console.log(err);
                };
                /*
                console.log("Contract settled at " + new Date().toISOString());
                console.log(response.transactionHash);
                console.log("Settlement price " + response.args.settlePrice.toNumber() / 100);
                */
                contractSettledEvent.stopWatching();
                assert.equal(response.event, 'ContractSettled');
                txReceipt = web3.eth.getTransactionReceipt(response.transactionHash);
                console.log("Oraclize callback gas used : " + txReceipt.gasUsed);
                assert.isBelow(txReceipt.gasUsed, oraclizeCallbackGasCost,
                               "Callback tx claims to have used more gas than allowed!");
                return response;
            });
            await sleep(30000);  // allow 30 seconds for the callback just in case Oraclize is slow
            assert.notEqual(txReceipt, null, "Oraclize callback did not arrive. Please increase QUERY_CALLBACK_GAS!");
        });
    })
});
