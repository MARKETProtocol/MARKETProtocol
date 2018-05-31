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

import "../MarketCollateralPool.sol";
import "./MarketCollateralPoolFactoryInterface.sol";

import "openzeppelin-solidity/contracts/ownership/Ownable.sol";

contract MarketCollateralPoolFactory is Ownable, MarketCollateralPoolFactoryInterface {


    address public marketContractFactory;
    mapping (address => address) public marketContractToCollateralPool;

    constructor() public {

    }

    function deployMarketCollateralPool(address marketContractAddress) external {
        require(msg.sender == marketContractFactory);
        MarketCollateralPool marketCollateralPool = new MarketCollateralPool(marketContractAddress);
        marketContractToCollateralPool[marketContractAddress] = marketCollateralPool;
    }

    function setMarketContractFactoryAddress(address marketContractFactoryAddress) external onlyOwner {
        marketContractFactory = marketContractFactoryAddress;
    }

    function getCollateralPoolAddress(address marketContractAddress) external returns (address) {
        return marketContractToCollateralPool[marketContractAddress];
    }

}
