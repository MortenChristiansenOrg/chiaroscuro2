import type { z } from "zod";

export interface CommandContract<P extends z.ZodType = z.ZodType, R extends z.ZodType = z.ZodType> {
  payload: P;
  response: R;
  description: string;
  examples: unknown[];
  sideEffects: string[];
}

export function defineCommand<P extends z.ZodType, R extends z.ZodType>(
  payload: P,
  response: R,
  documentation: { description: string; examples: z.input<P>[]; sideEffects: string[] },
): CommandContract<P, R> {
  return {
    ...documentation,
    payload: payload.meta({
      description: documentation.description,
      examples: documentation.examples,
    }),
    response,
  };
}

export type CommandTypes<T extends Record<string, CommandContract>> = {
  [K in keyof T]: { payload: z.output<T[K]["payload"]>; response: z.output<T[K]["response"]> };
};
