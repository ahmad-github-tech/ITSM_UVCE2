CREATE DATABASE IF NOT EXISTS supportflow_db;
USE supportflow_db;

CREATE TABLE IF NOT EXISTS support_tasks (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    ticket_id VARCHAR(50) NOT NULL,
    project_id VARCHAR(100) NOT NULL,
    support_level VARCHAR(10) NOT NULL,
    priority VARCHAR(10) NOT NULL,
    generation_date DATETIME NOT NULL,
    response_date DATETIME,
    closure_date DATETIME,
    status VARCHAR(50) NOT NULL,
    user_intimated BOOLEAN DEFAULT FALSE,
    description TEXT,
    solution TEXT,
    remarks TEXT,
    assigned_to VARCHAR(100),
    created_by VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS project_configs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    project_id VARCHAR(100) NOT NULL UNIQUE,
    p1_response INT,
    p1_resolution INT,
    p2_response INT,
    p2_resolution INT,
    p3_response INT,
    p3_resolution INT,
    p4_response INT,
    p4_resolution INT
);
