import { createHash } from 'node:crypto';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import Joi from 'joi';

loadEnv({ path: path.resolve(process.cwd(), '..', '.env'), quiet: true });
// Workspace-specific values take precedence over shared root defaults in local development.
loadEnv({ path: path.resolve(process.cwd(), '.env'), override: true, quiet: true });
loadEnv({ path: path.resolve(process.cwd(), '.env.local'), override: true, quiet: true });

if (!process.env.DATABASE_URL && process.env.DATABASE_HOST) {
  const user = encodeURIComponent(process.env.DATABASE_USER || 'root');
  const password = encodeURIComponent(process.env.DATABASE_PASSWORD || '');
  const host = process.env.DATABASE_HOST;
  const port = process.env.DATABASE_PORT || '3306';
  const database = process.env.DATABASE_NAME || 'moonsconfig';
  process.env.DATABASE_URL = `mysql://${user}:${password}@${host}:${port}/${database}`;
}

if (process.env.DATABASE_URL) {
  if (!process.env.PLATFORM_DATABASE_URL) {
    const platformUrl = new URL(process.env.DATABASE_URL);
    platformUrl.pathname = '/moonsconfig_platform';
    process.env.PLATFORM_DATABASE_URL = platformUrl.toString();
  }
  process.env.TENANT_DATABASE_BASE_URL ||= process.env.DATABASE_URL;
  process.env.TENANT_PROVISIONING_DATABASE_URL ||= process.env.DATABASE_URL;
}

if (!process.env.TENANT_CREDENTIAL_ENCRYPTION_KEY && process.env.JWT_ACCESS_SECRET) {
  process.env.TENANT_CREDENTIAL_ENCRYPTION_KEY = createHash('sha256')
    .update(`moonsconfig:tenant-credentials:${process.env.JWT_ACCESS_SECRET}`)
    .digest('hex');
}

