import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nonnorounet.wordbattleships',
  appName: 'Word Battleships',
  webDir: 'dist',
  backgroundColor: '#04100c',
  plugins: { CapacitorHttp: { enabled: false } },
};

export default config;
