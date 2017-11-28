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

import "./ContractLib.sol";


/// @title Math function library with overflow protection inspired by Open Zeppelin
library MathLib {

    int256 constant INT256_MIN = int256((uint256(1) << 255));
    int256 constant INT256_MAX = int256(~((uint256(1) << 255)));

    function multiply(uint256 a, uint256 b) pure internal returns (uint256) {
        uint256 c = a * b;
        assert(a == 0 || c / a == b);
        return c;
    }

    function divideFractional(
        uint256 a,
        uint256 numerator,
        uint256 denominator
    ) pure internal returns (uint256)
    {
        return multiply(a, numerator) / denominator;
    }

    function subtract(uint256 a, uint256 b) pure internal returns (uint256) {
        assert(b <= a);
        return a - b;
    }

    function add(uint256 a, uint256 b) pure internal returns (uint256) {
        uint256 c = a + b;
        assert(c >= a);
        return c;
    }

    /// @notice safely adds two signed integers ensuring that no wrap occurs
    /// @param a value to add b to
    /// @param b value to add to a
    function add(int256 a, int256 b) pure internal returns (int256) {
        int256 c = a + b;
        if (!isSameSign(a, b)) { // result will always be smaller than current value, no wrap possible
            return c;
        }

        if (a >= 0) { // a is positive, b must be less than MAX - a to prevent wrap
            assert(b <= INT256_MAX - a);
        } else { // a is negative, b must be greater than MIN - a to prevent wrap
            assert(b >= INT256_MIN - a);
        }
        return c;
    }

    /// @notice safely subtracts two signed integers ensuring that no wrap occurs
    /// @param a value to subtract b from
    /// @param b value to subtract from a
    function subtract(int256 a, int256 b) pure internal returns (int256) {
        return add(a, -b); // use inverse add
    }

    /// @param a integer to determine sign of
    /// @return int8 sign of original value, either +1,0,-1
    function sign(int a) pure internal returns (int8) {
        if (a > 0) {
            return 1;
        } else if (a < 0) {
            return -1;
        }
        return 0;
    }

    /// @param a integer to compare to b
    /// @param b integer to compare to a
    /// @return bool true if a and b are the same sign (+/-)
    function isSameSign(int a, int b) pure internal returns (bool) {
        return ( a == b || a * b > 0);
    }

    /// @param a integer to determine absolute value of
    /// @return uint non signed representation of a
    function abs(int256 a) pure internal returns (uint256) {
        if (a < 0) {
            return uint(-a);
        } else {
            return uint(a);
        }
    }

    /// @notice finds the value closer to zero regardless of sign
    /// @param a integer to compare to b
    /// @param b integer to compare to a
    /// @return a if a is closer to zero than b - does not return abs value!
    function absMin(int256 a, int256 b) pure internal returns (int256) {
        return abs(a) < abs(b) ?  a : b;
    }

    /// @notice finds the value further from zero regardless of sign
    /// @param a integer to compare to b
    /// @param b integer to compare to a
    /// @return a if a is further to zero than b - does not return abs value!
    function absMax(int256 a, int256 b) pure internal returns (int256) {
        return abs(a) >= abs(b) ?  a : b;
    }

    /// @notice determines the amount of needed collateral for a given position (qty and price)
    /// @param priceFloor lowest price the contract is allowed to trade before expiration
    /// @param priceCap highest price the contract is allowed to trade before expiration
    /// @param qtyDecimalPlaces number of decimal places in traded quantity.
    /// @param qty signed integer corresponding to the traded quantity
    /// @param price of the trade
    function calculateNeededCollateral(
        uint priceFloor,
        uint priceCap,
        uint qtyDecimalPlaces,
        int qty,
        uint price
    ) pure internal returns (uint neededCollateral)
    {

        uint maxLoss;
        if (qty > 0) {   // this qty is long, calculate max loss from entry price to floor
            if (price <= priceFloor) {
                maxLoss = 0;
            } else {
                maxLoss = subtract(price, priceFloor);
            }
        } else { // this qty is short, calculate max loss from entry price to ceiling;
            if (price >= priceCap) {
                maxLoss = 0;
            } else {
                maxLoss = subtract(priceCap, price);
            }
        }
        neededCollateral = maxLoss * abs(qty) * qtyDecimalPlaces;
    }

    /// @notice determines the amount of needed collateral for a given position (qty and price)
    /// @param contractSpecs constant values defining contract.
    /// @param qty signed integer corresponding to the traded quantity
    /// @param price of the trade
    function calculateNeededCollateral(
        ContractLib.ContractSpecs contractSpecs,
        int qty,
        uint price
    ) pure internal returns (uint neededCollateral)
    {
        return calculateNeededCollateral(
            contractSpecs.PRICE_FLOOR,
            contractSpecs.PRICE_CAP,
            contractSpecs.QTY_DECIMAL_PLACES,
            qty,
            price
        );
    }
}
