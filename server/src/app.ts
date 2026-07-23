import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import path from 'node:path';
import helmet from 'helmet';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env.js';
import { openapi } from './docs/openapi.js';
import { AppError } from './errors/AppError.js';
import { jsonReplacer } from './helpers/json.js';
import { httpLogStream } from './logger/index.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { apiRateLimit } from './middlewares/rateLimit.js';
import { requestContext } from './middlewares/requestContext.js';
import { apiRoutes } from './routes/index.js';
import { compatibilityController } from './controllers/compatibilityController.js';
import { sitemapController } from './controllers/sitemapController.js';
import { handlePublicApiRequest } from './compatibility/publicApi.js';
import { handleInternalSecurityRequest } from './security/securityService.js';
import { isCorsOriginAllowed } from './utils/corsOrigin.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', env.trustProxy);
  app.set('json replacer', jsonReplacer);
  app.disable('x-powered-by');
  app.use(requestContext);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );
  app.use(
    cors({
      credentials: true,
      origin(origin, callback) {
        if (isCorsOriginAllowed(origin)) callback(null, true);
        else callback(new AppError(403, 'Origin is not allowed', 'CORS_REJECTED'));
      },
    }),
  );
  app.use(compression());
  app.use(
    express.json({
      limit: '40mb',
      verify(request, _response, buffer) {
        (request as typeof request & { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
      },
    }),
  );
  app.use(express.urlencoded({ extended: false, limit: '10mb' }));
  app.use(cookieParser());
  app.use(
    morgan(':method :url :status :response-time ms request-id=:req[x-request-id]', {
      stream: httpLogStream,
    }),
  );
  app.use(env.apiPrefix, apiRateLimit, apiRoutes);
  app.use('/api/public', apiRateLimit, compatibilityController(handlePublicApiRequest));
  app.use(
    '/api/internal/security',
    apiRateLimit,
    compatibilityController(handleInternalSecurityRequest),
  );
  const configuredUploads = path.resolve(process.cwd(), env.uploadDirectory);
  const legacyUploads = path.resolve(process.cwd(), '..', 'uploads');
  app.use('/uploads', express.static(configuredUploads, { immutable: true, maxAge: '1y' }));
  if (legacyUploads !== configuredUploads) {
    app.use('/uploads', express.static(legacyUploads, { immutable: true, maxAge: '1y' }));
  }
  app.get('/sitemap.xml', sitemapController);
  app.use(
    '/api/docs',
    swaggerUi.serve,
    swaggerUi.setup(openapi, { customSiteTitle: 'MooNsConfig API' }),
  );
  app.get('/api/openapi.json', (_request, response) => response.json(openapi));
  app.use((request, _response, next) =>
    next(new AppError(404, `Route not found: ${request.method} ${request.path}`, 'NOT_FOUND')),
  );
  app.use(errorHandler);
  return app;
}
