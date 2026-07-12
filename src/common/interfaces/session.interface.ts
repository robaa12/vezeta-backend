export type UserRole = 'user' | 'admin';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  phoneNumber: string | null;
  phoneNumberVerified: boolean;
  role: UserRole;
  isActive: boolean;
  image: string | null;
  createdAt: Date;
  updatedAt: Date;
  linkedSocialProviders?: LinkedSocialProvider[];
}

export interface LinkedSocialProvider {
  provider: 'google' | 'facebook';
  linkedAt: Date;
}

export interface SessionRecord {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthSession {
  user: SessionUser;
  session: SessionRecord;
}

export interface AuthenticatedRequest {
  session?: AuthSession;
}
