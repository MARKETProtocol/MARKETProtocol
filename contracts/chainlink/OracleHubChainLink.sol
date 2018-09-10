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

pragma solidity ^0.4.24;

import "../OracleHub.sol";
import "./src/Chainlinked.sol";
import "../libraries/StringLib.sol";


contract OracleHubChainLink is OracleHub, Chainlinked {

    struct ChainLinkQuery {
        string oracleQueryURL;
        string oracleQueryPath;
        string[] oracleQueryRunPath; // cheaper to store or just re-create if needed for on-demand queries?
    }

    mapping(address => ChainLinkQuery) contractAddressToChainLinkQuery;

    constructor() public {

    }

    function withdrawLink(address sendTo, uint256 amount) onlyOwner returns (bool) {
        return link.transfer(sendTo, amount);
    }


    function callback(bytes32 requestId, uint256 price) public checkChainlinkFulfillment(requestId)
    {
        lastPrice = price;
        emit UpdatedLastPrice(price);
        checkSettlement();  // Verify settlement at expiration or requested early settlement.
    }


    function createQueryRunPath(string oracleQueryPath) internal returns (string[]) {
        StringLib.slice memory pathSlice = oracleQueryPath.toSlice();
        StringLib.slice memory delim = ".".toSlice();
        string[] memory runPath = new string[](pathSlice.count(delim) + 1);
        for(uint i = 0; i < runPath.length; i++) {
            runPath[i] = pathSlice.split(delim).toString();
        }
        return runPath;
    }

    function createRun(bytes32 jobId) returns (ChainlinkLib.Run) {
        ChainlinkLib.Run memory run = newRun(JOB_ID, jobId, "callback(bytes32,uint256)");
        run.add("url", oracleQueryURL);
        run.addStringArray("path", chainLinkQuery.oracleQueryRunPath);
        run.addInt("times", PRICE_DECIMAL_PLACES); // TODO: get price decimal places from MarketContract
        return run;
    }

    function requestQuery(string oracleQueryURL, string oracleQueryPath) {
        // TODO check this address if whitelisted? (if not anyone could call this costing us link!)
        ChainLinkQuery storage chainLinkQuery = contractAddressToChainLinkQuery[msg.sender];
        chainLinkQuery.oracleQueryURL = oracleQueryURL;
        chainLinkQuery.oracleQueryPath = oracleQueryPath;
        chainLinkQuery.oracleQueryRunPath = createQueryRunPath(oracleQueryPath);


        REQUEST_ID = chainlinkRequest(run, LINK(1));
        // TODO: figure out handling of JOB_ID and REQUEST_ID
        // TODO: add sleep adapter
    }

    function requestOnDemandQuery(address marketContractAddress) public {
        // TODO: enforce ETH payment to cover LINK, refund if settled?
        ChainLinkQuery memory chainLinkQuery = contractAddressToChainLinkQuery[msg.sender];
        ChainlinkLib.Run memory run = newRun(JOB_ID, this, "callback(bytes32,uint256)");
        run.add("url", oracleQueryURL);
        run.addStringArray("path", chainLinkQuery.oracleQueryRunPath);
        run.addInt("times", PRICE_DECIMAL_PLACES);
        REQUEST_ID = chainlinkRequest(run, LINK(1));
        // TODO: figure out handling of JOB_ID and REQUEST_ID
        // if we refund for pushing to settlement we will need to record the caller of this function
        // since it will be asynchronous with the callback
    }

}