const schema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().port().default(4000),
  API_PREFIX: Joi.string()
    .pattern(/^\/[a-z0-9/-]+$/)
    .default('/api/v1'),
  DATABASE_URL: Joi.string()
    .uri()
    .default('mysql://moon_user:change-me@127.0.0.1:3306/moonsconfig'),
  PLATFORM_DATABASE_URL: Joi.string()
    .uri()
    .default('mysql://moon_user:change-me@127.0.0.1:3306/moonsconfig_platform'),
  TENANT_DATABASE_BASE_URL: Joi.string().uri().default(Joi.ref('DATABASE_URL')),
  TENANT_PROVISIONING_DATABASE_URL: Joi.string().uri().default(Joi.ref('DATABASE_URL')),
  TENANT_DATABASE_CONNECTION_LIMIT: Joi.number().integer().min(1).max(10).default(2),
  TENANT_CREDENTIAL_ENCRYPTION_KEY: Joi.string()
    .min(24)
    .default('development-tenant-credential-key'),
  APP_BASE_DOMAIN: Joi.string().hostname().default('localhost'),
  APP_PUBLIC_URL: Joi.string().uri().default('http://localhost:5174'),
  AWS_REGION: Joi.string().default('ap-south-1'),
  AWS_UPLOAD_BUCKET: Joi.string().allow('').default(''),
  AWS_EXPORT_BUCKET: Joi.string().allow('').default(''),
  AWS_BACKUP_BUCKET: Joi.string().allow('').default(''),
  AWS_CLOUDFRONT_DISTRIBUTION_ID: Joi.string().allow('').default(''),
  AWS_CLOUDFRONT_CONNECTION_GROUP: Joi.string().allow('').default(''),
  AWS_CLOUDFRONT_ROUTING_ENDPOINT: Joi.string().allow('').default(''),
  ORIGIN_SHARED_SECRET: Joi.string().allow('').default(''),
  MALWARE_WEBHOOK_SECRET: Joi.string().allow('').default(''),
  SECRETS_BACKEND: Joi.string().valid('local', 'aws').default('local'),
  WORKOS_API_KEY: Joi.string().allow('').default(''),
  WORKOS_CLIENT_ID: Joi.string().allow('').default(''),
  WORKOS_REDIRECT_URI: Joi.string().uri().default('http://localhost:5174/auth/sso/callback'),
  ZOHO_BOOKS_ENABLED: Joi.boolean().truthy('true').falsy('false').default(false),
  ZOHO_BOOKS_BASE_URL: Joi.string().uri().default('https://www.zohoapis.in/books/v3'),
  ZOHO_ACCOUNTS_URL: Joi.string().uri().default('https://accounts.zoho.in/oauth/v2/token'),
  ZOHO_ORGANIZATION_ID: Joi.string().allow('').default(''),
  ZOHO_CLIENT_ID: Joi.string().allow('').default(''),
  ZOHO_CLIENT_SECRET: Joi.string().allow('').default(''),
  ZOHO_REFRESH_TOKEN: Joi.string().allow('').default(''),
  ZOHO_TAX_ID: Joi.string().allow('').default(''),
  ZOHO_ITEM_ID: Joi.string().allow('').default(''),
  PLATFORM_LEGAL_NAME: Joi.string().allow('').default(''),
  PLATFORM_GSTIN: Joi.string().allow('').default(''),
  PLATFORM_STATE_CODE: Joi.string().allow('').default(''),
  PLATFORM_BILLING_ADDRESS: Joi.string().allow('').default(''),
  PLATFORM_SAC: Joi.string().default('998314'),
  RAZORPAY_KEY_ID: Joi.string().allow('').default(''),
  RAZORPAY_KEY_SECRET: Joi.string().allow('').default(''),
  RAZORPAY_WEBHOOK_SECRET: Joi.string().allow('').default(''),
  REDIS_URL: Joi.string().uri().default('redis://127.0.0.1:6379'),
  JWT_ACCESS_SECRET: Joi.string()
    .min(32)
    .default('development-only-secret-change-before-production'),
  JWT_ISSUER: Joi.string().default('moonsconfig'),
  JWT_AUDIENCE: Joi.string().default('moonsconfig-client'),
  OPERATOR_JWT_SECRET: Joi.string().min(32).default(Joi.ref('JWT_ACCESS_SECRET')),
  ACCESS_TOKEN_TTL: Joi.string().default('10m'),
  REFRESH_TOKEN_DAYS: Joi.number().integer().min(1).max(90).default(30),
  AUTH_PASSWORD_PEPPER: Joi.string().allow('').default(''),
  BCRYPT_ROUNDS: Joi.number().integer().min(10).max(15).default(12),
  CORS_ORIGINS: Joi.string().default('http://localhost:5174,http://localhost:8080'),
  GOOGLE_CLIENT_ID: Joi.string().allow('').default(''),
  TRUST_PROXY: Joi.number().integer().min(0).default(1),
  RATE_LIMIT_WINDOW_MS: Joi.number().integer().min(1000).default(900_000),
  API_RATE_LIMIT: Joi.number().integer().min(1).default(500),
  OPERATION_RATE_LIMIT: Joi.number().integer().min(1).default(3000),
  REALTIME_RATE_LIMIT: Joi.number().integer().min(1).default(3000),
  COOKIE_SECURE: Joi.boolean().truthy('true').falsy('false').default(false),
  CUSTOMER_COOKIE_SAME_SITE: Joi.string().valid('lax', 'strict', 'none').default('lax'),
  SOCKET_IO_ENABLED: Joi.boolean().truthy('true').falsy('false').default(false),
  ARI_URL: Joi.string().uri().default('http://127.0.0.1:8088'),
  ARI_USERNAME: Joi.string().min(1).default('asterisk'),
  ARI_PASSWORD: Joi.string().allow('').default('asterisk'),
  ARI_OUTBOUND_ENDPOINT: Joi.string()
    .pattern(/^[A-Za-z0-9_.-]+$/)
    .default('moon'),
  UPLOAD_DIRECTORY: Joi.string().default('../uploads'),
  SCREEN_EXPORT_SOURCE_ROOT: Joi.string().allow('').default(''),
  MAX_UPLOAD_BYTES: Joi.number().integer().min(1024).default(10_485_760),
  RECORDING_DIRECTORY: Joi.string().default('../uploads/recordings'),
  RECORDING_RECONCILE_MS: Joi.number().integer().min(5_000).default(20_000),
  RECORDING_MIN_AGE_MS: Joi.number().integer().min(1_000).default(15_000),
  SMS_GATEWAY_URL: Joi.string().allow('').default(''),
  SMS_GATEWAY_USERNAME: Joi.string().allow('').default(''),
  SMS_GATEWAY_PASSWORD: Joi.string().allow('').default(''),
  LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'http', 'debug').default('info'),
  LOG_DIRECTORY: Joi.string().default('storage/logs'),
  SMTP_HOST: Joi.string().allow('').default(''),
  SMTP_PORT: Joi.number().port().default(587),
  SMTP_SECURE: Joi.boolean().truthy('true').falsy('false').default(false),
  SMTP_USER: Joi.string().allow('').default(''),
  SMTP_PASS: Joi.string().allow('').default(''),
  SMTP_FROM: Joi.string().allow('').default(''),
  DAILY_REPORT_CRON: Joi.string().default('0 6 * * *'),
  CLEANUP_CRON: Joi.string().default('0 2 * * *'),
  DATA_SYNC_CRON: Joi.string().default('0 */6 * * *'),
  AUTONOMOUS_SUPPORT_CRON: Joi.string().default('*/15 * * * * *'),
  MAYA_AUTOPILOT_CRON: Joi.string().default('0 */10 * * * *'),
  MAYA_OPS_SWEEP_CRON: Joi.string().default('0 */15 * * * *'),
  VENDOR_INBOX_SYNC_CRON: Joi.string().default('0 */5 * * * *'),
  TRAVEL_AUTOMATION_CRON: Joi.string().default('*/30 * * * * *'),
  MAYA_ENABLED: Joi.boolean().truthy('true').falsy('false').default(true),
  MAYA_EXTERNAL_WRITES_ENABLED: Joi.boolean().truthy('true').falsy('false').default(false),
  MAYA_TOOL_ALLOWLIST: Joi.string().allow('').default(''),
  MAYA_BRAIN_MODEL: Joi.string().default('gemini-2.5-flash'),
  AERODATABOX_API_KEY: Joi.string().allow('').default(''),
  AERODATABOX_API_HOST: Joi.string().allow('').default('aerodatabox.p.rapidapi.com'),
  META_WHATSAPP_TOKEN: Joi.string().allow('').default(''),
  META_WHATSAPP_PHONE_NUMBER_ID: Joi.string().allow('').default(''),
  TRAVEL_RULES_PROVIDER: Joi.string()
    .valid('timatic', 'official_sources', 'disabled')
    .default('disabled'),
  TRAVEL_RULES_API_KEY: Joi.string().allow('').default(''),
  INSURANCE_PROVIDER: Joi.string().allow('').default(''),
  INSURANCE_API_KEY: Joi.string().allow('').default(''),
  INVENTORY_PROVIDER: Joi.string().allow('').default(''),
  INVENTORY_API_BASE_URL: Joi.string().uri().allow('').default(''),
  INVENTORY_API_KEY: Joi.string().allow('').default(''),
  INVENTORY_TIMEOUT_MS: Joi.number().integer().min(100).max(60_000).default(20_000),
  CRON_ENABLED: Joi.boolean().truthy('true').falsy('false').default(true),
  LEGACY_SESSION_ENABLED: Joi.boolean().truthy('true').falsy('false').default(true),
  LEGACY_ROUTING_ENABLED: Joi.boolean().truthy('true').falsy('false').default(false),
  PUBLIC_REGISTRATION_ENABLED: Joi.boolean().truthy('true').falsy('false').default(false),
  LEGAL_APPROVAL_DATE: Joi.string().isoDate().allow('').default(''),
  PEN_TEST_APPROVED_AT: Joi.string().isoDate().allow('').default(''),
  BACKUP_RESTORE_VERIFIED_AT: Joi.string().isoDate().allow('').default(''),
  STATUS_PAGE_URL: Joi.string().uri().allow('').default(''),
  INCIDENT_CONTACT: Joi.string().email().allow('').default(''),
  MYSQLDUMP_BINARY: Joi.string().default('mysqldump'),
  MYSQL_BINARY: Joi.string().default('mysql'),
}).unknown(true);

