

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private transporter: nodemailer.Transporter;
  private fromName = 'Periphex';
  private fromEmail: string;
  private frontendUrl: string;

  constructor(private configService: ConfigService) {
    this.fromEmail = this.configService.get<string>('MAIL_FROM') ?? '';
    this.frontendUrl = this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';

    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('MAIL_HOST') ?? 'smtp.gmail.com',
      port: Number(this.configService.get<string>('MAIL_PORT') ?? 587),
      secure: false,
      auth: {
        user: this.configService.get<string>('MAIL_USER'),
        pass: this.configService.get<string>('MAIL_PASS'),
      },
    });
  }

  private wrapTemplate(content: string, accentColor = '#1d4ed8'): string {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0"/></head>
    <body style="margin: 0; padding: 0; background-color: #f4f4f7; font-family: sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="padding: 40px 16px;">
        <tr><td align="center">
            <table width="560" style="background: #ffffff; border-radius: 12px; border: 1px solid #e4e4e7;">
              <tr><td style="height: 3px; background: ${accentColor};"></td></tr>
              <tr><td style="padding: 28px 36px 0 36px;"><span style="background: ${accentColor}; color: #ffffff; font-size: 11px; padding: 5px 12px; border-radius: 6px;">Periphex</span></td></tr>
              ${content}
              <tr><td style="padding: 0 36px 32px 36px;"><p style="text-align: center; color: #a1a1aa; font-size: 12px;">© 2026 Periphex. All rights reserved.</p></td></tr>
            </table>
        </td></tr>
      </table>
    </body>
    </html>
    `;
  }

  private async sendMail(to: string, subject: string, html: string) {
    try {
      await this.transporter.sendMail({ from: `${this.fromName} <${this.fromEmail}>`, to, subject, html });
    } catch (error) {
      console.error(`Failed to send email to ${to}:`, error);
    }
  }

  async sendVerificationEmail(email: string, token: string) {
    const url = `${this.frontendUrl}/verify?token=${token}`;
    const content = `
      <tr><td style="padding: 32px 36px 16px 36px;">
          <h1 style="font-size: 22px; font-weight: 700;">Verify your email</h1>
          <p style="color: #52525b; font-size: 15px;">Welcome! Click below to activate your account.</p>
          <a href="${url}" style="background: #1d4ed8; color: #fff; padding: 13px 28px; border-radius: 8px; text-decoration: none; font-weight: 600;">Verify email →</a>
          <p style="margin-top: 20px; font-family: monospace; font-size: 12px; color: #1d4ed8;">${url}</p>
      </td></tr>
    `;
    await this.sendMail(email, 'Verify your email — Periphex', this.wrapTemplate(content, '#1d4ed8'));
  }

  async sendResetPasswordEmail(email: string, token: string) {
    const url = `${this.frontendUrl}/reset-password?token=${token}`;
    const content = `
      <tr><td style="padding: 32px 36px 16px 36px;">
          <h1 style="font-size: 22px; font-weight: 700;">Reset your password</h1>
          <p style="color: #52525b; font-size: 15px;">We received a request to reset your password.</p>
          <a href="${url}" style="background: #16a34a; color: #fff; padding: 13px 28px; border-radius: 8px; text-decoration: none; font-weight: 600;">Reset password →</a>
          <p style="margin-top: 20px; font-family: monospace; font-size: 12px; color: #16a34a;">${url}</p>
      </td></tr>
    `;
    await this.sendMail(email, 'Reset your password — Periphex', this.wrapTemplate(content, '#16a34a'));
  }

  async sendSecurityAlertEmail(email: string, action: string) {
    const content = `
      <tr><td style="padding: 32px 36px 16px 36px;">
          <h1 style="font-size: 22px; color: #dc2626;">Security Alert</h1>
          <p>A security change was made: Password was ${action}.</p>
      </td></tr>
    `;
    await this.sendMail(email, 'Security Alert', this.wrapTemplate(content, '#dc2626'));
  }
}