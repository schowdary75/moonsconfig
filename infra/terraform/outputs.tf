output "alb_dns_name" { value = aws_lb.api.dns_name }
output "rds_endpoint" { value = aws_db_instance.mysql.address }
output "rds_proxy_endpoint" { value = aws_db_proxy.platform.endpoint }
output "redis_endpoint" { value = aws_elasticache_replication_group.redis.primary_endpoint_address }
output "cloudfront_distribution_id" { value = aws_cloudfront_multitenant_distribution.app.id }
output "cloudfront_connection_group_id" { value = aws_cloudfront_connection_group.app.id }
output "cloudfront_routing_endpoint" { value = aws_cloudfront_connection_group.app.routing_endpoint }
output "bucket_names" { value = { for key, bucket in aws_s3_bucket.app : key => bucket.id } }
