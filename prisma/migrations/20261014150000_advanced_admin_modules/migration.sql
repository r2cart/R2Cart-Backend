-- AlterTable users
ALTER TABLE `users`
  ADD COLUMN `staffRole` VARCHAR(191) NULL,
  ADD COLUMN `permissions` JSON NULL,
  ADD COLUMN `isStaffActive` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `lastLoginAt` DATETIME(3) NULL,
  ADD COLUMN `lastLoginIp` VARCHAR(191) NULL;

-- AlterTable products
ALTER TABLE `products`
  ADD COLUMN `hasExpiry` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `expiryDate` DATETIME(3) NULL,
  ADD COLUMN `batchNumber` VARCHAR(191) NULL;

-- AlterTable coupons
ALTER TABLE `coupons`
  ADD COLUMN `isFirstOrderOnly` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `targetUserIds` JSON NULL,
  ADD COLUMN `campaignName` VARCHAR(191) NULL,
  ADD COLUMN `description` VARCHAR(191) NULL;

-- AlterTable delivery_areas
ALTER TABLE `delivery_areas`
  ADD COLUMN `isPaused` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `schedule` JSON NULL;

-- AlterTable store_settings
ALTER TABLE `store_settings`
  ADD COLUMN `autoHideOutOfStock` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `globalDeliveryRadius` DECIMAL(6, 2) NULL DEFAULT 5.00,
  ADD COLUMN `isOrderPaused` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `orderPauseMessage` TEXT NULL,
  ADD COLUMN `holidays` JSON NULL,
  ADD COLUMN `weekdayHours` JSON NULL,
  ADD COLUMN `prepTimeMinutes` INTEGER NOT NULL DEFAULT 30;

-- CreateTable delivery_villages
CREATE TABLE IF NOT EXISTS `delivery_villages` (
    `id` VARCHAR(191) NOT NULL,
    `areaId` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `pincode` VARCHAR(191) NULL,
    `deliveryFee` DECIMAL(10, 2) NOT NULL,
    `minimumOrder` DECIMAL(10, 2) NOT NULL,
    `freeDeliveryThreshold` DECIMAL(10, 2) NOT NULL,
    `radiusKm` DECIMAL(6, 2) NULL DEFAULT 5.00,
    `schedule` VARCHAR(191) NULL,
    `isPaused` BOOLEAN NOT NULL DEFAULT false,
    `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `notes` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `delivery_villages_name_idx`(`name`),
    INDEX `delivery_villages_areaId_idx`(`areaId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable inventory_logs
CREATE TABLE IF NOT EXISTS `inventory_logs` (
    `id` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `previousStock` INTEGER NOT NULL,
    `newStock` INTEGER NOT NULL,
    `quantityDiff` INTEGER NOT NULL,
    `reason` VARCHAR(191) NOT NULL,
    `adminId` VARCHAR(191) NULL,
    `adminName` VARCHAR(191) NULL,
    `orderId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `inventory_logs_productId_createdAt_idx`(`productId`, `createdAt`),
    INDEX `inventory_logs_type_idx`(`type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable delivery_slots
CREATE TABLE IF NOT EXISTS `delivery_slots` (
    `id` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `startTime` VARCHAR(191) NOT NULL,
    `endTime` VARCHAR(191) NOT NULL,
    `maxOrders` INTEGER NOT NULL DEFAULT 20,
    `cutoffMinutes` INTEGER NOT NULL DEFAULT 60,
    `daysOfWeek` JSON NULL,
    `position` INTEGER NOT NULL DEFAULT 0,
    `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable marketing_campaigns
CREATE TABLE IF NOT EXISTS `marketing_campaigns` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `subtitle` VARCHAR(191) NULL,
    `badge` VARCHAR(191) NULL,
    `content` TEXT NULL,
    `imageUrl` TEXT NULL,
    `linkUrl` VARCHAR(191) NULL,
    `bgColor` VARCHAR(191) NULL,
    `textColor` VARCHAR(191) NULL,
    `startsAt` DATETIME(3) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `position` INTEGER NOT NULL DEFAULT 0,
    `metadata` JSON NULL,
    `viewCount` INTEGER NOT NULL DEFAULT 0,
    `clickCount` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `marketing_campaigns_type_status_idx`(`type`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable audit_logs
CREATE TABLE IF NOT EXISTS `audit_logs` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `userName` VARCHAR(191) NULL,
    `userRole` VARCHAR(191) NULL,
    `module` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `resourceId` VARCHAR(191) NULL,
    `resourceName` VARCHAR(191) NULL,
    `details` JSON NULL,
    `ipAddress` VARCHAR(191) NULL,
    `userAgent` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_logs_module_createdAt_idx`(`module`, `createdAt`),
    INDEX `audit_logs_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `audit_logs_action_idx`(`action`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
