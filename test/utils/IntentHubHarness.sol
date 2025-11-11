// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IntentHub} from "../../src/IntentHub.sol";
import {SettlementEscrow} from "../../src/SettlementEscrow.sol";
import {TypesLib} from "blocklock-solidity/src/libraries/TypesLib.sol";

contract IntentHubHarness is IntentHub {
    uint256 private requestSeq;

    constructor(address admin, SettlementEscrow escrow) IntentHub(admin, address(0), escrow) {}

    function simulateBlocklockCallback(uint256 requestId, bytes calldata decryptionKey) external {
        _onBlocklockReceived(requestId, decryptionKey);
    }

    function getRequestId(uint256 commitmentId) external view returns (uint256) {
        return blocklockRequestIds[commitmentId];
    }

    function _requestBlocklockWithSubscription(
        uint32,
        bytes memory,
        TypesLib.Ciphertext calldata
    ) internal override returns (uint256 requestId) {
        requestId = ++requestSeq;
    }

    function _decodePayload(TypesLib.Ciphertext memory, bytes calldata decryptionKey)
        internal
        pure
        override
        returns (bytes memory)
    {
        return decryptionKey;
    }
}

