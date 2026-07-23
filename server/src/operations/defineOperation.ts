import type { ZodTypeAny } from 'zod';

export type OperationMethod = 'GET' | 'POST';
export type OperationHandler = ((options?: { data?: unknown }) => Promise<unknown>) & {
  readonly operationMethod: OperationMethod;
};

type Validator = ZodTypeAny | ((data: unknown) => unknown);

export function defineOperation({ method }: { method: OperationMethod }) {
  let validator: Validator | undefined;
  const builder = {
    validator(schema: Validator) {
      validator = schema;
      return builder;
    },
    inputValidator(schema: Validator) {
      validator = schema;
      return builder;
    },
    handler(handler: (context: { data: any }) => unknown | Promise<unknown>): OperationHandler {
      const operation = async (options: { data?: unknown } = {}) => {
        const data = validator
          ? typeof validator === 'function'
            ? validator(options.data)
            : validator.parse(options.data)
          : options.data;
        return handler({ data });
      };
      Object.defineProperty(operation, 'operationMethod', { value: method, enumerable: true });
      return operation as OperationHandler;
    },
  };
  return builder;
}
