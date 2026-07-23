import type { NextFunction, Request, Response } from 'express';
import { sendSuccess } from '../helpers/response.js';
import { userService } from '../services/userService.js';

export const userController = {
  list: async (_request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(response, await userService.list());
    } catch (error) {
      next(error);
    }
  },
  create: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(response, await userService.create(request.body), 201);
    } catch (error) {
      next(error);
    }
  },
  update: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(response, await userService.update(Number(request.params.id), request.body));
    } catch (error) {
      next(error);
    }
  },
  remove: async (request: Request, response: Response, next: NextFunction) => {
    try {
      await userService.remove(Number(request.params.id), request.auth!.userId);
      sendSuccess(response, null);
    } catch (error) {
      next(error);
    }
  },
};
