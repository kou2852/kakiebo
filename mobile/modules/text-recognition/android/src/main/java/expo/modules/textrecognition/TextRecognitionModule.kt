// 端末内の文字認識（Android）。Google ML Kit の日本語モデル（アプリ同梱版）を呼ぶ。
// iOS（Apple Vision）と同じく、画像URIを受け取り「上から下・左から右」に並べた行の配列を返す。
// 画像も認識結果も端末から出さない（ML Kit は診断情報だけを Google に送る。CLAUDE.md の例外参照）。
package expo.modules.textrecognition

import android.net.Uri
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.japanese.JapaneseTextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlin.math.abs

class TextRecognitionModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("TextRecognition")

    AsyncFunction("recognize") { uri: String, promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.reject("E_IMAGE", "画像を読み込めませんでした", null)
        return@AsyncFunction
      }
      val image = try {
        // 写真の向き（EXIF）は fromFilePath が読んで直す
        InputImage.fromFilePath(context, Uri.parse(uri))
      } catch (e: Exception) {
        promise.reject("E_IMAGE", "画像を読み込めませんでした", e)
        return@AsyncFunction
      }
      val recognizer = TextRecognition.getClient(JapaneseTextRecognizerOptions.Builder().build())
      recognizer.process(image)
        .addOnSuccessListener { text ->
          val lines = text.textBlocks.flatMap { it.lines }.filter { it.boundingBox != null }
          // iOS と同じ並べ方。行の高さの半分以内に中心が並ぶものは同じ段として左から右へ
          val sorted = lines.sortedWith { a, b ->
            val ra = a.boundingBox!!; val rb = b.boundingBox!!
            val tol = minOf(ra.height(), rb.height()) / 2
            if (abs(ra.centerY() - rb.centerY()) > tol) ra.centerY().compareTo(rb.centerY())
            else ra.left.compareTo(rb.left)
          }
          promise.resolve(sorted.map { it.text })
          recognizer.close()
        }
        .addOnFailureListener { e ->
          promise.reject("E_OCR", e.localizedMessage ?: "文字を読み取れませんでした", e)
          recognizer.close()
        }
    }
  }
}
