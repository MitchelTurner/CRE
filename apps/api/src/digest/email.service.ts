import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import nodemailer from 'nodemailer';

export interface SendEmailInput {
  to: string[];
  subject: string;
  html: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend | null;
  private readonly from: string;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('resendApiKey') ?? '';
    this.resend = apiKey ? new Resend(apiKey) : null;
    this.from = this.config.get<string>('digestFrom') ?? 'leads@example.com';
  }

  async send(input: SendEmailInput): Promise<{ id: string; provider: string }> {
    if (input.to.length === 0) {
      throw new Error('No DIGEST_RECIPIENTS configured');
    }

    if (this.resend) {
      const result = await this.resend.emails.send({
        from: this.from,
        to: input.to,
        subject: input.subject,
        html: input.html,
      });
      if (result.error) {
        throw new Error(`Resend error: ${result.error.message}`);
      }
      return { id: result.data?.id ?? 'resend', provider: 'resend' };
    }

    // SMTP fallback via Nodemailer (optional env)
    const smtpUrl = process.env.SMTP_URL;
    if (smtpUrl) {
      const transport = nodemailer.createTransport(smtpUrl);
      const info = await transport.sendMail({
        from: this.from,
        to: input.to.join(', '),
        subject: input.subject,
        html: input.html,
      });
      return { id: info.messageId, provider: 'smtp' };
    }

    this.logger.warn('No RESEND_API_KEY or SMTP_URL — logging email instead of sending');
    this.logger.log(`EMAIL subject=${input.subject} to=${input.to.join(',')}`);
    return { id: `dry-run-${Date.now()}`, provider: 'dry-run' };
  }
}