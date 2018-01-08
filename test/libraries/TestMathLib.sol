/*
    Copyright 2017 Phillip A. Elsasser

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

pragma solidity 0.4.18;

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

    function testCalculateNeededCollateral() public {
        uint priceFloor = 250;
        uint priceCap = 350;
        uint qtyDecimalPlaces = 100;
        uint price = 275;
        int longQty = 2;
        int shortQty = -5;
        uint neededCollateralForLongPos = MathLib.calculateNeededCollateral(
            priceFloor,
            priceCap,
            qtyDecimalPlaces,
            longQty,
            price
        );

        // for a long position we need to look at the priceFloor from the price, this represents a longs max loss
        // so 275-250 is max loss per 1 lot, 25 * longQty * qtyDecimalPlaces should equal 5000
        Assert.equal(neededCollateralForLongPos, 5000, "max loss of 25 and qty of 2 with 100 decimals should be 5000 units");

        uint neededCollateralForShortPos = MathLib.calculateNeededCollateral(
            priceFloor,
            priceCap,
            qtyDecimalPlaces,
            shortQty,
            price
        );
        // for a short position we need to look at the priceCeiling from the price, this represents a shorts max loss
        // so 350 - 275 = 75 max loss per unit * 5 units * 100 decimal places = 62500 collateral units
        Assert.equal(neededCollateralForShortPos, 37500, "max loss of 75 and qty of 5 with 100 decimals should be 37500 units");

        // neededCollateral for a long position and price equal to priceFloor returns zero
        Assert.equal(MathLib.calculateNeededCollateral(priceFloor, priceCap, qtyDecimalPlaces, longQty, priceFloor),
                     0, "collateral for a long position and price equal to priceFloor should be 0");
    }
}
