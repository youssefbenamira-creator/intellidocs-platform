import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import * as bcrypt from 'bcrypt';
import { LoginDto } from './dto/login.dto';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private activityLogsService: ActivityLogsService,
  ) { }

  async getTokens(userId: number, email: string, role: string) {
    const payload = { sub: userId, email, role };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: process.env.JWT_SECRET || 'super-secret-key-for-development-only-change-in-prod',
        expiresIn: '15m',
      }),
      this.jwtService.signAsync(payload, {
        secret: process.env.JWT_REFRESH_SECRET || 'super-secret-refresh-key',
        expiresIn: '7d',
      }),
    ]);

    return { access_token: accessToken, refresh_token: refreshToken };
  }

  async login(loginDto: LoginDto) {
    const user = await this.usersService.findByEmail(loginDto.email);
    if (!user) {
      throw new UnauthorizedException('invalid credentials');
    }
    if (!user.isActive) {
      throw new UnauthorizedException('this account has been revoked');
    }

    const isPasswordValid = await bcrypt.compare(loginDto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('invalid credentials');
    }

    const tokens = await this.getTokens(user.id, user.email, user.role);
    await this.usersService.updateRefreshToken(user.id, tokens.refresh_token);

    // Fire-and-forget activity log
    this.activityLogsService.logActivity(
      user.id,
      'LOGIN',
      `User ${user.email} logged in successfully`,
    ).catch(() => {});

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      }
    };
  }

  async logout(userId: number) {
    await this.usersService.updateRefreshToken(userId, null);
    this.activityLogsService.logActivity(
      userId,
      'LOGOUT',
      `User #${userId} logged out`,
    ).catch(() => {});
  }
  async refreshTokens(userId: number, rt: string) {
    try {
      this.jwtService.verify(rt, { secret: process.env.JWT_REFRESH_SECRET || 'super-secret-refresh-key' });
    } catch {
      throw new UnauthorizedException('Invalid Refresh Token');
    }

    const user = await this.usersService.findOne(userId);
    if (!user || !user.hashedRefreshToken) {
      throw new UnauthorizedException('Access Denied');
    }

    const rtMatches = await bcrypt.compare(rt, user.hashedRefreshToken);
    if (!rtMatches) {
      throw new UnauthorizedException('Access Denied');
    }

    const tokens = await this.getTokens(user.id, user.email, user.role);
    await this.usersService.updateRefreshToken(user.id, tokens.refresh_token);
    return tokens;
  }
}
