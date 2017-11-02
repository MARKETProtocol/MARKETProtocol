pragma solidity ^0.4.0;

// TODO BUILD TEST!
library MathLib {

    function multiply(uint256 a, uint256 b) internal constant returns (uint256) {
        uint256 c = a * b;
        assert(a == 0 || c / a == b);
        return c;
    }

    function subtract(uint256 a, uint256 b) internal constant returns (uint256) {
        assert(b <= a);
        return a - b;
    }

    function add(uint256 a, uint256 b) internal constant returns (uint256) {
        uint256 c = a + b;
        assert(c >= a);
        return c;
    }

    function sign(int a) internal constant returns (int8) {
        if(a > 0) {
            return 1;
        } else if (a < 0) {
            return -1;
        }
        return 0;
    }

    function abs(int a) internal constant returns (uint) {
        return uint(a);
    }

    function isSameSign(int a, int b) internal constant returns (bool) {
        return ( a == b || a * b > 0);
    }

}
