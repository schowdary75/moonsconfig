import { Router } from 'express';
import { userController } from '../controllers/userController.js';
import { authenticate, authorize } from '../middlewares/authenticate.js';
import { validate } from '../middlewares/validate.js';
import { createUserSchema, updateUserSchema, userIdSchema } from '../validators/userValidator.js';
import { AppError } from '../errors/AppError.js';

export const userRoutes = Router();
userRoutes.use(authenticate, authorize('admin'));
userRoutes.get('/', userController.list);
userRoutes.post(
  '/',
  (request, _response, next) =>
    request.auth?.platformUserId
      ? next(
          new AppError(
            409,
            'Use a company invitation to add commercial staff',
            'INVITATION_REQUIRED',
          ),
        )
      : next(),
  validate(createUserSchema),
  userController.create,
);
userRoutes.patch('/:id', validate(updateUserSchema), userController.update);
userRoutes.delete('/:id', validate(userIdSchema), userController.remove);
