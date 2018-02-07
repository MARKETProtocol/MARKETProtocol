pragma solidity 0.4.18;

import "zeppelin-solidity/contracts/token/StandardToken.sol";


// dummy ERC20 token for testing purposes
contract CollateralToken is StandardToken {

    string public name;
    string public symbol;
    uint8 public decimals;

    uint256 public INITIAL_SUPPLY;

    /**
     * @dev Constructor that gives msg.sender all of existing tokens.
     */
    function CollateralToken(
        string tokenName,
        string tokenSymbol,
        uint256 initialSupply,
        uint8 tokenDecimals
    ) public {
        name = tokenName;
        symbol = tokenSymbol;
        decimals = tokenDecimals;

        INITIAL_SUPPLY = initialSupply * (10 ** uint256(decimals));
        totalSupply = INITIAL_SUPPLY;
        balances[msg.sender] = INITIAL_SUPPLY;
    }
}
