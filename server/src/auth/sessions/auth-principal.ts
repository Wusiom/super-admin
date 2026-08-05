export type AuthPrincipal = {
  userId: number;
  role: 'USER' | 'ADMIN';
  sessionId: number;
  kind: 'web';
};
