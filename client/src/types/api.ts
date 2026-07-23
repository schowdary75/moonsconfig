export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiFailure {
  success: false;
  message: string;
  code?: string;
  errors?: Array<{ field?: string; message: string }>;
  requestId?: string;
}

export interface User {
  id: number;
  email: string;
  name: string | null;
  mobile: string | null;
  role: UserRole;
  roles: UserRole[];
  createdAt: string;
  updatedAt: string;
}

export type UserRole =
  | 'admin'
  | 'editor'
  | 'approver'
  | 'manager'
  | 'sales'
  | 'support'
  | 'finance'
  | 'marketing'
  | 'operations'
  | 'viewer';

export interface Session {
  accessToken: string;
  expiresIn: number;
  user: User;
}
