const MarketContractOraclize = artifacts.require("MarketContractOraclize");
const MarketCollateralPool = artifacts.require("MarketCollateralPool");
const MarketToken = artifacts.require("MarketToken");
const CollateralToken = artifacts.require("CollateralToken");
const OrderLib = artifacts.require("OrderLib");
const utility = require('./utility.js');

const ErrorCodes = {
    ORDER_EXPIRED: 0,
    ORDER_DEAD: 1,
}


// basic tests for interacting with market contract.
contract('MarketContractOraclize', function(accounts) {

    let collateralPool;
    let marketToken;
    let marketContract;
    let collateralToken;
    let orderLib;
    let makerAccountBalanceBeforeTrade;
    let takerAccountBalanceBeforeTrade;
    const entryOrderPrice = 33025;
    const accountMaker = accounts[0];
    const accountTaker = accounts[1];
    it("Trade occurs, cancel occurs, balances transferred, positions updated", async function() {
        collateralPool = await MarketCollateralPool.deployed();
        marketToken = await MarketToken.deployed();
        marketContract = await MarketContractOraclize.deployed();
        orderLib = await OrderLib.deployed();
        collateralToken = await CollateralToken.deployed();

        let timeStamp = ((new Date()).getTime() / 1000) + 60*5; // order expires 5 minute from now.
        let orderAddresses = [accountMaker, accountTaker, accounts[2]];
        let unsignedOrderValues = [0, 0, entryOrderPrice, timeStamp, 1];
        let orderQty = 5;   // user is attempting to buy 5
        let orderHash = await orderLib.createOrderHash.call(
            MarketContractOraclize.address,
            orderAddresses,
            unsignedOrderValues,
            orderQty
        );

        // transfer half of the collateral tokens to the second account.
        initBalance = await collateralToken.INITIAL_SUPPLY.call().valueOf();
        const balanceToTransfer = initBalance / 2;
        await collateralToken.transfer(accounts[1], balanceToTransfer, {from: accounts[0]});

        // create approval and deposit collateral tokens for trading.
        const amountToDeposit = 5000000;
        await collateralToken.approve(collateralPool.address, amountToDeposit, {from: accounts[0]})
        await collateralToken.approve(collateralPool.address, amountToDeposit, {from: accounts[1]})

        // move tokens to the collateralPool
        await collateralPool.depositTokensForTrading(amountToDeposit, {from: accounts[0]})
        await collateralPool.depositTokensForTrading(amountToDeposit, {from: accounts[1]})

        makerAccountBalanceBeforeTrade = await collateralPool.getUserAccountBalance.call(accounts[0]);
        takerAccountBalanceBeforeTrade = await collateralPool.getUserAccountBalance.call(accounts[1]);

        // Execute trade between maker and taker for partial amount of order.
        const qtyToFill = 1;
        const orderSignature = utility.signMessage(web3, accountMaker, orderHash)
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

        const makerNetPos = await collateralPool.getUserPosition.call(accountMaker);
        const takerNetPos = await collateralPool.getUserPosition.call(accountTaker);
        assert.equal(makerNetPos.toNumber(), 1, "Maker should be long 1");
        assert.equal(takerNetPos.toNumber(), -1, "Taker should be short 1");

        const qtyFilled = await marketContract.getQtyFilledOrCancelledFromOrder.call(orderHash);
        assert.equal(qtyFilled.toNumber(), 1, "Fill Qty doesn't match expected");

        await marketContract.cancelOrder(orderAddresses, unsignedOrderValues, 5, 1); //cancel part of order
        const qtyFilledOrCancelled = await marketContract.getQtyFilledOrCancelledFromOrder.call(orderHash);
        assert.equal(qtyFilledOrCancelled.toNumber(), 2, "Fill Or Cancelled Qty doesn't match expected");

        // after the execution we should have collateral transferred from users to the pool, check all balances
        // here.
        const priceFloor = await marketContract.PRICE_FLOOR.call();
        const priceCap = await marketContract.PRICE_CAP.call();
        const decimalPlaces = await marketContract.QTY_DECIMAL_PLACES.call();
        const actualCollateralPoolBalance = await collateralPool.collateralPoolBalance.call();

        const longCollateral = (entryOrderPrice - priceFloor) * decimalPlaces * qtyToFill;
        const shortCollateral = (priceCap - entryOrderPrice) * decimalPlaces * qtyToFill;
        const totalExpectedCollateralBalance = longCollateral + shortCollateral;

        assert.equal(
            totalExpectedCollateralBalance,
            actualCollateralPoolBalance,
            "Collateral pool isn't funded correctly"
        );

        const makerAccountBalanceAfterTrade = await collateralPool.getUserAccountBalance.call(accounts[0]);
        const takerAccountBalanceAfterTrade = await collateralPool.getUserAccountBalance.call(accounts[1]);

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

    const exitOrderPrice = 36025;
    it("Trade is unwound, correct collateral amount returns to user balances", async function() {
        const timeStamp = ((new Date()).getTime() / 1000) + 60*5; // order expires 5 minute from now.
        const orderAddresses = [accountMaker, accountTaker, accounts[2]];
        const orderPrice = 36025;
        const unsignedOrderValues = [0, 0, orderPrice, timeStamp, 1];
        const orderQty = -5;   // user is attempting to sell -5
        const orderHash = await orderLib.createOrderHash.call(
            MarketContractOraclize.address,
            orderAddresses,
            unsignedOrderValues,
            orderQty
        );


        // Execute trade between maker and taker for partial amount of order.
        const qtyToFill = -1;
        const orderSignature = utility.signMessage(web3, accountMaker, orderHash)
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

        const makerNetPos = await collateralPool.getUserPosition.call(accountMaker);
        const takerNetPos = await collateralPool.getUserPosition.call(accountTaker);
        assert.equal(makerNetPos.toNumber(), 0, "Maker should be flat");
        assert.equal(takerNetPos.toNumber(), 0, "Taker should be flat");

        const qtyFilled = await marketContract.getQtyFilledOrCancelledFromOrder.call(orderHash);
        assert.equal(qtyFilled.toNumber(), -1, "Fill Qty doesn't match expected");

        await marketContract.cancelOrder(orderAddresses, unsignedOrderValues, -5, -1); //cancel part of order
        const qtyFilledOrCancelled = await marketContract.getQtyFilledOrCancelledFromOrder.call(orderHash);
        assert.equal(qtyFilledOrCancelled.toNumber(), -2, "Fill Or Cancelled Qty doesn't match expected");

        // after the execution we should have collateral transferred from pool to the users since they are now flat!
        const actualCollateralPoolBalance = await collateralPool.collateralPoolBalance.call();
        assert.equal(
            actualCollateralPoolBalance.toNumber(),
            0,
            "Collateral pool should be completely empty"
        );

        const makerAccountBalanceAfterTrade = await collateralPool.getUserAccountBalance.call(accounts[0]);
        const takerAccountBalanceAfterTrade = await collateralPool.getUserAccountBalance.call(accounts[1]);
        const decimalPlaces = await marketContract.QTY_DECIMAL_PLACES.call();
        const profitForMaker = (exitOrderPrice - entryOrderPrice) * decimalPlaces;

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

        // Execute trade between maker and taker for overfilled amount of order.
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
        await marketContract.tradeOrder(
            orderAddresses,
            unsignedOrderValues,
            orderQty, // -5
            qtyToFill, // fill one slot
            orderSignature[0],  // v
            orderSignature[1],  // r
            orderSignature[2],  // s
            {from: accountTaker}
        );

        const expectedQtyCancelled = -4
        const qtyToCancel = -7;
        // over cancel order
        const actualQtyCancelled = await marketContract.cancelOrder.call(
            orderAddresses,
            unsignedOrderValues,
            orderQty,
            qtyToCancel);

        assert.equal(expectedQtyCancelled, actualQtyCancelled.toNumber(), "Quantity cancelled doesn't match expected.");
    })

    it("should fail for attempts to fill expired order", async function() {
        const expiredTimestamp = ((new Date()).getTime() / 1000) - 30; // order expired 30 seconds ago.
        const orderAddresses = [accountMaker, accountTaker, accounts[2]];
        const unsignedOrderValues = [0, 0, entryOrderPrice, expiredTimestamp, 1];
        const orderQty = 5;   // user is attempting to buy 5
        const qtyToFill = 1; // order is to be filled by 1
        const orderHash = await orderLib.createOrderHash.call(
            MarketContractOraclize.address,
            orderAddresses,
            unsignedOrderValues,
            orderQty
        );

        // Execute trade between maker and taker for partial amount of order.
        const orderSignature = utility.signMessage(web3, accountMaker, orderHash)
        await marketContract.tradeOrder(
            orderAddresses,
            unsignedOrderValues,
            orderQty, // 5
            qtyToFill, // fill one slot
            orderSignature[0],  // v
            orderSignature[1],  // r
            orderSignature[2],  // s
            {from: accountTaker}
        );
        const events = await utility.getEvent(marketContract, 'Error')
        assert.equal(ErrorCodes.ORDER_EXPIRED, events[0].args.errorCode.toNumber(), "Error event is not order expired.")

        const orderQtyFilled = await marketContract.getQtyFilledOrCancelledFromOrder.call(orderHash)
        assert.equal(0, orderQtyFilled.toNumber(), "Quantity filled is not zero.")
    })

    it("should fail for attempts to cancel expired order", async function() {
        const expiredTimestamp = ((new Date()).getTime() / 1000) - 30; // order expired 30 seconds ago.
        const orderAddresses = [accountMaker, accountTaker, accounts[2]];
        const unsignedOrderValues = [0, 0, entryOrderPrice, expiredTimestamp, 1];
        const orderQty = 5;   // user is attempting to buy 5
        const qtyToCancel = 1;
        const orderHash = await orderLib.createOrderHash.call(
            MarketContractOraclize.address,
            orderAddresses,
            unsignedOrderValues,
            orderQty
        );

        // Execute trade between maker and taker for partial amount of order.
        await marketContract.cancelOrder(
            orderAddresses,
            unsignedOrderValues,
            orderQty,
            qtyToCancel);

        const events = await utility.getEvent(marketContract, 'Error')
        assert.equal(ErrorCodes.ORDER_EXPIRED, events[0].args.errorCode.toNumber(), "Error event is not order expired.")

        const orderQtyFilled = await marketContract.getQtyFilledOrCancelledFromOrder.call(orderHash)
        assert.equal(0, orderQtyFilled.toNumber(), "Quantity cancelled is not zero.")
    })

    it("should fail for attempts to trade zero quantity", async function() {
        const expiredTimestamp = ((new Date()).getTime() / 1000) + 60 * 5; // order expires in 5 minutes.
        const orderAddresses = [accountMaker, accountTaker, accounts[2]];
        const unsignedOrderValues = [0, 0, entryOrderPrice, expiredTimestamp, 1];
        const zeroOrderQty = 0;
        const qtyToFill = 4;
        const orderHash = await orderLib.createOrderHash.call(
            MarketContractOraclize.address,
            orderAddresses,
            unsignedOrderValues,
            zeroOrderQty
        );

        // Execute trade between maker and taker for partial amount of order.
        const orderSignature = utility.signMessage(web3, accountMaker, orderHash)
        let error = null;
        try {
            await marketContract.tradeOrder.call(
                orderAddresses,
                unsignedOrderValues,
                zeroOrderQty, // 5
                qtyToFill, // fill one slot
                orderSignature[0],  // v
                orderSignature[1],  // r
                orderSignature[2],  // s
                {from: accountTaker}
            );
        } catch (err) {
            error = err;
        }

        assert.ok(error instanceof Error, "Zero Quantity order did not fail");
    })

    it("should fail for attempts to create maker order and fill as taker from same account", async function() {
        const expiredTimestamp = ((new Date()).getTime() / 1000) + 60 * 5; // order expires in 5 minutes.
        const makerAndTakerAccount = accountMaker // same address for maker and taker
        const orderAddresses = [makerAndTakerAccount, makerAndTakerAccount, accounts[2]];
        const unsignedOrderValues = [0, 0, entryOrderPrice, expiredTimestamp, 1];
        const orderQty = 5;
        const qtyToFill = 1; // order is to be filled by 1
        const orderHash = await orderLib.createOrderHash.call(
            MarketContractOraclize.address,
            orderAddresses,
            unsignedOrderValues,
            orderQty
        );

        // Execute trade between maker and taker for partial amount of order.
        const orderSignature = utility.signMessage(web3, accountMaker, orderHash)
        let error = null;
        try {
            await marketContract.tradeOrder.call(
                orderAddresses,
                unsignedOrderValues,
                orderQty, // 5
                qtyToFill, // fill one slot
                orderSignature[0],  // v
                orderSignature[1],  // r
                orderSignature[2],  // s
                {from: accountTaker}
            );
        } catch (err) {
            error = err;
        }

        assert.ok(error instanceof Error, "Order did not fail");
    })

    it("should fail for attempts to order and fill with price changed", async function() {
        const expiredTimestamp = ((new Date()).getTime() / 1000) + 60 * 5; // order expires in 5 minutes.
        const orderAddresses = [accountMaker, accountTaker, accounts[2]];
        const unsignedOrderValues = [0, 0, entryOrderPrice, expiredTimestamp, 1];
        const orderQty = 5;
        const qtyToFill = 1; // order is to be filled by 1
        const orderHash = await orderLib.createOrderHash.call(
            MarketContractOraclize.address,
            orderAddresses,
            unsignedOrderValues,
            orderQty
        );

        const changedOrderPrice = entryOrderPrice + 500;
        const changedUnsignedOrderValues = [0, 0, changedOrderPrice, expiredTimestamp, 1];

        // Execute trade between maker and taker for partial amount of order.
        const orderSignature = utility.signMessage(web3, accountMaker, orderHash)
        let error = null;
        try {
            await marketContract.tradeOrder.call(
                orderAddresses,
                changedUnsignedOrderValues,
                orderQty, // 5
                qtyToFill, // fill one slot
                orderSignature[0],  // v
                orderSignature[1],  // r
                orderSignature[2],  // s
                {from: accountTaker}
            );
        } catch (err) {
            error = err;
        }

        assert.ok(error instanceof Error, "Order did not fail");
    })



    // TODO:
    //      - attempt to trade / cancel post expiration
    //      - expiration methods
    //      - settleAndClose()
});