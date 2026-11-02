-- REVIEW ONLY: not applied. Execute only after an approved backup and DB review.
-- Select the approved existing database outside this script; no USE/CREATE DATABASE.
-- Prerequisites: Users is InnoDB; user_id is signed INT PRIMARY KEY; compatible
-- legacy columns as documented in README.md. New table names must not exist.
-- No existing table, row, login_id, password hash, or account role is changed.
-- DDL commits implicitly: the two statements are NOT one rollbackable transaction.
-- Deliberately no IF NOT EXISTS: pre-existing/partially applied schemas must be reviewed.

CREATE TABLE `mobile_auth_accounts` (
    `user_id` INT NOT NULL,
    `email` VARCHAR(254) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    `role` ENUM('patient', 'guardian') NOT NULL DEFAULT 'patient',
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`user_id`),
    UNIQUE KEY `uq_mobile_auth_email` (`email`),
    CONSTRAINT `fk_mobile_auth_user` FOREIGN KEY (`user_id`)
        REFERENCES `Users` (`user_id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `mobile_auth_sessions` (
    `token_hash` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    `user_id` INT NOT NULL,
    `credential_hash` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    `expires_at` DATETIME(3) NOT NULL COMMENT 'UTC',
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`token_hash`),
    KEY `ix_mobile_auth_session_user` (`user_id`),
    KEY `ix_mobile_auth_session_expiry` (`expires_at`),
    CONSTRAINT `fk_mobile_auth_session_account` FOREIGN KEY (`user_id`)
        REFERENCES `mobile_auth_accounts` (`user_id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
