// import { Injectable } from '@nestjs/common';
// import { ConfigService } from '@nestjs/config';
// import * as nodemailer from 'nodemailer';

// @Injectable()
// export class MailService {
//   private transporter: nodemailer.Transporter;
//   private fromName = 'Periphex';
//   private fromEmail: string;

//   constructor(private configService: ConfigService) {
//     this.fromEmail = this.configService.get<string>('MAIL_FROM') ?? '';

//     this.transporter = nodemailer.createTransport({
//       host: this.configService.get<string>('MAIL_HOST') ?? 'smtp.gmail.com',
//       port: Number(this.configService.get<string>('MAIL_PORT') ?? 587),
//       secure: false,
//       auth: {
//         user: this.configService.get<string>('MAIL_USER'),
//         pass: this.configService.get<string>('MAIL_PASS'),
//       },
//     });

//     console.log('MAIL SERVICE READY (Nodemailer)');
//   }

//   // ===============================
//   // SHARED TEMPLATE WRAPPER
//   // ===============================

//   private wrapTemplate(content: string, accentColor = '#1d4ed8'): string {
//     return `
//     <!DOCTYPE html>
//     <html lang="en">
//     <head>
//       <meta charset="UTF-8" />
//       <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
//       <title>Periphex</title>
//     </head>
//     <body style="
//       margin: 0;
//       padding: 0;
//       background-color: #f4f4f7;
//       font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
//     ">
//       <table width="100%" cellpadding="0" cellspacing="0" style="padding: 40px 16px;">
//         <tr>
//           <td align="center">
//             <table width="560" cellpadding="0" cellspacing="0" style="
//               max-width: 560px;
//               width: 100%;
//               background: #ffffff;
//               border-radius: 12px;
//               overflow: hidden;
//               border: 1px solid #e4e4e7;
//             ">
//               <!-- TOP ACCENT -->
//               <tr>
//                 <td style="height: 3px; background: ${accentColor};"></td>
//               </tr>

//               <!-- HEADER -->
//               <tr>
//                 <td style="padding: 28px 36px 0 36px;">
//                   <span style="
//                     background: ${accentColor};
//                     color: #ffffff;
//                     font-size: 11px;
//                     font-weight: 600;
//                     letter-spacing: 1.2px;
//                     text-transform: uppercase;
//                     padding: 5px 12px;
//                     border-radius: 6px;
//                   ">Periphex</span>
//                 </td>
//               </tr>

//               <!-- CONTENT -->
//               ${content}

//               <!-- FOOTER -->
//               <tr>
//                 <td style="padding: 0 36px 32px 36px;">
//                   <table width="100%" cellpadding="0" cellspacing="0">
//                     <tr>
//                       <td style="border-top: 1px solid #e4e4e7; padding-top: 20px;">
//                         <p style="
//                           margin: 0;
//                           color: #a1a1aa;
//                           font-size: 12px;
//                           line-height: 1.6;
//                           text-align: center;
//                         ">
//                           © 2026 Periphex. All rights reserved.<br/>
//                           Peripheral Device Management System
//                         </p>
//                       </td>
//                     </tr>
//                   </table>
//                 </td>
//               </tr>

//             </table>
//           </td>
//         </tr>
//       </table>
//     </body>
//     </html>
//     `;
//   }

//   // ===============================
//   // SEND HELPER
//   // ===============================

//   private async sendMail(to: string, subject: string, html: string) {
//     try {
//       const info = await this.transporter.sendMail({
//         from: `${this.fromName} <${this.fromEmail}>`,
//         to,
//         subject,
//         html,
//       });
//       console.log(`Email sent to ${to}:`, info.messageId);
//     } catch (error) {
//       console.error(`Failed to send email to ${to}:`, error);
//     }
//   }

//   // ===============================
//   // VERIFY EMAIL
//   // ===============================

//   async sendVerificationEmail(email: string, token: string) {
//     const url = `${this.configService.get('BACKEND_URL') ?? 'http://localhost:4000'}/auth/verify?token=${token}`;

