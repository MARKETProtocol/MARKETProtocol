/*
    Copyright 2017-2019 MARKET Protocol

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

pragma solidity 0.5.11;

import "github.com/OpenZeppelin/openzeppelin-contracts/blob/v2.3.0/contracts/ownership/Ownable.sol";

/// @title Market Contract Fee Strategy
/// @notice A contract which stores the relevant information for fee calculation.
/// @author MARKET Protocol <support@marketprotocol.io>
contract MarketContractFeeStrategy is Ownable {
    uint public deployFee;
    uint public deployFeeMKTDiscount;
    
    uint public mintFee;
    uint public mintFeeMKTDiscount;
    
    uint public redeemFee;
    uint public redeemFeeMKTDiscount;   // Discount (percentage) off the fee when submitting in MKT
 
    /// @param deployFee_ uint               GWEI fee to deploy the contract using this strategy
    /// @param deployFeeMKTDiscount_ uint    Percentage discount (50 = 50%) when using MKT to pay the deployment fee
    /// @param mintFee_ uint                 Fee in basis points (Collateral token denominated) for minting
    /// @param mintFeeMKTDiscount_ uint      Percentage discount (50 = 50%) when using MKT to pay the minting fee
    /// @param redeemFee_ uint               Fee in basis points (Collateral token denominated) for redeeming
    /// @param redeemFeeMKTDiscount_ uint    Percentage discount (50 = 50%) when using MKT to pay the redeeming fee
    constructor(
        uint deployFee_,
        uint deployFeeMKTDiscount_,
        uint mintFee_,
        uint mintFeeMKTDiscount_,
        uint redeemFee_,
        uint redeemFeeMKTDiscount_
    )
        public
    {
        deployFee = deployFee_;
        deployFeeMKTDiscount = deployFeeMKTDiscount_;
        mintFee = mintFee_;
        mintFeeMKTDiscount = mintFeeMKTDiscount_;
        redeemFee = redeemFee_;
        redeemFeeMKTDiscount = redeemFeeMKTDiscount_;
    }
    
    // External functions
    // ...

    // External functions that are view
    // ...

    // External functions that are pure
    // ...

    // Public functions
    // ...

    // Internal functions
    // ...

    // Private functions
    // ...
}