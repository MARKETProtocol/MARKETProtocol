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

// TODO BUILD TEST!
library MathLib {

    function multiply(uint256 a, uint256 b) pure internal returns (uint256) {
        uint256 c = a * b;
        assert(a == 0 || c / a == b);
        return c;
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

    function sign(int a) pure internal returns (int8) {
        if(a > 0) {
            return 1;
        } else if (a < 0) {
            return -1;
        }
        return 0;
    }

    function abs(int a) pure internal returns (uint) {
        if(a < 0) {
            return uint(-a);
        }
        else {
            return uint(a);
        }
    }

    function isSameSign(int a, int b) pure internal returns (bool) {
        return ( a == b || a * b > 0);
    }

}
