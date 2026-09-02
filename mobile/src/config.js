// 接続先。frontend/.env.production と同じ値。
//
// 配布するアプリに開発環境は載せない。利用者が開発環境へ繋いでしまうと、
// 別のユーザープールにアカウントを作ることになり、本人には理由が分からないまま
// 「登録したのにデータが無い」状態になる。
export const ENVIRONMENTS = {
  prod: {
    label: '本番 (prod)',
    apiUrl: 'https://ecbjdndcbe.execute-api.ap-northeast-1.amazonaws.com/prod',
    userPoolId: 'ap-northeast-1_ddBDF3HKK',
    clientId: 'lprqfuad5gm32gkb4g2bkvebk',
    authDomain: 'https://kurofukubo-auth-prod.auth.ap-northeast-1.amazoncognito.com',
  },
};

export const DEFAULT_ENV = 'prod';
