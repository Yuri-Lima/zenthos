import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { verifySignature } from '@zenthos/adapter-github';
import { applyWebhookCommand } from '@zenthos/application';
import { commandFromGitHubEvent } from '@zenthos/domain';
import { API_PORTS, type ApiPorts } from '../ports.js';

export type GitHubDelivery = {
  event: string;
  deliveryId: string;
  signature: string;
  /** The app id GitHub names in X-GitHub-Hook-Installation-Target-ID; selects the connection whose secret signs the body. */
  appId: string;
  rawBody: string;
};

/** Verifies a delivery with the secret of the connection it belongs to, then hands the command to the use case. */
@Injectable()
export class WebhooksService {
  constructor(@Inject(API_PORTS) private readonly ports: ApiPorts) {}

  async handleGitHub({ event, deliveryId, signature, appId, rawBody }: GitHubDelivery): Promise<{ deliveryId: string; result: string }> {
    const connection = await this.ports.connections.findByAppId(appId);
    if (!connection?.app) throw new UnauthorizedException(`no GitHub App connection for app ${appId}`);
    if (!verifySignature(connection.app.webhookSecret, rawBody, signature)) throw new UnauthorizedException('signature does not match');
    const command = commandFromGitHubEvent(event, JSON.parse(rawBody));
    return { deliveryId, result: await applyWebhookCommand(this.ports, appId, command) };
  }
}