//     const content = `
//       <tr>
//         <td style="padding: 32px 36px 16px 36px;">

//           <div style="
//             width: 48px; height: 48px;
//             background: #eff6ff;
//             border-radius: 10px;
//             font-size: 22px;
//             line-height: 48px;
//             text-align: center;
//             margin-bottom: 24px;
//           ">✉️</div>

//           <h1 style="
//             margin: 0 0 10px 0;
//             color: #18181b;
//             font-size: 22px;
//             font-weight: 700;
//             line-height: 1.3;
//           ">Verify your email address</h1>

//           <p style="
//             margin: 0 0 28px 0;
//             color: #52525b;
//             font-size: 15px;
//             line-height: 1.7;
//           ">
//             Welcome to Periphex! Please verify your email address to
//             activate your account and start managing peripheral devices.
//           </p>

//           <table cellpadding="0" cellspacing="0" style="margin-bottom: 28px;">
//             <tr>
//               <td style="background: #1d4ed8; border-radius: 8px;">
//                 <a href="${url}" style="
//                   display: inline-block;
//                   padding: 13px 28px;
//                   color: #ffffff;
//                   font-size: 15px;
//                   font-weight: 600;
//                   text-decoration: none;
//                 ">Verify email address →</a>
//               </td>
//             </tr>
//           </table>

//           <table width="100%" cellpadding="0" cellspacing="0" style="
//             background: #f9f9fb;
//             border-radius: 8px;
//             border: 1px solid #e4e4e7;
//             margin-bottom: 28px;
//           ">
//             <tr>
//               <td style="padding: 14px 16px;">
//                 <p style="margin: 0 0 4px 0; color: #a1a1aa; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">
//                   Or copy this link
//                 </p>
//                 <p style="margin: 0; color: #1d4ed8; font-size: 12px; word-break: break-all; font-family: monospace;">
//                   ${url}
//                 </p>
//               </td>
//             </tr>
//           </table>

//           <p style="margin: 0 0 36px 0; color: #a1a1aa; font-size: 13px; line-height: 1.6;">
//             Didn't create a Periphex account? You can safely ignore this email.
//           </p>

//         </td>
//       </tr>
//     `;

//     await this.sendMail(
//       email,
//       'Verify your email — Periphex',
//       this.wrapTemplate(content, '#1d4ed8'),
//     );
//   }

//   // ===============================
//   // SECURITY ALERT EMAIL
//   // ===============================

//   async sendSecurityAlertEmail(email: string, action: string) {
//     const content = `
//       <tr>
//         <td style="padding: 32px 36px 16px 36px;">

//           <div style="
//             width: 48px; height: 48px;
//             background: #fef2f2;
//             border-radius: 10px;
//             font-size: 22px;
//             line-height: 48px;
//             text-align: center;
//             margin-bottom: 20px;
//           ">🔐</div>

//           <table cellpadding="0" cellspacing="0" style="margin-bottom: 16px;">
//             <tr>
//               <td style="
//                 background: #fef2f2;
//                 border: 1px solid #fecaca;
//                 border-radius: 6px;
//                 padding: 4px 10px;
//               ">
//                 <span style="color: #dc2626; font-size: 11px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase;">
//                   Security Alert
//                 </span>
//               </td>
//             </tr>
//           </table>

//           <h1 style="
//             margin: 0 0 10px 0;
//             color: #18181b;
//             font-size: 22px;
//             font-weight: 700;
//             line-height: 1.3;
//           ">Account activity detected</h1>

//           <p style="
//             margin: 0 0 24px 0;
//             color: #52525b;
//             font-size: 15px;
//             line-height: 1.7;
//           ">
//             A security change was made to your Periphex account. Here's what happened:
//           </p>

