// ws-jwt-auth.guard.ts
//
// তোমার HTTP JwtStrategy (passport-jwt) এর payload shape অনুযায়ী লেখা।
// Passport এর AuthGuard সরাসরি WebSocket এ কাজ করে না (এটা HTTP
// request/response cycle এর জন্য বানানো), তাই WS এর জন্য আলাদা guard লাগে।
//
// @nestjs/jwt এর JwtService ব্যবহার করছি — যেহেতু তোমার auth flow এ কোথাও
// token SIGN করা হচ্ছে (login এর সময়), তোমার AuthModule এ @nestjs/jwt এর
// JwtModule.register({...}) ইতিমধ্যেই থাকার কথা। যদি না থাকে, নিচে note
// দেখো।

import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';

export interface WsAuthPayload {
  userId: string;
  email?: string;
  role: 'ADMIN' | 'STAFF' | 'STUDENT';
}

// JwtStrategy.validate() ঠিক এই shape ফেরত দেয় (sub -> userId, email, role)
interface RawJwtPayload {
  sub: string;
  email?: string;
  role: string;
}

@Injectable()
export class WsJwtAuthGuard implements CanActivate {
  constructor(private jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const client: Socket = context.switchToWs().getClient();
    const token = this.extractToken(client);

    if (!token) {
      throw new WsException('Missing authentication token');
    }

    try {
      // JwtModule এ register kora secret/options automatically use hobe —
      // JwtStrategy যেই secretOrKey (process.env.JWT_SECRET) ব্যবহার করে,
      // JwtModule.register() এও সেই same secret pass kora thakte hobe।
      const payload = this.jwtService.verify<RawJwtPayload>(token);

      const user: WsAuthPayload = {
        userId: payload.sub,
        email: payload.email,
        role: payload.role as WsAuthPayload['role'],
      };

      (client.data as any).user = user;
      return true;
    } catch {
      throw new WsException('Invalid or expired token');
    }
  }

  private extractToken(client: Socket): string | undefined {
    const fromAuth = client.handshake.auth?.token as string | undefined;
    if (fromAuth) return fromAuth;

    const header = client.handshake.headers?.authorization;
    if (header?.startsWith('Bearer ')) {
      return header.slice('Bearer '.length);
    }
    return undefined;
  }
}

/*
 * ── IMPORTANT: AuthModule check ──────────────────────────────────────
 * এই guard কাজ করার জন্য তোমার AuthModule এ JwtModule import/register
 * করা থাকতে হবে, যেমন:
 *
 *   JwtModule.register({
 *     secret: process.env.JWT_SECRET,
 *     signOptions: { expiresIn: '...' },
 *   })
 *
 * এবং এই guard যেই module এ ব্যবহার হচ্ছে (OrderTrackingModule), সেখানে
 * AuthModule import করতে হবে যাতে JwtService inject করা যায়:
 *
 *   @Module({
 *     imports: [AuthModule],
 *     ...
 *   })
 *
 * যদি তোমার AuthModule এ এখনো JwtModule register করা না থাকে (মানে
 * token signing অন্য কোনোভাবে হচ্ছে), তাহলে আমাকে বলো — সেক্ষেত্রে
 * raw `jsonwebtoken` package দিয়ে verify করতে হবে এবং সেটা package.json
 * এ direct dependency হিসেবে যুক্ত করতে হবে।
 */
