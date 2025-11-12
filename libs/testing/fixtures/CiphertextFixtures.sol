// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {TypesLib} from "blocklock-solidity/src/libraries/TypesLib.sol";
import {BLS} from "blocklock-solidity/src/libraries/BLS.sol";

library CiphertextFixtures {
    function sampleCiphertext() internal pure returns (TypesLib.Ciphertext memory cipher) {
        cipher.u = BLS.PointG2({
            x: [uint256(0x1), uint256(0x2)],
            y: [uint256(0x3), uint256(0x4)]
        });
        cipher.v = abi.encodePacked(bytes32(uint256(0xDEADBEEF)));
        cipher.w = abi.encodePacked(bytes32(uint256(0xC0FFEE)));
    }

    function sampleDecryptionKey() internal pure returns (bytes memory) {
        return abi.encodePacked(bytes32(uint256(0x1234)));
    }
}

