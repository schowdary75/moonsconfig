import { env } from '../config/env.js';
import { operationRepository } from '../repositories/operationRepository.js';
import { compatibilityPaths } from './generatedCompatibilityPaths.js';

const json = (schema: object) => ({ 'application/json': { schema } });
const response = (description: string, schema?: object) => ({
  description,
  ...(schema ? { content: json(schema) } : {}),
});
const secured = { security: [{ bearerAuth: [] }] };

const schemas = {
  UserRole: {
    type: 'string',
    enum: [
      'admin',
      'editor',
      'approver',
      'manager',
      'sales',
      'support',
      'finance',
      'marketing',
      'operations',
      'viewer',
    ],
  },
  User: {
    type: 'object',
    required: ['id', 'email', 'role', 'roles'],
    properties: {
      id: { type: 'integer' },
      email: { type: 'string', format: 'email' },
      name: { type: ['string', 'null'] },
      mobile: { type: ['string', 'null'] },
      role: { $ref: '#/components/schemas/UserRole' },
      roles: { type: 'array', items: { $ref: '#/components/schemas/UserRole' } },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
    },
  },
  UserInput: {
    type: 'object',
    required: ['email', 'password', 'name', 'role'],
    properties: {
      email: { type: 'string', format: 'email' },
      password: { type: 'string', minLength: 12, writeOnly: true },
      name: { type: 'string', maxLength: 255 },
      mobile: { type: 'string', maxLength: 50 },
      role: { $ref: '#/components/schemas/UserRole' },
    },
  },
  Failure: {
    type: 'object',
    required: ['success', 'message'],
    properties: {
      success: { type: 'boolean', enum: [false] },
      message: { type: 'string' },
      requestId: { type: 'string', format: 'uuid' },
      errors: {
        type: 'array',
        items: {
          type: 'object',
          properties: { field: { type: 'string' }, message: { type: 'string' } },
        },
      },
    },
  },
  Session: {
    type: 'object',
    properties: {
      success: { type: 'boolean', enum: [true] },
      data: {
        type: 'object',
        properties: {
          accessToken: { type: 'string', writeOnly: true },
          expiresIn: { type: 'integer', example: 900 },
          user: { $ref: '#/components/schemas/User' },
        },
      },
    },
  },
  Customer: {
    type: 'object',
    required: ['id', 'name', 'email'],
    properties: {
      id: { type: 'integer' },
      name: { type: 'string' },
      email: { type: 'string', format: 'email' },
      phone: { type: ['string', 'null'] },
      points_balance: { type: 'integer' },
      oauth_provider: { type: ['string', 'null'] },
      avatar_url: { type: ['string', 'null'] },
    },
  },
  CustomerSession: {
    type: 'object',
    properties: {
      success: { type: 'boolean', enum: [true] },
      data: {
        type: 'object',
        properties: {
          accessToken: { type: 'string', writeOnly: true },
          expiresIn: { type: 'integer', example: 900 },
          user: { $ref: '#/components/schemas/Customer' },
        },
      },
    },
  },
};