//           <table width="100%" cellpadding="0" cellspacing="0" style="
//             background: #f9f9fb;
//             border-radius: 8px;
//             border: 1px solid #e4e4e7;
//             margin-bottom: 20px;
//           ">
//             <tr>
//               <td style="padding: 18px 20px;">
//                 <p style="margin: 0 0 4px 0; color: #a1a1aa; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Action</p>
//                 <p style="margin: 0; color: #18181b; font-size: 15px; font-weight: 600;">Password was ${action}</p>
//               </td>
//             </tr>
//           </table>

//           <table width="100%" cellpadding="0" cellspacing="0" style="
//             background: #fef2f2;
//             border-radius: 8px;
//             border: 1px solid #fecaca;
//             margin-bottom: 36px;
//           ">
//             <tr>
//               <td style="padding: 14px 16px;">
//                 <p style="margin: 0; color: #dc2626; font-size: 13px; line-height: 1.6;">
//                   ⚠️ If this wasn't you, contact your system administrator immediately and secure your Periphex account.
//                 </p>
//               </td>
//             </tr>
//           </table>

//         </td>
//       </tr>
//     `;

//     await this.sendMail(
//       email,
//       'Security Alert: Account Activity — Periphex',
//       this.wrapTemplate(content, '#dc2626'),
//     );
//   }

//   // ===============================
//   // RESET PASSWORD EMAIL
//   // ===============================

//   async sendResetPasswordEmail(email: string, token: string) {
//     const url = `${this.configService.get('BACKEND_URL') ?? 'http://localhost:4000'}/auth/reset-password?token=${token}`;

//     const content = `
//       <tr>
//         <td style="padding: 32px 36px 16px 36px;">

//           <div style="
//             width: 48px; height: 48px;
//             background: #f0fdf4;
//             border-radius: 10px;
//             font-size: 22px;
//             line-height: 48px;
//             text-align: center;
//             margin-bottom: 24px;
//           ">🔑</div>

//           <h1 style="
//             margin: 0 0 10px 0;
//             color: #18181b;
//             font-size: 22px;
//             font-weight: 700;
//             line-height: 1.3;
//           ">Reset your password</h1>

//           <p style="
//             margin: 0 0 28px 0;
//             color: #52525b;
//             font-size: 15px;
//             line-height: 1.7;
//           ">
//             We received a request to reset the password for your Periphex account.
//             Click the button below to set a new password.
//           </p>

//           <table cellpadding="0" cellspacing="0" style="margin-bottom: 28px;">
//             <tr>
//               <td style="background: #16a34a; border-radius: 8px;">
//                 <a href="${url}" style="
//                   display: inline-block;
//                   padding: 13px 28px;
//                   color: #ffffff;
//                   font-size: 15px;
//                   font-weight: 600;
//                   text-decoration: none;
//                 ">Reset password →</a>
//               </td>
//             </tr>
//           </table>

//           <table width="100%" cellpadding="0" cellspacing="0" style="
//             background: #f9f9fb;
//             border-radius: 8px;
//             border: 1px solid #e4e4e7;
//             margin-bottom: 20px;
//           ">
//             <tr>
//               <td style="padding: 14px 16px;">
//                 <p style="margin: 0 0 4px 0; color: #a1a1aa; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">
//                   Or copy this link
//                 </p>
//                 <p style="margin: 0; color: #16a34a; font-size: 12px; word-break: break-all; font-family: monospace;">
//                   ${url}
//                 </p>
//               </td>
//             </tr>
//           </table>

//           <table width="100%" cellpadding="0" cellspacing="0" style="
//             background: #fffbeb;
//             border-radius: 8px;
//             border: 1px solid #fde68a;
//             margin-bottom: 36px;
//           ">
//             <tr>
//               <td style="padding: 14px 16px;">
//                 <p style="margin: 0; color: #92400e; font-size: 13px; line-height: 1.6;">
//                   ⏱ This link expires in 1 hour. If you didn't request a password reset, you can safely ignore this email.
//                 </p>
//               </td>
//             </tr>
//           </table>

//         </td>
//       </tr>
//     `;

//     await this.sendMail(
//       email,
//       'Reset your password — Periphex',
//       this.wrapTemplate(content, '#16a34a'),
//     );
//   }
// }



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