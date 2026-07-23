resource "aws_db_subnet_group" "main" {
  name       = local.name
  subnet_ids = [for subnet in aws_subnet.private : subnet.id]
}

resource "aws_db_instance" "mysql" {
  identifier                            = "${local.name}-mysql"
  engine                                = "mysql"
  engine_version                        = var.db_engine_version
  instance_class                        = var.db_instance_class
  allocated_storage                     = 100
  max_allocated_storage                 = 1000
  storage_type                          = "gp3"
  storage_encrypted                     = true
  kms_key_id                            = aws_kms_key.data.arn
  username                              = "moons_platform_admin"
  manage_master_user_password           = true
  master_user_secret_kms_key_id         = aws_kms_key.data.arn
  multi_az                              = true
  backup_retention_period               = 35
  backup_window                         = "18:00-19:00"
  maintenance_window                    = "sun:19:30-sun:20:30"
  db_subnet_group_name                  = aws_db_subnet_group.main.name
  vpc_security_group_ids                = [aws_security_group.data.id]
  deletion_protection                   = true
  skip_final_snapshot                   = false
  final_snapshot_identifier             = "${local.name}-final"
  performance_insights_enabled          = true
  performance_insights_kms_key_id       = aws_kms_key.data.arn
  performance_insights_retention_period = 7
  enabled_cloudwatch_logs_exports       = ["error", "general", "slowquery"]
  auto_minor_version_upgrade            = true
  publicly_accessible                   = false
}

resource "aws_elasticache_subnet_group" "main" {
  name       = local.name
  subnet_ids = [for subnet in aws_subnet.private : subnet.id]
}

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id       = "${local.name}-redis"
  description                = "MooNsConfig queues, cache, rate limits, and sockets"
  node_type                  = "cache.r7g.large"
  port                       = 6379
  parameter_group_name       = "default.redis7"
  subnet_group_name          = aws_elasticache_subnet_group.main.name
  security_group_ids         = [aws_security_group.data.id]
  num_cache_clusters         = 2
  automatic_failover_enabled = true
  multi_az_enabled           = true
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  snapshot_retention_limit   = 7
}

resource "aws_iam_role" "rds_proxy" {
  name = "${local.name}-rds-proxy"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "rds.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}

resource "aws_iam_role_policy" "rds_proxy" {
  role = aws_iam_role.rds_proxy.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = "secretsmanager:GetSecretValue", Resource = aws_db_instance.mysql.master_user_secret[0].secret_arn },
      { Effect = "Allow", Action = "kms:Decrypt", Resource = aws_kms_key.data.arn }
    ]
  })
}

resource "aws_db_proxy" "platform" {
  name                   = "${local.name}-platform"
  debug_logging          = false
  engine_family          = "MYSQL"
  idle_client_timeout    = 1800
  require_tls            = true
  role_arn               = aws_iam_role.rds_proxy.arn
  vpc_security_group_ids = [aws_security_group.data.id]
  vpc_subnet_ids         = [for subnet in aws_subnet.private : subnet.id]
  auth {
    auth_scheme = "SECRETS"
    secret_arn  = aws_db_instance.mysql.master_user_secret[0].secret_arn
    iam_auth    = "DISABLED"
  }
}

resource "aws_db_proxy_default_target_group" "platform" {
  db_proxy_name = aws_db_proxy.platform.name
  connection_pool_config {
    connection_borrow_timeout    = 120
    max_connections_percent      = 50
    max_idle_connections_percent = 25
  }
}

resource "aws_db_proxy_target" "platform" {
  db_instance_identifier = aws_db_instance.mysql.identifier
  db_proxy_name          = aws_db_proxy.platform.name
  target_group_name      = aws_db_proxy_default_target_group.platform.name
}
