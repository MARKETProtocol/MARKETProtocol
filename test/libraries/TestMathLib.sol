/*
    Copyright 2017-2019 Phillip A. Elsasser

    Licensed under the Apache License, Version 2.0 (the "License");
    you may not use this file except in compliance with the License.
    You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

    Unless required by applicable law or agreed to in writing, software
    distributed under the License is distributed on an "AS IS" BASIS,
    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
    See the License for the specific language governing permissions and
    limitations under the License.
*/

pragma solidity 0.5.2;

import "truffle/Assert.sol";
import "../../contracts/libraries/MathLib.sol";


/// @title TestMathLib tests for all of our math functions
/// @author Phil Elsasser <phil@marketprotcol.io>
contract TestMathLib {

    function failSubtractWhenALessThanB() public pure returns(uint256) {
         return MathLib.subtract(uint256(1), uint256(2));
    }

    function testSubtract() public {
        Assert.equal(MathLib.subtract(uint(1), uint(1)), 0, "1 - 1 does not equal 0");
        bytes memory test_abi = abi.encodeWithSignature("failSubtractWhenALessThanB()");
        (bool success, bytes memory returndata) = address(this).call(test_abi);
        Assert.isFalse(success, "Should assert");
    }

    function failDivideFractionalByZero() public pure returns(uint256) {
        return MathLib.divideFractional(2, 6, 0);
    }

    function testDivideFractional() public {
        Assert.equal(MathLib.divideFractional(2, 6, 10), 1, "12 / 10 = 1");
        Assert.equal(MathLib.divideFractional(3, 5, 10), 1, "15 / 10 = 1");
        Assert.equal(MathLib.divideFractional(3, 6, 10), 1, "18 / 10 = 1");
        Assert.equal(MathLib.divideFractional(4, 6, 10), 2, "24 / 10 = 2");

        bytes memory test_abi = abi.encodeWithSignature("failDivideFractionalByZero()");
        (bool success, bytes memory returndata) = address(this).call(test_abi);
        Assert.isFalse(success, "Should assert");
    }

    function testcalculateCollateralToReturnLong() public {
        uint priceFloor = 250;
        uint priceCap = 350;
        uint qtyMultiplier = 100;
        uint price = 275;
        uint longQty = 2;
        uint neededCollateralForLongPos = MathLib.calculateCollateralToReturn(
            priceFloor,
            priceCap,
            qtyMultiplier,
            longQty,
            0,
            price
        );

        // for a long position we need to look at the priceFloor from the price, this represents a longs max loss
        // so 275-250 is max loss per 1 lot, 25 * longQty * qtyMultiplier should equal 5000
        Assert.equal(neededCollateralForLongPos, 5000, "max loss of 25 and qty of 2 with 100 multiplier should be 5000 units");

        // neededCollateral for a long position and price equal to priceFloor returns zero
        Assert.equal(MathLib.calculateCollateralToReturn(priceFloor, priceCap, qtyMultiplier, longQty, 0, priceFloor),
                     0, "collateral for a long position and price equal to priceFloor should be 0");

        // neededCollateral for a long position and price less than priceFloor returns zero
        Assert.equal(MathLib.calculateCollateralToReturn(priceFloor, priceCap, qtyMultiplier, longQty, 0, priceFloor-1),
                     0, "collateral for a long position and price less than priceFloor should be 0");
    }

    function testcalculateCollateralToReturnShort() public {
        uint priceFloor = 250;
        uint priceCap = 350;
        uint qtyMultiplier = 100;
        uint price = 275;
        uint shortQty = 5;

        uint neededCollateralForShortPos = MathLib.calculateCollateralToReturn(
            priceFloor,
            priceCap,
            qtyMultiplier,
            0,
            shortQty,
            price
        );
        // for a short position we need to look at the priceCeiling from the price, this represents a shorts max loss
        // so 350 - 275 = 75 max loss per unit * 5 units * 100 qtyMultiplier = 62500 collateral units
        Assert.equal(neededCollateralForShortPos, 37500, "max loss of 75 and qty of 5 with 100 multiplier should be 37500 units");

        // neededCollateral for a short position and price equal to priceCap returns zero
        Assert.equal(MathLib.calculateCollateralToReturn(priceFloor, priceCap, qtyMultiplier, 0, shortQty, priceCap),
                     0, "collateral for a short position and price equal to priceCap should be 0");

        // neededCollateral for a short position and price greater than priceCap returns zero
        Assert.equal(MathLib.calculateCollateralToReturn(priceFloor, priceCap, qtyMultiplier, 0, shortQty, priceCap+1),
                     0, "collateral for a short position and price greater than priceCap should be 0");
    }

    function testcalculateCollateralToReturnBoth() public {
        uint priceFloor = 250;
        uint priceCap = 350;
        uint qtyMultiplier = 100;
        uint price = 275;
        uint shortQty = 5;
        uint longQty = 1;

        uint collateralToReturn = MathLib.calculateCollateralToReturn(
            priceFloor,
            priceCap,
            qtyMultiplier,
            1,
            shortQty,
            price
        );
        // for a short position we need to look at the priceCeiling from the price, this represents a shorts max loss
        // so 350 - 275 = 75 max loss per unit * 5 units * 100 qtyMultiplier = 62500 collateral units
        // plus a 1 lot long with 25 max loss per unit * 1 unit * 100
        Assert.equal(collateralToReturn, 40000, "max loss of 75 and qty of 5 with 100 multiplier should be 37500 units");
    }

    function testCalculateTotalCollateralSingleUnit() public {
        uint priceFloor = 10;
        uint priceCap = 20;
        uint multiplier = 1;
        uint expectedTotalCollateral = 10;
        uint actualTotalCollateral = MathLib.calculateTotalCollateral(priceFloor, priceCap, multiplier);
        Assert.equal(actualTotalCollateral, expectedTotalCollateral, "total collateral of floor 10 and cap 20 with 1 multiplier should be 10");
    }

    function testCalculateTotalCollateralMultipleUnit() public {
        uint priceFloor = 10;
        uint priceCap = 20;
        uint multiplier = 2;
        uint expectedTotalCollateral = 20;
        uint actualTotalCollateral = MathLib.calculateTotalCollateral(priceFloor, priceCap, multiplier);
        Assert.equal(actualTotalCollateral, expectedTotalCollateral, "total collateral of floor 10 and cap 20 with 2 multiplier should be 20");
    }

    function failCalculatingTotalCollateralWithAbnormalPrices() public pure returns (uint256) {
        uint higherPriceFloor = 20;
        uint priceCap = 10;
        uint multiplier = 1;
        return MathLib.calculateTotalCollateral(higherPriceFloor, priceCap, multiplier);
    }

    function testCalculateTotalCollateralWithAbnormalPrices() public {
        bytes memory test_abi = abi.encodeWithSignature("failCalculatingTotalCollateralWithAbnormalPrices()");
        (bool success, bytes memory returndata) = address(this).call(test_abi);
        Assert.isFalse(success, "total collateral should fail for abnormal price margins");
    }

    function testCalculateFeePerUnit() public {
        uint priceFloor = 1000;
        uint priceCap = 2000;
        uint multiplier = 1000;
        uint feeAmountInBasis = 100; // 1 percent fee.
        uint fee = MathLib.calculateFeePerUnit(priceFloor, priceCap, multiplier, feeAmountInBasis);
        uint expectedFeeAmount = 15000; // midpoint * multiplier * 1% (100 basis points)
        Assert.equal(fee, expectedFeeAmount, "Fee amount should be equal to midpoint * multiplier * percent");
    }
}

