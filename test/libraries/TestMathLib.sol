/*
    Copyright 2017-2018 Phillip A. Elsasser

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

pragma solidity ^0.4.23;

import "truffle/Assert.sol";
import "../../contracts/libraries/MathLib.sol";


/// @title TestMathLib tests for all of our math functions
/// @author Phil Elsasser <phil@marketprotcol.io>
contract TestMathLib {

    function testSign() public {
        Assert.equal(MathLib.sign(0), 0, "Sign of 0 should be 0");
        Assert.equal(MathLib.sign(-50), -1, "Sign of a negative should be -1");
        Assert.equal(MathLib.sign(50), 1, "Sign of a positive should be 1");
    }

    function testIsSameSign() public {
        Assert.isTrue(MathLib.isSameSign(0, 0), "Sign of 0 is 0");
        Assert.isTrue(MathLib.isSameSign(-50, -120), "Sign of a negatives should be equal");
        Assert.isTrue(MathLib.isSameSign(1, 100000), "Sign of a positives should be equal");
        Assert.isTrue(!MathLib.isSameSign(1, -100000), "Sign of a positive and negative are not equal");
    }

    function testAbs() public {
        Assert.equal(MathLib.abs(0), 0, "abs of 0 should be 0");
        Assert.equal(MathLib.abs(15), 15, "abs of positive should be same");
        Assert.equal(MathLib.abs(-15), 15, "abs of negative should be positive");
    }

    function testAbsMin() public {
        Assert.equal(MathLib.absMin(0, 250), 0, "0 is always the min");
        Assert.equal(MathLib.absMin(250, 0), 0, "0 is always the min");
        Assert.equal(MathLib.absMin(-250, 0), 0, "0 is always the min");
        Assert.equal(MathLib.absMin(15, -20), 15, "15 smaller than 20");
        Assert.equal(MathLib.absMin(-15, 20), -15, "15 smaller than 20");
        Assert.equal(MathLib.absMin(-15, -20), -15, "15 smaller than 20");
    }

    function testAbsMax() public {
        Assert.equal(MathLib.absMax(0, 250), 250, "250 further than 0");
        Assert.equal(MathLib.absMax(250, 0), 250, "250 further than 0");
        Assert.equal(MathLib.absMax(-250, 0), -250, "-250 further than 0");
        Assert.equal(MathLib.absMax(15, -20), -20, "-20 further from 0 than 15");
        Assert.equal(MathLib.absMax(-15, 20), 20, "+20 further from 0 than -15");
        Assert.equal(MathLib.absMax(-15, -20), -20, "-20 further from 0 than -15");
    }

    function failSubtractWhenALessThanB() public pure returns(uint256) {
         return MathLib.subtract(uint256(1), uint256(2));
    }

    function testSubtract() public {
        Assert.equal(MathLib.subtract(uint(1), uint(1)), 0, "1 - 1 does not equal 0");
        bytes4 test_abi = bytes4(keccak256("failSubtractWhenALessThanB()"));
        Assert.isFalse(address(this).call(test_abi), "Should assert");
    }

    function failSafeAddWhenGreaterThanIntMax() public pure returns(int256) {
         int256 signedIntMax = int256(~((uint256(1) << 255)));
         return MathLib.add(int256(1), signedIntMax);
    }

    function testSafeAdd() public {
        int256 signedIntMin = int256((uint256(1) << 255));
        int256 signedIntMax = int256(~((uint256(1) << 255)));

        Assert.equal(MathLib.add(int256(2), int256(2)), 4, "2 + 2 equals 4");
        Assert.equal(MathLib.add(int256(0), signedIntMax), signedIntMax, "add 0 to int256 max should equal int256 max");
        Assert.equal(MathLib.add(int256(0), signedIntMin), signedIntMin, "add 0 to int256 min should equal int256 min");

        bytes4 test_abi = bytes4(keccak256("failSafeAddWhenGreaterThanIntMax()"));
        Assert.isFalse(address(this).call(test_abi), "Should assert");
        }

    function failDivideFractionalByZero() public pure returns(uint256) {
        return MathLib.divideFractional(2, 6, 0);
    }

    function testDivideFractional() public {
        Assert.equal(MathLib.divideFractional(2, 6, 10), 1, "12 / 10 = 1");
        Assert.equal(MathLib.divideFractional(3, 5, 10), 1, "15 / 10 = 1");
        Assert.equal(MathLib.divideFractional(3, 6, 10), 1, "18 / 10 = 1");
        Assert.equal(MathLib.divideFractional(4, 6, 10), 2, "24 / 10 = 2");

        bytes4 test_abi = bytes4(keccak256("failDivideFractionalByZero()"));
        Assert.isFalse(address(this).call(test_abi), "Should assert");
    }

    function testCalculateNeededCollateral() public {
        uint priceFloor = 250;
        uint priceCap = 350;
        uint qtyMultiplier = 100;
        uint price = 275;
        int longQty = 2;
        int shortQty = -5;
        uint neededCollateralForLongPos = MathLib.calculateNeededCollateral(
            priceFloor,
            priceCap,
            qtyMultiplier,
            longQty,
            price
        );

        // for a long position we need to look at the priceFloor from the price, this represents a longs max loss
        // so 275-250 is max loss per 1 lot, 25 * longQty * qtyMultiplier should equal 5000
        Assert.equal(neededCollateralForLongPos, 5000, "max loss of 25 and qty of 2 with 100 multiplier should be 5000 units");

        uint neededCollateralForShortPos = MathLib.calculateNeededCollateral(
            priceFloor,
            priceCap,
            qtyMultiplier,
            shortQty,
            price
        );
        // for a short position we need to look at the priceCeiling from the price, this represents a shorts max loss
        // so 350 - 275 = 75 max loss per unit * 5 units * 100 qtyMultiplier = 62500 collateral units
        Assert.equal(neededCollateralForShortPos, 37500, "max loss of 75 and qty of 5 with 100 multiplier should be 37500 units");

        // neededCollateral for a long position and price equal to priceFloor returns zero
        Assert.equal(MathLib.calculateNeededCollateral(priceFloor, priceCap, qtyMultiplier, longQty, priceFloor),
                     0, "collateral for a long position and price equal to priceFloor should be 0");

        // neededCollateral for a long position and price less than priceFloor returns zero
        Assert.equal(MathLib.calculateNeededCollateral(priceFloor, priceCap, qtyMultiplier, longQty, priceFloor-1),
                     0, "collateral for a long position and price less than priceFloor should be 0");

        // neededCollateral for a short position and price equal to priceCap returns zero
        Assert.equal(MathLib.calculateNeededCollateral(priceFloor, priceCap, qtyMultiplier, shortQty, priceCap),
                     0, "collateral for a short position and price equal to priceCap should be 0");

        // neededCollateral for a short position and price greater than priceCap returns zero
        Assert.equal(MathLib.calculateNeededCollateral(priceFloor, priceCap, qtyMultiplier, shortQty, priceCap+1),
                     0, "collateral for a short position and price greater than priceCap should be 0");
    }
}
