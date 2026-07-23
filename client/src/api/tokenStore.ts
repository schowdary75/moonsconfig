let accessToken: string | null = null;
export type TokenKind = 'access' | 'legacy';
let tokenKind: TokenKind | null = null;

export const tokenStore = {
  get: () => accessToken,
  getKind: () => tokenKind,
  set: (token: string | null, kind: TokenKind = 'access') => {
    accessToken = token;
    tokenKind = token ? kind : null;
  },
};
