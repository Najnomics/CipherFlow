// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";

import {BLS} from "blocklock-solidity/src/libraries/BLS.sol";
import {TypesLib} from "blocklock-solidity/src/libraries/TypesLib.sol";
import {IntentTypes} from "../../src/libraries/IntentTypes.sol";
import {IntentHub} from "../../src/IntentHub.sol";
import {SettlementEscrow} from "../../src/SettlementEscrow.sol";
import {IntentHubHarness} from "../utils/IntentHubHarness.sol";

contract IntentHubTest is Test {
    SettlementEscrow internal escrow;
    IntentHubHarness internal hub;

    address internal admin = address(this);
    address internal trader = address(0xC0DE);
    address internal solver = address(0xB0B);

    function setUp() external {
        escrow = new SettlementEscrow(admin);
        hub = new IntentHubHarness(admin, escrow);

        escrow.grantIntentHubRole(address(hub));

        vm.deal(trader, 100 ether);
        vm.deal(solver, 100 ether);
    }

    function testCommitRevealFlow() external {
        vm.startPrank(trader);
        uint64 commitDeadline = uint64(block.timestamp + 1 hours);
        uint64 revealDeadline = commitDeadline + 1 hours;
        uint64 executionDeadline = revealDeadline + 1 hours;

        IntentHub.IntentConfig memory cfg = IntentHub.IntentConfig({
            settlementAsset: address(0),
            recipient: trader,
            amountIn: 1 ether,
            minAmountOut: 0.9 ether,
            commitDeadline: commitDeadline,
            revealDeadline: revealDeadline,
            executionDeadline: executionDeadline,
            extraData: ""
        });

        uint256 intentId = hub.createIntent{value: 1 ether}(cfg);
        vm.stopPrank();

        TypesLib.Ciphertext memory ciphertext = _dummyCiphertext();
        bytes memory condition = abi.encode("B", block.number + 1);
        bytes memory decryptedPayload = abi.encodePacked("cipherflow-route");
        bytes32 payloadHash = keccak256(decryptedPayload);

        vm.prank(solver);
        uint256 commitmentId = hub.commitToIntent{value: hub.minimumCollateral()}(
            intentId,
            payloadHash,
            ciphertext,
            condition,
            hub.defaultCallbackGasLimit(),
            hub.minimumCollateral()
        );

        uint256 requestId = hub.getRequestId(commitmentId);
        hub.simulateBlocklockCallback(requestId, decryptedPayload);

        IntentHub.CommitmentRecord memory record = hub.getCommitment(commitmentId);
        assertEq(uint8(record.commitment.state), uint8(IntentTypes.CommitmentState.RevealReady));
        assertEq(record.commitment.blocklockRequestId, requestId);
        assertEq(keccak256(record.reveal.decryptedPayload), payloadHash);
        assertEq(keccak256(record.reveal.decryptionKey), keccak256(decryptedPayload));
    }

    function _dummyCiphertext() internal pure returns (TypesLib.Ciphertext memory cipher) {
        cipher.u = BLS.PointG2({
            x: [uint256(1), uint256(2)],
            y: [uint256(3), uint256(4)]
        });
        cipher.v = abi.encodePacked(bytes32(uint256(123)));
        cipher.w = abi.encodePacked(bytes32(uint256(456)));
    }
}

