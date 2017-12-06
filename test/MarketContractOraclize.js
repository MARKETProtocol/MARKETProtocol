const MarketContractOraclize = artifacts.require("MarketContractOraclize");
const MarketCollateralPool = artifacts.require("MarketCollateralPool");
const MarketToken = artifacts.require("MarketToken");
const CollateralToken = artifacts.require("CollateralToken");
const OrderLib = artifacts.require("OrderLib");
const utility = require('./utility.js');


// basic tests for interacting with market contract.
contract('MarketContractOraclize', function(accounts) {

    var collateralPool;
    var marketToken;
    var marketContract;
    var collateralToken;
    var orderLib;
    var makerAccountBalanceBeforeTrade;
    var takerAccountBalanceBeforeTrade;
    var entryOrderPrice = 33025;
    const accountMaker = accounts[0];
    const accountTaker = accounts[1];
    it("Trade occurs, cancel occurs, balances transferred, positions updated", async function() {
        collateralPool = await MarketCollateralPool.deployed();
        marketToken = await MarketToken.deployed();
        marketContract = await MarketContractOraclize.deployed();
        orderLib = await OrderLib.deployed();
        collateralToken = await CollateralToken.deployed();

        var timeStamp = ((new Date()).getTime() / 1000) + 60*5; // order expires 5 minute from now.
        var orderAddresses = [accountMaker, accountTaker, accounts[2]];
        var unsignedOrderValues = [0, 0, entryOrderPrice, timeStamp, 1];
        var orderQty = 5;   // user is attempting to buy 5
        var orderHash = await orderLib.createOrderHash.call(
            MarketContractOraclize.address,
            orderAddresses,
            unsignedOrderValues,
            orderQty
        );

        // transfer half of the collateral tokens to the second account.
        initBalance = await collateralToken.INITIAL_SUPPLY.call().valueOf();
        var balanceToTransfer = initBalance / 2;
        await collateralToken.transfer(accounts[1], balanceToTransfer, {from: accounts[0]});

        // create approval and deposit collateral tokens for trading.
        var amountToDeposit = 5000000;
        await collateralToken.approve(collateralPool.address, amountToDeposit, {from: accounts[0]})
        await collateralToken.approve(collateralPool.address, amountToDeposit, {from: accounts[1]})

        // move tokens to the collateralPool
        await collateralPool.depositTokensForTrading(amountToDeposit, {from: accounts[0]})
        await collateralPool.depositTokensForTrading(amountToDeposit, {from: accounts[1]})

        makerAccountBalanceBeforeTrade = await collateralPool.getUserAccountBalance.call(accounts[0]);
        takerAccountBalanceBeforeTrade = await collateralPool.getUserAccountBalance.call(accounts[1]);

        // Execute trade between maker and taker for partial amount of order.
        var qtyToFill = 1;
        var orderSignature = utility.signMessage(web3, accountMaker, orderHash)
        await marketContract.tradeOrder(
            orderAddresses,
            unsignedOrderValues,
            orderQty,                  // qty is five
            qtyToFill,          // let us fill a one lot
            orderSignature[0],  // v
            orderSignature[1],  // r
            orderSignature[2],  // s
            {from: accountTaker}
        );

        var makerNetPos = await collateralPool.getUserPosition.call(accountMaker);
        var takerNetPos = await collateralPool.getUserPosition.call(accountTaker);
        assert.equal(makerNetPos.toNumber(), 1, "Maker should be long 1");
        assert.equal(takerNetPos.toNumber(), -1, "Taker should be short 1");

        var qtyFilledOrCancelled = await marketContract.getQtyFilledOrCancelledFromOrder.call(orderHash);
        assert.equal(qtyFilledOrCancelled.toNumber(), 1, "Fill Qty doesn't match expected");

        await marketContract.cancelOrder(orderAddresses, unsignedOrderValues, 5, 1); //cancel part of order
        qtyFilledOrCancelled = await marketContract.getQtyFilledOrCancelledFromOrder.call(orderHash);
        assert.equal(qtyFilledOrCancelled.toNumber(), 2, "Fill Or Cancelled Qty doesn't match expected");

        // after the execution we should have collateral transferred from users to the pool, check all balances
        // here.
        var priceFloor = await marketContract.PRICE_FLOOR.call();
        var priceCap = await marketContract.PRICE_CAP.call();
        var decimalPlaces = await marketContract.QTY_DECIMAL_PLACES.call();
        var actualCollateralPoolBalance = await collateralPool.collateralPoolBalance.call();

        var longCollateral = (entryOrderPrice - priceFloor) * decimalPlaces * qtyToFill;
        var shortCollateral = (priceCap - entryOrderPrice) * decimalPlaces * qtyToFill;
        var totalExpectedCollateralBalance = longCollateral + shortCollateral;

        assert.equal(
            totalExpectedCollateralBalance,
            actualCollateralPoolBalance,
            "Collateral pool isn't funded correctly"
        );

        var makerAccountBalanceAfterTrade = await collateralPool.getUserAccountBalance.call(accounts[0]);
        var takerAccountBalanceAfterTrade = await collateralPool.getUserAccountBalance.call(accounts[1]);

        assert.equal(
            makerAccountBalanceAfterTrade,
            makerAccountBalanceBeforeTrade - longCollateral,
            "Maker balance is wrong"
        );
        assert.equal(
            takerAccountBalanceAfterTrade,
            takerAccountBalanceBeforeTrade - shortCollateral,
            "Taker balance is wrong"
        );
    });

    var exitOrderPrice = 36025;
    it("Trade is unwound, correct collateral amount returns to user balances", async function() {
        var timeStamp = ((new Date()).getTime() / 1000) + 60*5; // order expires 5 minute from now.
        var orderAddresses = [accountMaker, accountTaker, accounts[2]];
        var orderPrice = 36025;
        var unsignedOrderValues = [0, 0, orderPrice, timeStamp, 1];
        var orderQty = -5;   // user is attempting to sell -5
        var orderHash = await orderLib.createOrderHash.call(
            MarketContractOraclize.address,
            orderAddresses,
            unsignedOrderValues,
            orderQty
        );


        // Execute trade between maker and taker for partial amount of order.
        var qtyToFill = -1;
        var orderSignature = utility.signMessage(web3, accountMaker, orderHash)
        await marketContract.tradeOrder(
            orderAddresses,
            unsignedOrderValues,
            orderQty,                 // qty is five
            qtyToFill,          // let us fill a one lot
            orderSignature[0],  // v
            orderSignature[1],  // r
            orderSignature[2],  // s
            {from: accountTaker}
        );

        var makerNetPos = await collateralPool.getUserPosition.call(accountMaker);
        var takerNetPos = await collateralPool.getUserPosition.call(accountTaker);
        assert.equal(makerNetPos.toNumber(), 0, "Maker should be flat");
        assert.equal(takerNetPos.toNumber(), 0, "Taker should be flat");

        var qtyFilledOrCancelled = await marketContract.getQtyFilledOrCancelledFromOrder.call(orderHash);
        assert.equal(qtyFilledOrCancelled.toNumber(), -1, "Fill Qty doesn't match expected");

        await marketContract.cancelOrder(orderAddresses, unsignedOrderValues, -5, -1); //cancel part of order
        qtyFilledOrCancelled = await marketContract.getQtyFilledOrCancelledFromOrder.call(orderHash);
        assert.equal(qtyFilledOrCancelled.toNumber(), -2, "Fill Or Cancelled Qty doesn't match expected");

        // after the execution we should have collateral transferred from pool to the users since they are now flat!
        var actualCollateralPoolBalance = await collateralPool.collateralPoolBalance.call();
        assert.equal(
            actualCollateralPoolBalance.toNumber(),
            0,
            "Collateral pool should be completely empty"
        );

        var makerAccountBalanceAfterTrade = await collateralPool.getUserAccountBalance.call(accounts[0]);
        var takerAccountBalanceAfterTrade = await collateralPool.getUserAccountBalance.call(accounts[1]);
        var decimalPlaces = await marketContract.QTY_DECIMAL_PLACES.call();
        var profitForMaker = (exitOrderPrice - entryOrderPrice) * decimalPlaces;

        assert.equal(
            makerAccountBalanceAfterTrade - makerAccountBalanceBeforeTrade,
            profitForMaker,
            "Maker balance is wrong - profit amount doesn't make sense"
        );
        assert.equal(
            takerAccountBalanceAfterTrade - takerAccountBalanceBeforeTrade,
            profitForMaker * -1,
            "Taker balance is wrong - loss amount doesn't make sense"
        );
    });

        // TODO:
        //      - attempt to fill expired order
        //      - attempt to trade zero qty
        //      - order with zero qty
        //      - order with values manipulated
        //      - fees get transferred to recipient correctly.
        //      - attempt to trade / cancel post expiration
        //      - expiration methods
        //      - settleAndClose()

    it("should only allow remaining quantity to be filled for an overfilled trade.", async function() {
        const timeStamp = ((new Date()).getTime() / 1000) + 60*5; // order expires 5 minute from now.
        const orderAddresses = [accountMaker, accountTaker, accounts[2]];
        const unsignedOrderValues = [0, 0, entryOrderPrice, timeStamp, 1];
        const orderQty = 5;   // user is attempting to buy 5
        const qtyToFill = 10; // order is to be filled by 10
        const orderHash = await orderLib.createOrderHash.call(
            MarketContractOraclize.address,
            orderAddresses,
            unsignedOrderValues,
            orderQty
        );

        const expectedQtyFilled = 5;

        // Execute trade between maker and taker for partial amount of order.
        const orderSignature = utility.signMessage(web3, accountMaker, orderHash)
        const actualQtyFilled = await marketContract.tradeOrder.call(
            orderAddresses,
            unsignedOrderValues,
            orderQty, // 5
            qtyToFill, // 10
            orderSignature[0],  // v
            orderSignature[1],  // r
            orderSignature[2],  // s
            {from: accountTaker}
        );

        assert.equal(expectedQtyFilled, actualQtyFilled.toNumber(), "Quantity filled doesn't match expected");
    })

    it("should only allow remaining quantity to be cancelled for an over cancelled trade.", async function() {
        const timeStamp = ((new Date()).getTime() / 1000) + 60*5; // order expires 5 minute from now.
        const orderAddresses = [accountMaker, accountTaker, accounts[2]];
        const unsignedOrderValues = [0, 0, entryOrderPrice, timeStamp, 1];
        const orderQty = -5;   // user is attempting to sell 5
        const qtyToFill = -1; // order is to be filled by 1
        const orderHash = await orderLib.createOrderHash.call(
            MarketContractOraclize.address,
            orderAddresses,
            unsignedOrderValues,
            orderQty
        );

        // Execute trade between maker and taker for partial amount of order.
        const orderSignature = utility.signMessage(web3, accountMaker, orderHash)
        await marketContract.tradeOrder.call(
            orderAddresses,
            unsignedOrderValues,
            orderQty, // -5
            qtyToFill, // fill one slot
            orderSignature[0],  // v
            orderSignature[1],  // r
            orderSignature[2],  // s
            {from: accountTaker}
        );

        const expectedQtyCancelled = -5
        const qtyToCancel = -7;
        // over cancel order
        const actualQtyCancelled = await marketContract.cancelOrder.call(
            orderAddresses,
            unsignedOrderValues,
            orderQty,
            qtyToCancel);

        assert.equal(expectedQtyCancelled, actualQtyCancelled.toNumber(), "Quantity cancelled doesn't match expected.");
    })
});