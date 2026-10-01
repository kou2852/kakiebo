// Google・Apple のログイン／ログアウトから戻ってくる先（kurofukubo://auth）の受け口。
//
// Android は認証用のブラウザ（Chrome の Custom Tab）から kurofukubo://auth を開いてアプリへ戻る。
// この画面が無いと、expo-router が /auth を探して見つけられず「Unmatched Route / Go back」の画面を出し、
// 利用者が自分で戻らないといけなかった（2026-10-02 に Pixel で確認）。
// ログインの結果そのものは expo-web-browser が受け取るので、ここでは何もせず元の画面へ戻すだけ。
// iOS は戻り先を認証用の画面の中で受け取るため、ここへは来ない。
import { useEffect } from 'react';
import { useRouter } from 'expo-router';

export default function AuthReturn() {
  const router = useRouter();
  useEffect(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);
  return null;
}
