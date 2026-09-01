
# これが無いと CocoaPods が Swift をコンパイル対象に含めず、
# ビルドは成功するのにモジュールだけがバイナリに入らない（実際に踏んだ）。
Pod::Spec.new do |s|
  s.name           = 'TextRecognition'
  s.version        = '1.0.0'
  s.summary        = '端末内の文字認識（Apple Vision）'
  s.description    = 'レシート・カード利用控え・残高画面を端末内で読み取る。外部送信なし。'
  s.author         = ''
  s.homepage       = 'https://kurofukubo.com'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
