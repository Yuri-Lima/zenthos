import { BadRequestException } from '@nestjs/common';
import { toJSONSchema, type z } from 'zod';

/** zod is the one definition of a request body: it validates, and its JSON schema documents (ADR 003). */
export function parseBody<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body);
  if (!result.success) throw new BadRequestException({ message: 'invalid body', issues: result.error.issues });
  return result.data;
}

/** The body schema as @nestjs/swagger wants it: zod's JSON schema without the `$schema` marker. */
export function jsonSchema(schema: z.ZodType): Record<string, unknown> {
  const json = toJSONSchema(schema) as Record<string, unknown>;
  delete json['$schema'];
  return json;
}
