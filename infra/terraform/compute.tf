resource "aws_lb" "api" {
  name                       = substr(local.name, 0, 32)
  internal                   = false
  load_balancer_type         = "application"
  security_groups            = [aws_security_group.alb.id]
  subnets                    = [for subnet in aws_subnet.public : subnet.id]
  enable_deletion_protection = true
  access_logs {
    bucket  = aws_s3_bucket.app["logs"].id
    prefix  = "alb"
    enabled = true
  }
}

resource "aws_lb_target_group" "api" {
  name        = substr("${local.name}-api", 0, 32)
  port        = var.container_port
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = aws_vpc.main.id
  health_check {
    path                = "/health"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
    matcher             = "200"
  }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.api.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.alb_certificate_arn
  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}

resource "aws_ecs_cluster" "main" {
  name = local.name
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/ecs/${local.name}/api"
  retention_in_days = 90
  kms_key_id        = aws_kms_key.data.arn
}

resource "aws_cloudwatch_log_group" "worker" {
  name              = "/ecs/${local.name}/worker"
  retention_in_days = 90
  kms_key_id        = aws_kms_key.data.arn
}

resource "aws_iam_role" "ecs_execution" {
  name = "${local.name}-ecs-execution"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "ecs-tasks.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_execution" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "ecs_execution_secrets" {
  role = aws_iam_role.ecs_execution.id
  policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Action = ["secretsmanager:GetSecretValue", "kms:Decrypt"], Resource = [var.app_secret_arn, aws_kms_key.data.arn] }]
  })
}

resource "aws_iam_role" "app" {
  name = "${local.name}-app"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "ecs-tasks.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}

resource "aws_iam_role_policy" "app" {
  role = aws_iam_role.app.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"], Resource = concat([for bucket in aws_s3_bucket.app : bucket.arn], [for bucket in aws_s3_bucket.app : "${bucket.arn}/*"]) },
      { Effect = "Allow", Action = ["secretsmanager:CreateSecret", "secretsmanager:PutSecretValue", "secretsmanager:GetSecretValue", "secretsmanager:DeleteSecret", "secretsmanager:TagResource"], Resource = "arn:aws:secretsmanager:${var.aws_region}:*:secret:moonsconfig/*" },
      { Effect = "Allow", Action = ["kms:Decrypt", "kms:Encrypt", "kms:GenerateDataKey"], Resource = aws_kms_key.data.arn },
      { Effect = "Allow", Action = ["cloudfront:CreateDistributionTenant", "cloudfront:GetDistributionTenant", "cloudfront:UpdateDistributionTenant", "cloudfront:DeleteDistributionTenant"], Resource = "*" }
    ]
  })
}

locals {
  common_environment = [
    { name = "NODE_ENV", value = "production" },
    { name = "AWS_REGION", value = var.aws_region },
    { name = "AWS_UPLOAD_BUCKET", value = aws_s3_bucket.app["uploads"].id },
    { name = "AWS_EXPORT_BUCKET", value = aws_s3_bucket.app["exports"].id },
    { name = "AWS_BACKUP_BUCKET", value = aws_s3_bucket.app["backups"].id },
    { name = "REDIS_HOST", value = aws_elasticache_replication_group.redis.primary_endpoint_address },
    { name = "REDIS_PORT", value = "6379" },
    { name = "REDIS_TLS", value = "true" },
    { name = "LEGACY_ROUTING_ENABLED", value = "false" },
    { name = "SECRETS_BACKEND", value = "aws" },
    { name = "AWS_CLOUDFRONT_DISTRIBUTION_ID", value = aws_cloudfront_multitenant_distribution.app.id },
    { name = "AWS_CLOUDFRONT_CONNECTION_GROUP", value = aws_cloudfront_connection_group.app.id },
    { name = "AWS_CLOUDFRONT_ROUTING_ENDPOINT", value = aws_cloudfront_connection_group.app.routing_endpoint }
  ]
  common_secrets = [for key in ["DATABASE_URL", "PLATFORM_DATABASE_URL", "JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET", "COOKIE_SECRET", "ENCRYPTION_KEY", "REDIS_PASSWORD", "ORIGIN_SHARED_SECRET"] : {
    name      = key
    valueFrom = "${var.app_secret_arn}:${key}::"
  }]
}

resource "aws_ecs_task_definition" "api" {
  family                   = "${local.name}-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.api_cpu
  memory                   = var.api_memory
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.app.arn
  container_definitions = jsonencode([{
    name             = "api"
    image            = var.api_image
    essential        = true
    portMappings     = [{ containerPort = var.container_port, protocol = "tcp" }]
    environment      = local.common_environment
    secrets          = local.common_secrets
    healthCheck      = { command = ["CMD-SHELL", "node -e \"fetch('http://localhost:${var.container_port}/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\""], interval = 30, timeout = 5, retries = 3, startPeriod = 60 }
    logConfiguration = { logDriver = "awslogs", options = { "awslogs-group" = aws_cloudwatch_log_group.api.name, "awslogs-region" = var.aws_region, "awslogs-stream-prefix" = "api" } }
  }])
}

resource "aws_ecs_task_definition" "worker" {
  family                   = "${local.name}-worker"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.worker_cpu
  memory                   = var.worker_memory
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.app.arn
  container_definitions = jsonencode([{
    name             = "worker"
    image            = var.worker_image
    essential        = true
    command          = ["npm", "run", "worker"]
    environment      = local.common_environment
    secrets          = local.common_secrets
    logConfiguration = { logDriver = "awslogs", options = { "awslogs-group" = aws_cloudwatch_log_group.worker.name, "awslogs-region" = var.aws_region, "awslogs-stream-prefix" = "worker" } }
  }])
}

resource "aws_ecs_service" "api" {
  name            = "api"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = var.api_desired_count
  launch_type     = "FARGATE"
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }
  network_configuration {
    subnets          = [for subnet in aws_subnet.private : subnet.id]
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = false
  }
  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = var.container_port
  }
  depends_on = [aws_lb_listener.https]
}

resource "aws_ecs_service" "worker" {
  name            = "worker"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.worker.arn
  desired_count   = var.worker_desired_count
  launch_type     = "FARGATE"
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }
  network_configuration {
    subnets          = [for subnet in aws_subnet.private : subnet.id]
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = false
  }
}

resource "aws_appautoscaling_target" "api" {
  max_capacity       = 20
  min_capacity       = 2
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.api.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "api_cpu" {
  name               = "api-cpu"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.api.resource_id
  scalable_dimension = aws_appautoscaling_target.api.scalable_dimension
  service_namespace  = aws_appautoscaling_target.api.service_namespace
  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = 60
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}
