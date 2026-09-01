# TextRecognition（端末内OCR）

Apple Vision framework を直接呼ぶローカルモジュール。画像も認識結果も端末から出ない。

## ios/ には .swift と .podspec 以外を置かない

podspec があると ios/ ディレクトリ全体が fingerprint の対象になる。README を置いただけで
fingerprint が変わり、既存ビルドへ OTA が届かなくなる（2026-08-30 に踏んだ）。

## podspec は必須

`TextRecognition.podspec` が無いと CocoaPods がリンクせず、**ビルドは成功するのに
モジュールだけがバイナリに入らない**（2026-08-30 に踏んだ）。

リンクされているかの確認は `resolve` で行う。`search` はディレクトリを見つけるだけで、
リンクを保証しない。search の結果を根拠にしないこと。

    npx expo-modules-autolinking resolve -p apple --json

出力に `pod: TextRecognition` が現れれば正しい。
