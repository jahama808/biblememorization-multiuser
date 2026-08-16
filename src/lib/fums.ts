export function configFumsUser(userId: string) {
  if (typeof window !== 'undefined' && window.fums) {
    window.fums('config', { userId });
  }
}

export function trackFums(tokens: string | string[]) {
  if (typeof window !== 'undefined' && window.fums && tokens && (Array.isArray(tokens) ? tokens.length : true)) {
    window.fums('trackView', tokens);
  }
}
