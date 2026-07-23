import { Router } from 'express';
import { upload } from '../config/upload.js';
import { uploadController } from '../controllers/uploadController.js';
import { authenticate } from '../middlewares/authenticate.js';
import { validate } from '../middlewares/validate.js';
import { secureUploadSchema, uploadObjectIdSchema } from '../validators/platformValidator.js';

export const uploadRoutes = Router();
uploadRoutes.use(authenticate);
uploadRoutes.post('/presign', validate(secureUploadSchema), uploadController.presign);
uploadRoutes.get('/objects/:id', validate(uploadObjectIdSchema), uploadController.secureDownload);
uploadRoutes.post('/', upload.single('file'), uploadController.create);
uploadRoutes.get('/:id', uploadController.download);
