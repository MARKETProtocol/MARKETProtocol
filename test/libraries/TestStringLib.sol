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

pragma solidity ^0.5.0;

import "truffle/Assert.sol";
import "../../contracts/libraries/StringLib.sol";


contract TestStringLib {
    using StringLib for *;

    function testToSlice() public {
        StringLib.slice memory sliceTest = "HelloWorld".toSlice();
        Assert.equal(sliceTest._len, 10,  "Length should match supplied string length");
        Assert.equal(sliceTest._ptr, 224,  "PTR should match supplied string");
    }

    function testDelimAndSplit() public {
        string memory contractNames = "BTC,LBTC,SBTC";
        StringLib.slice memory pathSlice = contractNames.toSlice();
        StringLib.slice memory delim = ",".toSlice();
        uint length = pathSlice.count(delim) + 1;
        string[4] memory expectedResults = ["BTC", "LBTC", "SBTC"];
        for (uint i = 0; i < length; i++) {
            Assert.equal(expectedResults[i], pathSlice.split(delim).toString(), "String not split properly!");
        }
    }

}