// 接続先。frontend/.env.local（dev）と frontend/.env.production（prod）と同じ値。
// 既定は dev。本番の家計データを書き換えるのは明示的な切り替えを経てからにする。
export const ENVIRONMENTS = {
  dev: {
    label: '開発 (dev)',
    apiUrl: 'https://9be6dndzzi.execute-api.ap-northeast-1.amazonaws.com/dev',
    userPoolId: 'ap-northeast-1_ue2pwRKaD',
    clientId: '181ndu77m3l9jr702rg36e75bc',
    authDomain: 'https://kurofukubo-auth-dev.auth.ap-northeast-1.amazoncognito.com',
  },
  prod: {
    label: '本番 (prod)',
    apiUrl: 'https://ecbjdndcbe.execute-api.ap-northeast-1.amazonaws.com/prod',
    userPoolId: 'ap-northeast-1_ddBDF3HKK',
    clientId: 'lprqfuad5gm32gkb4g2bkvebk',
    authDomain: 'https://kurofukubo-auth-prod.auth.ap-northeast-1.amazoncognito.com',
  },
};

export const DEFAULT_ENV = 'dev';
