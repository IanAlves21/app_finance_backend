-- Script de inicialização para criação automática dos bancos de dados adicionais
-- O banco principal (service_transactions_db) já é criado nativamente pela variável POSTGRES_DB

SELECT 'CREATE DATABASE service_identity_db'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'service_identity_db')\gexec

SELECT 'CREATE DATABASE service_analytics_db'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'service_analytics_db')\gexec
