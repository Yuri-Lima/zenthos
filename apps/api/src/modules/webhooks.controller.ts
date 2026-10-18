import { Controller, Headers, HttpCode, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../auth/session.guard.js';
import { WebhooksService } from './webhooks.service.js';

@ApiTags('webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Public()
  @Post('github')
  @HttpCode(202)
  @ApiOperation({ summary: 'GitHub App webhook: labels start and decide runs, installation events update the connection' })
  github(
    @Req() request: RawBodyRequest<Request>,
    @Headers('x-github-event') event: string,
    @Headers('x-github-delivery') deliveryId: string,
    @Headers('x-hub-signature-256') signature: string,
    @Headers('x-github-hook-installation-target-id') appId: string,
  ) {
    return this.webhooks.handleGitHub({ event, deliveryId, signature, appId, rawBody: request.rawBody?.toString('utf8') ?? '' });
  }
}
