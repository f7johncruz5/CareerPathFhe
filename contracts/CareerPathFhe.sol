// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract CareerPathFhe is SepoliaConfig {
    struct EncryptedProfile {
        uint256 id;
        address owner;
        euint32 skills;
        euint32 interests;
        euint32 experience;
        uint256 timestamp;
    }

    struct EncryptedRecommendation {
        uint256 id;
        uint256 profileId;
        euint32 careerPath;
        euint32 compatibilityScore;
        uint256 timestamp;
    }

    uint256 public profileCount;
    uint256 public recommendationCount;
    mapping(uint256 => EncryptedProfile) public profiles;
    mapping(uint256 => EncryptedRecommendation) public recommendations;
    mapping(address => uint256[]) public userProfiles;
    mapping(uint256 => uint256[]) public profileRecommendations;

    event ProfileCreated(uint256 indexed id, address indexed owner, uint256 timestamp);
    event RecommendationGenerated(uint256 indexed id, uint256 indexed profileId, uint256 timestamp);
    event RecommendationViewed(uint256 indexed id);

    modifier onlyProfileOwner(uint256 profileId) {
        require(profiles[profileId].owner == msg.sender, "Not profile owner");
        _;
    }

    function createProfile(
        euint32 encryptedSkills,
        euint32 encryptedInterests,
        euint32 encryptedExperience
    ) external {
        profileCount++;
        uint256 newId = profileCount;

        profiles[newId] = EncryptedProfile({
            id: newId,
            owner: msg.sender,
            skills: encryptedSkills,
            interests: encryptedInterests,
            experience: encryptedExperience,
            timestamp: block.timestamp
        });

        userProfiles[msg.sender].push(newId);
        emit ProfileCreated(newId, msg.sender, block.timestamp);
    }

    function requestRecommendation(uint256 profileId) external onlyProfileOwner(profileId) {
        EncryptedProfile storage profile = profiles[profileId];
        
        // Prepare encrypted data for recommendation engine
        bytes32[] memory ciphertexts = new bytes32[](3);
        ciphertexts[0] = FHE.toBytes32(profile.skills);
        ciphertexts[1] = FHE.toBytes32(profile.interests);
        ciphertexts[2] = FHE.toBytes32(profile.experience);

        // Request recommendation generation
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.generateRecommendation.selector);
        profileRecommendations[reqId] = new uint256[](0);
    }

    function generateRecommendation(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) external {
        FHE.checkSignatures(requestId, cleartexts, proof);

        recommendationCount++;
        uint256 newId = recommendationCount;
        uint256 profileId = requestId; // Using requestId as profileId in this simplified version

        euint32[] memory results = abi.decode(cleartexts, (euint32[]));
        
        recommendations[newId] = EncryptedRecommendation({
            id: newId,
            profileId: profileId,
            careerPath: results[0],
            compatibilityScore: results[1],
            timestamp: block.timestamp
        });

        profileRecommendations[profileId].push(newId);
        emit RecommendationGenerated(newId, profileId, block.timestamp);
    }

    function getRecommendation(uint256 recommendationId) external view returns (euint32, euint32) {
        EncryptedRecommendation storage rec = recommendations[recommendationId];
        require(profiles[rec.profileId].owner == msg.sender, "Not authorized");
        
        emit RecommendationViewed(recommendationId);
        return (rec.careerPath, rec.compatibilityScore);
    }

    function getUserProfiles(address user) external view returns (uint256[] memory) {
        return userProfiles[user];
    }

    function getProfileRecommendations(uint256 profileId) external view onlyProfileOwner(profileId) returns (uint256[] memory) {
        return profileRecommendations[profileId];
    }
}