const { value, error } = schema.validate(process.env, { abortEarly: false, convert: true });
if (error) throw new Error(`Environment validation failed: ${error.message}`);
if (value.NODE_ENV === 'production' && value.JWT_ACCESS_SECRET.startsWith('development-')) {
  throw new Error('JWT_ACCESS_SECRET must be configured in production');
}
if (
  value.NODE_ENV === 'production' &&
  value.TENANT_CREDENTIAL_ENCRYPTION_KEY.startsWith('development-')
) {
  throw new Error('TENANT_CREDENTIAL_ENCRYPTION_KEY must be configured in production');
}

export const env = {
  nodeEnv: value.NODE_ENV as 'development' | 'test' | 'production',
  port: value.PORT as number,
  apiPrefix: value.API_PREFIX as string,
  databaseUrl: value.DATABASE_URL as string,
  platformDatabaseUrl: value.PLATFORM_DATABASE_URL as string,
  tenantDatabaseBaseUrl: value.TENANT_DATABASE_BASE_URL as string,
  tenantProvisioningDatabaseUrl: value.TENANT_PROVISIONING_DATABASE_URL as string,
  tenantDatabaseConnectionLimit: value.TENANT_DATABASE_CONNECTION_LIMIT as number,
  tenantCredentialEncryptionKey: value.TENANT_CREDENTIAL_ENCRYPTION_KEY as string,
  appBaseDomain: value.APP_BASE_DOMAIN as string,
  appPublicUrl: (value.APP_PUBLIC_URL as string).replace(/\/$/, ''),
  aws: {
    region: value.AWS_REGION as string,
    uploadBucket: value.AWS_UPLOAD_BUCKET as string,
    exportBucket: value.AWS_EXPORT_BUCKET as string,
    backupBucket: value.AWS_BACKUP_BUCKET as string,
    cloudFrontDistributionId: value.AWS_CLOUDFRONT_DISTRIBUTION_ID as string,
    cloudFrontConnectionGroup: value.AWS_CLOUDFRONT_CONNECTION_GROUP as string,
    cloudFrontRoutingEndpoint: value.AWS_CLOUDFRONT_ROUTING_ENDPOINT as string,
    originSharedSecret: value.ORIGIN_SHARED_SECRET as string,
    malwareWebhookSecret: value.MALWARE_WEBHOOK_SECRET as string,
  },
  secretsBackend: value.SECRETS_BACKEND as 'local' | 'aws',
  workos: {
    apiKey: value.WORKOS_API_KEY as string,
    clientId: value.WORKOS_CLIENT_ID as string,
    redirectUri: value.WORKOS_REDIRECT_URI as string,
  },
  zoho: {
    enabled: value.ZOHO_BOOKS_ENABLED as boolean,
    baseUrl: (value.ZOHO_BOOKS_BASE_URL as string).replace(/\/$/, ''),
    accountsUrl: value.ZOHO_ACCOUNTS_URL as string,
    organizationId: value.ZOHO_ORGANIZATION_ID as string,
    clientId: value.ZOHO_CLIENT_ID as string,
    clientSecret: value.ZOHO_CLIENT_SECRET as string,
    refreshToken: value.ZOHO_REFRESH_TOKEN as string,
    taxId: value.ZOHO_TAX_ID as string,
    itemId: value.ZOHO_ITEM_ID as string,
  },
  platformBusiness: {
    legalName: value.PLATFORM_LEGAL_NAME as string,
    gstin: value.PLATFORM_GSTIN as string,
    stateCode: value.PLATFORM_STATE_CODE as string,
    billingAddress: value.PLATFORM_BILLING_ADDRESS as string,
    sac: value.PLATFORM_SAC as string,
  },
  razorpay: {
    keyId: value.RAZORPAY_KEY_ID as string,
    keySecret: value.RAZORPAY_KEY_SECRET as string,
    webhookSecret: value.RAZORPAY_WEBHOOK_SECRET as string,
  },
  redisUrl: value.REDIS_URL as string,
  jwtSecret: value.JWT_ACCESS_SECRET as string,
  jwtIssuer: value.JWT_ISSUER as string,
  jwtAudience: value.JWT_AUDIENCE as string,
  operatorJwtSecret: value.OPERATOR_JWT_SECRET as string,
  accessTokenTtl: value.ACCESS_TOKEN_TTL as string,
  refreshTokenDays: value.REFRESH_TOKEN_DAYS as number,
  passwordPepper: value.AUTH_PASSWORD_PEPPER as string,
  bcryptRounds: value.BCRYPT_ROUNDS as number,
  corsOrigins: (value.CORS_ORIGINS as string)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean),
  googleClientId: ((value.GOOGLE_CLIENT_ID || value.VITE_GOOGLE_CLIENT_ID || '') as string).trim(),
  trustProxy: value.TRUST_PROXY as number,
  rateLimit: {
    windowMs: value.RATE_LIMIT_WINDOW_MS as number,
    api: value.API_RATE_LIMIT as number,
    operations: value.OPERATION_RATE_LIMIT as number,
    realtime: value.REALTIME_RATE_LIMIT as number,
  },
  cookieSecure: value.COOKIE_SECURE as boolean,
  customerCookieSameSite: value.CUSTOMER_COOKIE_SAME_SITE as 'lax' | 'strict' | 'none',
  socketEnabled: value.SOCKET_IO_ENABLED as boolean,
  asteriskAri: {
    url: value.ARI_URL as string,
    username: value.ARI_USERNAME as string,
    password: value.ARI_PASSWORD as string,
    outboundEndpoint: value.ARI_OUTBOUND_ENDPOINT as string,
  },
  uploadDirectory: value.UPLOAD_DIRECTORY as string,
  screenExportSourceRoot: (value.SCREEN_EXPORT_SOURCE_ROOT as string).trim(),
  maxUploadBytes: value.MAX_UPLOAD_BYTES as number,
  recordingDirectory: value.RECORDING_DIRECTORY as string,
  recordingReconcileMs: value.RECORDING_RECONCILE_MS as number,
  recordingMinAgeMs: value.RECORDING_MIN_AGE_MS as number,
  smsGateway: {
    url: (value.SMS_GATEWAY_URL as string).replace(/\/+$/, ''),
    username: value.SMS_GATEWAY_USERNAME as string,
    password: value.SMS_GATEWAY_PASSWORD as string,
  },
  logLevel: value.LOG_LEVEL as string,
  logDirectory: value.LOG_DIRECTORY as string,
  smtp: {
    host: value.SMTP_HOST as string,
    port: value.SMTP_PORT as number,
    secure: value.SMTP_SECURE as boolean,
    user: value.SMTP_USER as string,
    pass: value.SMTP_PASS as string,
    from: value.SMTP_FROM as string,
  },
  cron: {
    dailyReport: value.DAILY_REPORT_CRON as string,
    cleanup: value.CLEANUP_CRON as string,
    dataSync: value.DATA_SYNC_CRON as string,
    autonomousSupport: value.AUTONOMOUS_SUPPORT_CRON as string,
    mayaAutopilot: value.MAYA_AUTOPILOT_CRON as string,
    mayaOpsSweep: value.MAYA_OPS_SWEEP_CRON as string,
    vendorInboxSync: value.VENDOR_INBOX_SYNC_CRON as string,
    travelAutomation: value.TRAVEL_AUTOMATION_CRON as string,
    enabled: value.CRON_ENABLED as boolean,
  },
  maya: {
    enabled: value.MAYA_ENABLED as boolean,
    externalWritesEnabled: value.MAYA_EXTERNAL_WRITES_ENABLED as boolean,
    model: value.MAYA_BRAIN_MODEL as string,
    toolAllowlist: (value.MAYA_TOOL_ALLOWLIST as string)
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  },
  travelProviders: {
    flightStatus: {
      configured: Boolean(value.AERODATABOX_API_KEY),
      host: value.AERODATABOX_API_HOST as string,
    },
    whatsapp: {
      configured: Boolean(value.META_WHATSAPP_TOKEN && value.META_WHATSAPP_PHONE_NUMBER_ID),
    },
    travelRules: {
      provider: value.TRAVEL_RULES_PROVIDER as 'timatic' | 'official_sources' | 'disabled',
      configured:
        value.TRAVEL_RULES_PROVIDER === 'official_sources' || Boolean(value.TRAVEL_RULES_API_KEY),
    },
    insurance: {
      provider: value.INSURANCE_PROVIDER as string,
      configured: Boolean(value.INSURANCE_PROVIDER && value.INSURANCE_API_KEY),
    },
    inventory: {
      provider: value.INVENTORY_PROVIDER as string,
      configured: Boolean(
        value.INVENTORY_PROVIDER && value.INVENTORY_API_BASE_URL && value.INVENTORY_API_KEY,
      ),
      baseUrl: value.INVENTORY_API_BASE_URL as string,
      timeoutMs: value.INVENTORY_TIMEOUT_MS as number,
    },
    payments: {
      provider: 'razorpay',
      configured: Boolean(value.RAZORPAY_KEY_ID && value.RAZORPAY_KEY_SECRET),
    },
    accounting: {
      provider: 'zoho_books',
      configured: Boolean(
        value.ZOHO_BOOKS_ENABLED &&
        value.ZOHO_ORGANIZATION_ID &&
        value.ZOHO_CLIENT_ID &&
        value.ZOHO_REFRESH_TOKEN,
      ),
    },
  },
  legacySessionEnabled: value.LEGACY_SESSION_ENABLED as boolean,
  legacyRoutingEnabled: value.LEGACY_ROUTING_ENABLED as boolean,
  publicRegistrationEnabled: value.PUBLIC_REGISTRATION_ENABLED as boolean,
  launchEvidence: {
    legalApprovalDate: value.LEGAL_APPROVAL_DATE as string,
    penTestApprovedAt: value.PEN_TEST_APPROVED_AT as string,
    backupRestoreVerifiedAt: value.BACKUP_RESTORE_VERIFIED_AT as string,
    statusPageUrl: value.STATUS_PAGE_URL as string,
    incidentContact: value.INCIDENT_CONTACT as string,
  },
  mysqlTools: { dump: value.MYSQLDUMP_BINARY as string, client: value.MYSQL_BINARY as string },
} as const;