export const openapi = {
  openapi: '3.1.0',
  info: {
    title: 'MooNsConfig Enterprise API',
    version: '1.0.0',
    description: 'Versioned API running alongside the legacy MooNsConfig runtime.',
  },
  servers: [{ url: env.apiPrefix }],
  tags: [
    { name: 'Health' },
    { name: 'Authentication' },
    { name: 'Customer Authentication' },
    { name: 'Users' },
    { name: 'Uploads' },
    { name: 'Platform' },
    { name: 'Billing' },
    { name: 'Screen Exports' },
  ],
  paths: {
    ...Object.fromEntries(
      compatibilityPaths.map((path) => [
        path,
        {
          get: {
            servers: [{ url: '/' }],
            tags: ['Compatibility'],
            summary: `Compatibility endpoint ${path}`,
            responses: { '200': response('Legacy-compatible response') },
          },
          post: {
            servers: [{ url: '/' }],
            tags: ['Compatibility'],
            summary: `Compatibility endpoint ${path}`,
            requestBody: {
              required: false,
              content: {
                'application/json': { schema: { type: 'object', additionalProperties: true } },
              },
            },
            responses: { '200': response('Legacy-compatible response') },
          },
        },
      ]),
    ),
    ...Object.fromEntries(
      operationRepository.list().map((operation) => [
        `/operations/${operation.name}`,
        {
          [operation.method.toLowerCase()]: {
            tags: [`Legacy parity: ${operation.domain}`],
            summary: `Execute ${operation.name}`,
            operationId: operation.name,
            requestBody: {
              required: false,
              content: {
                'application/json': {
                  schema: { type: 'object', additionalProperties: true },
                },
              },
            },
            responses: {
              '200': response('Operation completed'),
              '400': { $ref: '#/components/responses/ValidationError' },
              '401': { $ref: '#/components/responses/Unauthorized' },
            },
          },
        },
      ]),
    ),
    '/platform/registrations': {
      post: {
        tags: ['Platform'],
        summary: 'Register and verify a new company owner',
        requestBody: {
          required: true,
          content: json({
            type: 'object',
            required: [
              'ownerName',
              'email',
              'mobile',
              'password',
              'companyName',
              'slug',
              'billingAddress',
              'acceptedTerms',
              'acceptedPrivacy',
              'acceptedDpa',
            ],
          }),
        },
        responses: {
          '202': response('Registration pending email verification'),
          '409': response('Email or company URL already used'),
        },
      },
    },
    '/platform/email-verifications': {
      post: {
        tags: ['Platform'],
        summary: 'Verify owner email and enqueue isolated database provisioning',
        responses: { '200': response('Provisioning enqueued') },
      },
    },
    '/platform/provisioning/{jobId}': {
      get: {
        tags: ['Platform'],
        summary: 'Read idempotent company provisioning status',
        parameters: [
          { in: 'path', name: 'jobId', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: { '200': response('Provisioning status') },
      },
    },
    '/public/tenant-config': {
      get: {
        tags: ['Platform'],
        summary: 'Resolve public company configuration from a validated hostname',
        responses: {
          '200': response('Public tenant configuration'),
          '404': response('Unknown domain'),
        },
      },
    },
    '/screen-exports': {
      post: {
        ...secured,
        tags: ['Screen Exports'],
        summary: 'Export the current authenticated CRM screen as a full-stack source capsule',
        requestBody: {
          required: true,
          content: json({
            type: 'object',
            required: ['pathname', 'accessCode'],
            properties: {
              pathname: { type: 'string', example: '/packages/42' },
              accessCode: {
                type: 'string',
                pattern: '^\\d{6}$',
                minLength: 6,
                maxLength: 6,
                writeOnly: true,
              },
            },
          }),
        },
        responses: {
          '200': {
            description: 'ZIP archive rooted at the stable screen name',
            headers: {
              'Content-Disposition': {
                schema: { type: 'string' },
                description: 'Attachment filename for the exported screen',
              },
            },
            content: {
              'application/zip': { schema: { type: 'string', format: 'binary' } },
            },
          },
          '400': { $ref: '#/components/responses/ValidationError' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': response('Administrator role and the correct export code are required'),
          '404': response('The pathname is not an authenticated CRM screen'),
          '413': response('The source capsule exceeds the safe export limit'),
          '429': response('Too many failed export-code attempts'),
          '503': response('Export source or access configuration is unavailable'),
        },
      },
    },
    '/tenants/invitations': {
      post: {
        ...secured,
        tags: ['Platform'],
        summary: 'Invite staff subject to purchased seat quota',
        responses: {
          '201': response('Invitation created'),
          '409': response('Seat quota or duplicate invitation'),
        },
      },
    },
    '/platform/invitations/accept': {
      post: {
        tags: ['Platform'],
        summary: 'Accept a company invitation',
        responses: { '200': response('Membership created') },
      },
    },
    '/billing/plans': {
      get: {
        tags: ['Billing'],
        summary: 'List public plan prices, quotas and entitlements',
        responses: { '200': response('Commercial plans') },
      },
    },
    '/billing/current': {
      get: {
        ...secured,
        tags: ['Billing'],
        summary: 'Read company trial and subscription ledger',
        responses: { '200': response('Current billing state') },
      },
    },
    '/billing/checkout': {
      post: {
        ...secured,
        tags: ['Billing'],
        summary: 'Create Razorpay hosted Starter or Business checkout',
        responses: { '201': response('Hosted checkout created') },
      },
    },
    '/billing/change': {
      post: {
        ...secured,
        tags: ['Billing'],
        summary: 'Upgrade now or schedule downgrade for renewal',
        responses: { '200': response('Plan change requested') },
      },
    },
    '/billing/cancel': {
      post: {
        ...secured,
        tags: ['Billing'],
        summary: 'Cancel an active subscription',
        responses: { '200': response('Cancellation accepted') },
      },
    },
    '/billing/webhooks/razorpay': {
      post: {
        tags: ['Billing'],
        summary: 'Receive signed idempotent Razorpay subscription events',
        responses: { '200': response('Webhook processed'), '401': response('Invalid signature') },
      },
    },
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Check API dependencies',
        responses: {
          '200': response('Healthy'),
          '503': response('A required dependency is unavailable'),
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Authentication'],
        summary: 'Authenticate a staff user',
        requestBody: {
          required: true,
          content: json({
            type: 'object',
            required: ['email', 'password'],
            properties: {
              email: { type: 'string', format: 'email', example: 'owner@example.com' },
              password: {
                type: 'string',
                format: 'password',
                example: 'correct-horse-battery-staple',
              },
            },
          }),
        },
        responses: {
          '200': response('Authenticated session', { $ref: '#/components/schemas/Session' }),
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/auth/refresh': {
      post: {
        tags: ['Authentication'],
        summary: 'Rotate the refresh token',
        responses: {
          '200': response('Rotated session', { $ref: '#/components/schemas/Session' }),
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/auth/logout': {
      post: {
        tags: ['Authentication'],
        summary: 'Revoke the refresh token',
        responses: { '200': response('Logged out') },
      },
    },
    '/auth/me': {
      get: {
        ...secured,
        tags: ['Authentication'],
        summary: 'Get the authenticated user',
        responses: {
          '200': response('Current user'),
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/auth/legacy/exchange': {
      post: {
        tags: ['Authentication'],
        summary: 'Exchange a legacy crm_session token',
        requestBody: {
          required: true,
          content: json({
            type: 'object',
            required: ['sessionToken'],
            properties: { sessionToken: { type: 'string', writeOnly: true } },
          }),
        },
        responses: {
          '200': response('New session'),
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/customer-auth/register': {
      post: {
        tags: ['Customer Authentication'],
        summary: 'Register a customer and start a token family',
        requestBody: {
          required: true,
          content: json({
            type: 'object',
            required: ['name', 'email', 'password'],
            properties: {
              name: { type: 'string', maxLength: 255 },
              email: { type: 'string', format: 'email' },
              password: { type: 'string', minLength: 8, writeOnly: true },
            },
          }),
        },
        responses: {
          '201': response('Customer session', {
            $ref: '#/components/schemas/CustomerSession',
          }),
          '409': response('Email already registered'),
        },
      },
    },
    '/customer-auth/login': {
      post: {
        tags: ['Customer Authentication'],
        summary: 'Authenticate a customer',
        responses: {
          '200': response('Customer session', {
            $ref: '#/components/schemas/CustomerSession',
          }),
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/customer-auth/google': {
      post: {
        tags: ['Customer Authentication'],
        summary: 'Authenticate a customer with a verified Google access token',
        responses: { '200': response('Customer session') },
      },
    },
    '/customer-auth/otp/request': {
      post: {
        tags: ['Customer Authentication'],
        summary: 'Request a five-minute customer registration code',
        responses: { '200': response('Verification code dispatched') },
      },
    },
    '/customer-auth/otp/verify': {
      post: {
        tags: ['Customer Authentication'],
        summary: 'Verify the code and register a customer',
        responses: { '201': response('Customer session') },
      },
    },
    '/customer-auth/refresh': {
      post: {
        tags: ['Customer Authentication'],
        summary: 'Rotate the customer refresh token',
        responses: { '200': response('Rotated customer session') },
      },
    },
    '/customer-auth/logout': {
      post: {
        tags: ['Customer Authentication'],
        summary: 'Revoke the current customer refresh token',
        responses: { '200': response('Logged out') },
      },
    },
    '/customer-auth/logout-all': {
      post: {
        ...secured,
        tags: ['Customer Authentication'],
        summary: 'Revoke every customer token family',
        responses: { '200': response('All sessions revoked') },
      },
    },
    '/customer-auth/me': {
      get: {
        ...secured,
        tags: ['Customer Authentication'],
        summary: 'Get the authenticated customer',
        responses: { '200': response('Current customer') },
      },
    },
    '/customer-auth/legacy/exchange': {
      post: {
        tags: ['Customer Authentication'],
        summary: 'Exchange a legacy customer auth_sessions token',
        responses: { '200': response('Customer session') },
      },
    },
    '/customer/devices': {
      post: {
        ...secured,
        tags: ['Customer'],
        summary: 'Register or refresh a customer mobile push token',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['token', 'platform'],
                properties: {
                  token: { type: 'string', minLength: 16, maxLength: 512 },
                  platform: { type: 'string', enum: ['android', 'ios'] },
                  appVersion: { type: 'string', maxLength: 40 },
                },
              },
            },
          },
        },
        responses: { '200': response('Device registered') },
      },
    },
    '/customer/devices/{token}': {
      delete: {
        ...secured,
        tags: ['Customer'],
        summary: 'Remove a customer mobile push token',
        parameters: [
          {
            in: 'path',
            name: 'token',
            required: true,
            schema: { type: 'string', minLength: 16, maxLength: 512 },
          },
        ],
        responses: { '200': response('Device removed') },
      },
    },
    '/customer/wishlist': {
      get: {
        ...secured,
        tags: ['Customer'],
        summary: 'List the current customer wishlist',
        responses: { '200': response('Wishlist') },
      },
      post: {
        ...secured,
        tags: ['Customer'],
        summary: 'Add or update one wishlist item',
        responses: { '200': response('Wishlist item') },
      },
      put: {
        ...secured,
        tags: ['Customer'],
        summary: 'Atomically replace the current customer wishlist',
        responses: { '200': response('Wishlist') },
      },
    },
    '/customer/wishlist/{itemType}/{itemId}': {
      delete: {
        ...secured,
        tags: ['Customer'],
        summary: 'Remove one current-customer wishlist item',
        parameters: [
          { name: 'itemType', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'itemId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': response('Removed') },
      },
    },
    '/customer/bookings': {
      get: {
        ...secured,
        tags: ['Customer'],
        summary: 'List bookings owned by the current customer',
        responses: { '200': response('Bookings') },
      },
    },
    '/customer/bookings/{bookingId}/cancel': {
      post: {
        ...secured,
        tags: ['Customer'],
        summary: 'Cancel an owned booking and atomically record its refund',
        parameters: [
          { name: 'bookingId', in: 'path', required: true, schema: { type: 'integer' } },
        ],
        responses: { '200': response('Cancelled'), '404': response('Not found') },
      },
    },
    '/customer/payments': {
      get: {
        ...secured,
        tags: ['Customer'],
        summary: 'List owned payments',
        responses: { '200': response('Payments') },
      },
    },
    '/customer/refunds': {
      get: {
        ...secured,
        tags: ['Customer'],
        summary: 'List owned refunds',
        responses: { '200': response('Refunds') },
      },
    },
    '/customer/escrow': {
      get: {
        ...secured,
        tags: ['Customer'],
        summary: 'List owned escrow records',
        responses: { '200': response('Escrow') },
      },
    },
    '/customer/invoices': {
      get: {
        ...secured,
        tags: ['Customer'],
        summary: 'List owned invoices',
        responses: { '200': response('Invoices') },
      },
    },
    '/customer/invoices/{bookingReference}': {
      get: {
        ...secured,
        tags: ['Customer'],
        summary: 'Get invoice totals for an owned booking reference',
        parameters: [
          { name: 'bookingReference', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': response('Invoice'), '404': response('Not found') },
      },
    },
    '/platform-ops/auth/login': {
      post: {
        tags: ['Business Operations'],
        summary: 'Create an MFA-verified operator session with a 30-minute idle and 8-hour limit',
        responses: { '200': response('Operator session'), '401': response('Invalid credentials') },
      },
    },
    '/platform-ops/auth/step-up': {
      post: {
        tags: ['Business Operations'],
        summary: 'Refresh operator MFA assurance for protected actions for ten minutes',
        responses: {
          '200': response('MFA assurance refreshed'),
          '401': response('Invalid or replayed MFA code'),
        },
      },
    },
    '/platform-ops/auth/logout': {
      post: {
        tags: ['Business Operations'],
        summary: 'Revoke the current platform operator session',
        responses: { '200': response('Operator session revoked') },
      },
    },
    '/platform-ops/overview': {
      get: {
        ...secured,
        tags: ['Business Operations'],
        summary: 'Get cross-workspace commercial and operational metrics',
        responses: { '200': response('Business overview') },
      },
    },
    '/platform-ops/workspaces': {
      get: {
        ...secured,
        tags: ['Business Operations'],
        summary: 'List registered workspaces with redacted operational metadata',
        responses: { '200': response('Paginated workspaces') },
      },
    },
    '/platform-ops/workspaces/{tenantId}': {
      get: {
        ...secured,
        tags: ['Business Operations'],
        summary: 'Get redacted workspace details',
        parameters: [
          {
            name: 'tenantId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: { '200': response('Workspace details'), '404': response('Not found') },
      },
    },
    '/platform-ops/memberships': {
      get: {
        ...secured,
        tags: ['Business Operations'],
        summary: 'List workspace memberships or invitations',
        responses: { '200': response('Paginated memberships') },
      },
    },
    '/platform-ops/billing/subscriptions': {
      get: {
        ...secured,
        tags: ['Business Operations'],
        summary: 'List subscription ledger records and trusted dues',
        responses: { '200': response('Paginated subscriptions') },
      },
    },
    '/platform-ops/billing/invoices': {
      get: {
        ...secured,
        tags: ['Business Operations'],
        summary: 'List redacted SaaS billing invoices',
        responses: { '200': response('Paginated invoices') },
      },
    },
    '/platform-ops/access-grants': {
      get: {
        ...secured,
        tags: ['Business Operations'],
        summary: 'List owner-approved support access grants',
        responses: { '200': response('Paginated access grants') },
      },
    },
    '/platform-ops/provisioning-jobs': {
      get: {
        ...secured,
        tags: ['Business Operations'],
        summary: 'List workspace provisioning jobs',
        responses: { '200': response('Paginated provisioning jobs') },
      },
    },
    '/platform-ops/lifecycle': {
      get: {
        ...secured,
        tags: ['Business Operations'],
        summary: 'List governed exports and deletion workflows',
        responses: { '200': response('Paginated lifecycle records') },
      },
    },
    '/users': {
      get: {
        ...secured,
        tags: ['Users'],
        summary: 'List staff users',
        responses: { '200': response('Users') },
      },
      post: {
        ...secured,
        tags: ['Users'],
        summary: 'Create a staff user',
        requestBody: { required: true, content: json({ $ref: '#/components/schemas/UserInput' }) },
        responses: {
          '201': response('Created'),
          '400': { $ref: '#/components/responses/ValidationError' },
        },
      },
    },
    '/users/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      patch: {
        ...secured,
        tags: ['Users'],
        summary: 'Update a staff user',
        responses: { '200': response('Updated'), '404': response('Not found') },
      },
      delete: {
        ...secured,
        tags: ['Users'],
        summary: 'Delete a staff user',
        responses: { '200': response('Deleted'), '409': response('Self deletion blocked') },
      },
    },
    '/uploads': {
      post: {
        ...secured,
        tags: ['Uploads'],
        summary: 'Upload an allowlisted file',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['file'],
                properties: { file: { type: 'string', format: 'binary' } },
              },
            },
          },
        },
        responses: { '201': response('Uploaded'), '400': response('Invalid upload') },
      },
    },
    '/uploads/{id}': {
      get: {
        ...secured,
        tags: ['Uploads'],
        summary: 'Download an uploaded file',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': response('File contents'), '404': response('Not found') },
      },
    },
  },
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    schemas,
    responses: {
      Unauthorized: response('Authentication failed', { $ref: '#/components/schemas/Failure' }),
      ValidationError: response('Validation failed', { $ref: '#/components/schemas/Failure' }),
    },
  },
} as const;
