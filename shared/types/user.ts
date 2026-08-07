export type Role = 'admin' | 'engineer' | 'cost_analyst' | 'ceo' | 'developer' | 'owner';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserUpdateInput {
  full_name?: string;
  role?: Role;
  avatar_url?: string;
  is_active?: boolean;
}
