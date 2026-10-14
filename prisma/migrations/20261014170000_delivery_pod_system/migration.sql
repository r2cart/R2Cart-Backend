-- AlterTable users
ALTER TABLE `users`
  ADD COLUMN `dutyStatus` VARCHAR(191) NULL DEFAULT 'OFF_DUTY',
  ADD COLUMN `assignedVillageIds` JSON NULL,
  ADD COLUMN `vehicleType` VARCHAR(191) NULL,
  ADD COLUMN `vehicleNumber` VARCHAR(191) NULL,
  ADD COLUMN `currentLatitude` DECIMAL(10, 8) NULL,
  ADD COLUMN `currentLongitude` DECIMAL(11, 8) NULL;

-- CreateTable delivery_assignments
CREATE TABLE IF NOT EXISTS `delivery_assignments` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `deliveryPersonId` VARCHAR(191) NOT NULL,
    `assignedById` VARCHAR(191) NOT NULL,
    `status` ENUM('ASSIGNED', 'ACCEPTED', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERY_PROOF_PENDING', 'DELIVERED', 'DELIVERY_FAILED') NOT NULL DEFAULT 'ASSIGNED',
    `assignedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `acceptedAt` DATETIME(3) NULL,
    `pickedUpAt` DATETIME(3) NULL,
    `outForDeliveryAt` DATETIME(3) NULL,
    `deliveredAt` DATETIME(3) NULL,
    `failedAt` DATETIME(3) NULL,
    `failureReason` VARCHAR(191) NULL,
    `failureNotes` TEXT NULL,
    `failureEvidence` TEXT NULL,
    `isCurrent` BOOLEAN NOT NULL DEFAULT true,
    `reassignedToId` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `delivery_assignments_orderId_idx`(`orderId`),
    INDEX `delivery_assignments_deliveryPersonId_status_idx`(`deliveryPersonId`, `status`),
    INDEX `delivery_assignments_isCurrent_idx`(`isCurrent`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable delivery_proofs
CREATE TABLE IF NOT EXISTS `delivery_proofs` (
    `id` VARCHAR(191) NOT NULL,
    `assignmentId` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `deliveryPersonId` VARCHAR(191) NOT NULL,
    `cloudinaryPublicId` VARCHAR(500) NOT NULL,
    `cloudinaryUrl` TEXT NOT NULL,
    `cloudinaryFolder` VARCHAR(255) NULL,
    `verificationStatus` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `verifiedById` VARCHAR(191) NULL,
    `verifiedAt` DATETIME(3) NULL,
    `verificationNotes` TEXT NULL,
    `recipientName` VARCHAR(191) NULL,
    `recipientPhone` VARCHAR(191) NULL,
    `customerOtp` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `delivery_proofs_orderId_idx`(`orderId`),
    INDEX `delivery_proofs_deliveryPersonId_idx`(`deliveryPersonId`),
    INDEX `delivery_proofs_verificationStatus_idx`(`verificationStatus`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable delivery_status_logs
CREATE TABLE IF NOT EXISTS `delivery_status_logs` (
    `id` VARCHAR(191) NOT NULL,
    `assignmentId` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `staffId` VARCHAR(191) NOT NULL,
    `previousStatus` VARCHAR(191) NULL,
    `newStatus` VARCHAR(191) NOT NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `delivery_status_logs_assignmentId_idx`(`assignmentId`),
    INDEX `delivery_status_logs_orderId_idx`(`orderId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable cod_collections
CREATE TABLE IF NOT EXISTS `cod_collections` (
    `id` VARCHAR(191) NOT NULL,
    `assignmentId` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `deliveryPersonId` VARCHAR(191) NOT NULL,
    `expectedAmount` DECIMAL(10, 2) NOT NULL,
    `collectedAmount` DECIMAL(10, 2) NOT NULL,
    `settlementStatus` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `settlementId` VARCHAR(191) NULL,
    `discrepancyNote` TEXT NULL,
    `collectedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `cod_collections_assignmentId_key`(`assignmentId`),
    UNIQUE INDEX `cod_collections_orderId_key`(`orderId`),
    INDEX `cod_collections_deliveryPersonId_settlementStatus_idx`(`deliveryPersonId`, `settlementStatus`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable cod_settlements
CREATE TABLE IF NOT EXISTS `cod_settlements` (
    `id` VARCHAR(191) NOT NULL,
    `settlementNumber` VARCHAR(191) NOT NULL,
    `deliveryPersonId` VARCHAR(191) NOT NULL,
    `settledById` VARCHAR(191) NOT NULL,
    `totalOrders` INTEGER NOT NULL,
    `totalExpectedAmount` DECIMAL(10, 2) NOT NULL,
    `totalCollectedAmount` DECIMAL(10, 2) NOT NULL,
    `totalSettledAmount` DECIMAL(10, 2) NOT NULL,
    `discrepancyAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `notes` TEXT NULL,
    `settledAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `cod_settlements_settlementNumber_key`(`settlementNumber`),
    INDEX `cod_settlements_deliveryPersonId_idx`(`deliveryPersonId`),
    INDEX `cod_settlements_settledById_idx`(`settledById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
