// 端末内の文字認識。Apple の Vision framework をそのまま呼ぶ。
//
// 第三者の OCR SDK を入れない理由:
//   - 画像も認識結果も端末から出さない方針で、依存を増やすほど検証すべき経路が増える
//   - Vision は iOS 16 以降で日本語に対応しており、レシート・カード控えには十分
//   - 追加のモデルファイルも API キーも不要
import ExpoModulesCore
import Vision
import UIKit

public class TextRecognitionModule: Module {
  public func definition() -> ModuleDefinition {
    Name("TextRecognition")

    // 画像URI（file://）を渡すと、認識できた行を上から順に返す。
    AsyncFunction("recognize") { (uri: String, promise: Promise) in
      guard let url = URL(string: uri),
            let data = try? Data(contentsOf: url),
            let image = UIImage(data: data),
            let cgImage = image.cgImage else {
        promise.reject("E_IMAGE", "画像を読み込めませんでした")
        return
      }

      let request = VNRecognizeTextRequest { request, error in
        if let error = error {
          promise.reject("E_OCR", error.localizedDescription)
          return
        }
        let observations = request.results as? [VNRecognizedTextObservation] ?? []
        // 読み上げ順に並べたいので、上から下・左から右へ整列してから文字列を取る。
        let lines = observations
          .sorted { a, b in
            if abs(a.boundingBox.midY - b.boundingBox.midY) > 0.01 {
              return a.boundingBox.midY > b.boundingBox.midY
            }
            return a.boundingBox.minX < b.boundingBox.minX
          }
          .compactMap { $0.topCandidates(1).first?.string }
        promise.resolve(lines)
      }

      request.recognitionLevel = .accurate
      request.usesLanguageCorrection = true
      // 日本語を先に置く。レシートは英数字も混ざるので英語も候補に残す。
      // 対応していない言語を指定すると perform が throw するため、端末が対応しているものだけに絞る
      // （日本語は iOS 16 以降。それ以前の端末では英語だけで動く）。
      let wanted = ["ja-JP", "en-US"]
      if let supported = try? request.supportedRecognitionLanguages() {
        let available = wanted.filter { supported.contains($0) }
        request.recognitionLanguages = available.isEmpty ? supported : available
      } else {
        request.recognitionLanguages = wanted
      }

      DispatchQueue.global(qos: .userInitiated).async {
        do {
          try VNImageRequestHandler(cgImage: cgImage, options: [:]).perform([request])
        } catch {
          promise.reject("E_OCR", error.localizedDescription)
        }
      }
    }
  }
}
