-- Dr. MAS 프로젝트 데이터베이스 초기화 스크립트 (v2)
-- 생성일: 2026-05-14
-- 설명: 팀원의 server.js 코드와 호환되는 데이터베이스 및 테이블 구조

CREATE DATABASE IF NOT EXISTS `dr_mas_db` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `dr_mas_db`;

-- 1. 증상 분석 로그 테이블 (server.js 연동 핵심 테이블)
DROP TABLE IF EXISTS `symptom_logs`;
CREATE TABLE `symptom_logs` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `user_id` INT NOT NULL DEFAULT 1,
    `symptom_text` TEXT NOT NULL COMMENT '사용자 입력 증상',
    `ai_predicted_disease` VARCHAR(255) COMMENT 'Gemini 분석 예상 질환',
    `ai_guide` TEXT COMMENT 'Gemini 제공 행동 지침 및 병원 안내',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. 사용자 정보 테이블 (기존 설계 유지)
DROP TABLE IF EXISTS `Users`;
CREATE TABLE `Users` (
  `user_id` INT NOT NULL AUTO_INCREMENT,
  `login_id` VARCHAR(50) NOT NULL,
  `password` VARCHAR(255) NOT NULL,
  `username` VARCHAR(30) NOT NULL,
  `age` INT DEFAULT NULL,
  `gender` ENUM('Male','Female','Other') DEFAULT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `login_id` (`login_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. 의료 시설 정보 테이블 (기존 설계 유지)
DROP TABLE IF EXISTS `Facilities`;
CREATE TABLE `Facilities` (
  `facility_id` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(100) NOT NULL,
  `category` ENUM('Hospital','Pharmacy') NOT NULL,
  `department` VARCHAR(50) DEFAULT NULL,
  `latitude` DECIMAL(10,8) DEFAULT NULL,
  `longitude` DECIMAL(11,8) DEFAULT NULL,
  `address` VARCHAR(255) DEFAULT NULL,
  `phone` VARCHAR(20) DEFAULT NULL,
  PRIMARY KEY (`facility_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;