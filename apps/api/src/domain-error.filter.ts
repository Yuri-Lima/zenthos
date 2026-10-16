import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import { DomainError, type ErrorCode } from '@zenthos/domain';
import type { Response } from 'express';

/** Which domain errors are the caller's fault, and which name something that is not there. One mapping for every endpoint. */
const STATUS: Partial<Record<ErrorCode, HttpStatus>> = {
  connection_not_found: HttpStatus.NOT_FOUND,
  unknown_repository: HttpStatus.NOT_FOUND,
  ticket_not_found: HttpStatus.NOT_FOUND,
};

@Catch(DomainError)
export class DomainErrorFilter implements ExceptionFilter {
  catch(error: DomainError, host: ArgumentsHost) {
    const status = STATUS[error.code] ?? HttpStatus.BAD_REQUEST;
    host.switchToHttp().getResponse<Response>().status(status).json({ statusCode: status, code: error.code, message: error.message, context: error.context });
  }
}
