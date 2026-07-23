locals {
  bucket_names = {
    uploads = "${local.name}-uploads"
    exports = "${local.name}-exports"
    backups = "${local.name}-backups"
    logs    = "${local.name}-logs"
    client  = "${local.name}-client"
  }
}

resource "aws_s3_bucket" "app" {
  for_each      = local.bucket_names
  bucket        = each.value
  force_destroy = false
}

resource "aws_s3_bucket_public_access_block" "app" {
  for_each                = aws_s3_bucket.app
  bucket                  = each.value.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "app" {
  for_each = aws_s3_bucket.app
  bucket   = each.value.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "app" {
  for_each = aws_s3_bucket.app
  bucket   = each.value.id
  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = each.key == "logs" ? null : aws_kms_key.data.arn
      sse_algorithm     = each.key == "logs" ? "AES256" : "aws:kms"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "app" {
  for_each = aws_s3_bucket.app
  bucket   = each.value.id

  rule {
    id     = "abort-incomplete-multipart"
    status = "Enabled"
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  dynamic "rule" {
    for_each = contains(["exports", "logs"], each.key) ? [1] : []
    content {
      id     = "expire-temporary-content"
      status = "Enabled"
      expiration {
        days = each.key == "exports" ? 7 : 365
      }
      noncurrent_version_expiration {
        noncurrent_days = 30
      }
    }
  }
}

resource "aws_s3_bucket" "backup_copy" {
  provider            = aws.backup
  bucket              = "${local.name}-backup-copy-${var.backup_region}"
  force_destroy       = false
  object_lock_enabled = true
}

resource "aws_s3_bucket_object_lock_configuration" "backup_copy" {
  provider = aws.backup
  bucket   = aws_s3_bucket.backup_copy.id
  rule {
    default_retention {
      mode = "COMPLIANCE"
      days = 365
    }
  }
}

resource "aws_s3_bucket_public_access_block" "backup_copy" {
  provider                = aws.backup
  bucket                  = aws_s3_bucket.backup_copy.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "backup_copy" {
  provider = aws.backup
  bucket   = aws_s3_bucket.backup_copy.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "backup_copy" {
  provider = aws.backup
  bucket   = aws_s3_bucket.backup_copy.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_iam_role" "replication" {
  name = "${local.name}-s3-replication"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "s3.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}

resource "aws_iam_role_policy" "replication" {
  role = aws_iam_role.replication.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = ["s3:GetReplicationConfiguration", "s3:ListBucket"], Resource = aws_s3_bucket.app["backups"].arn },
      { Effect = "Allow", Action = ["s3:GetObjectVersion", "s3:GetObjectVersionAcl", "s3:GetObjectVersionForReplication", "s3:GetObjectVersionTagging"], Resource = "${aws_s3_bucket.app["backups"].arn}/*" },
      { Effect = "Allow", Action = ["s3:ReplicateObject", "s3:ReplicateDelete", "s3:ReplicateTags"], Resource = "${aws_s3_bucket.backup_copy.arn}/*" },
      { Effect = "Allow", Action = ["kms:Decrypt", "kms:GenerateDataKey"], Resource = aws_kms_key.data.arn }
    ]
  })
}

resource "aws_s3_bucket_replication_configuration" "backups" {
  depends_on = [aws_s3_bucket_versioning.app, aws_s3_bucket_versioning.backup_copy]
  role       = aws_iam_role.replication.arn
  bucket     = aws_s3_bucket.app["backups"].id
  rule {
    id     = "cross-region-backup"
    status = "Enabled"
    destination {
      bucket        = aws_s3_bucket.backup_copy.arn
      storage_class = "STANDARD_IA"
    }
  }
}
