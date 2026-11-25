import * as clerk from '@clerk/clerk-react';

const personal = import.meta.env.VITE_AUTH_MODE === 'none';
const localSession = { isLoaded: true, isSignedIn: true, getToken: async () => null };
const reader = { user: { fullName: 'Local reader' } };
export const useAuth = personal ? () => localSession : clerk.useAuth;
export const useUser = personal ? () => reader : clerk.useUser;
export const useClerk = personal ? () => ({}) : clerk.useClerk;
