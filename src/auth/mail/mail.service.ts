import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class MailService {
  private resend: Resend;
  private fromName = 'Peripheral System';
  private fromEmail: string;

  constructor(private configService: ConfigService) {
    this.resend = new Resend(this.configService.get<string>('RESEND_API_KEY'));
    this.fromEmail =
      this.configService.get<string>('MAIL_FROM') ?? 'onboarding@resend.dev';
  }

  // SHARED WRAPPER
  private wrapTemplate(content: string, accentColor = '#534AB7'): string {
    return `<!DOCTYPE html><html><body style="margin:0; padding:40px; background:#f4f4f7; font-family:sans-serif;">
      <table width="560" style="background:#ffffff; border-radius:12px; border:1px solid #e4e4e7; margin:auto;">
        <tr><td style="height:3px; background:${accentColor};"></td></tr>
        <tr><td style="padding:28px 36px 0;"><strong>Peripheral System</strong></td></tr>
        ${content}
        <tr><td style="padding:20px 36px; text-align:center; color:#a1a1aa; font-size:12px;">© 2026 Peripheral System.</td></tr>
      </table>
    </body></html>`;
  }

  // METHODS
  async sendVerificationEmail(email: string, token: string) {
    const url = `http://localhost:3000/auth/verify?token=${token}`;
    const content = `<tr><td style="padding:32px 36px;"><h1>Verify Email</h1><p>Click below to activate:</p><a href="${url}" style="background:#534AB7; color:#fff; padding:10px 20px; border-radius:8px; text-decoration:none;">Verify Now</a></td></tr>`;
    await this.resend.emails.send({
      from: `${this.fromName} <${this.fromEmail}>`,
      to: email,
      subject: 'Verify Email',
      html: this.wrapTemplate(content),
    });
  }

  async sendDeviceDeploymentEmail(
    email: string,
    deviceName: string,
    serial: string,
  ) {
    const content = `<tr><td style="padding:32px 36px;"><h1>Device Deployed</h1><p><strong>${deviceName}</strong> (Serial: ${serial}) has been assigned to you.</p></td></tr>`;
    await this.resend.emails.send({
      from: `${this.fromName} <${this.fromEmail}>`,
      to: email,
      subject: 'Device Deployed',
      html: this.wrapTemplate(content, '#16a34a'),
    });
  }
}
