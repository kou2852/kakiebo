// 端末内の文字認識（Android）。Google ML Kit の日本語モデル（アプリ同梱版）を呼ぶ。
// iOS（Apple Vision）と同じく、画像URIを受け取り「上から下・左から右」に並べた行の配列を返す。
// 画像も認識結果も端末から出さない（ML Kit は診断情報だけを Google に送る。CLAUDE.md の例外参照）。
package expo.modules.textrecognition

import android.net.Uri
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.Text
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
          // iOS と同じ並べ方。行の高さの半分以内に中心が並ぶものは同じ段として左から右へ。
          // ⚠ 以前はこれを1つの Comparator（2行ずつの比較のたびに許容誤差が変わる）で
          //   やっていたが、それだと「AとBは同じ段」「BとCは同じ段」なのに「AとCは違う段」
          //   になり得て推移律を満たさず、TimSort が
          //   `Comparison method violates its general contract!` で落ちた（実機で確認）。
          //   そのため、まず上から下へ単純にソートしてから、段をまとめる処理を分けて行う。
          val byTop = lines.sortedBy { it.boundingBox!!.centerY() }
          val rows = mutableListOf<MutableList<Text.Line>>()
          for (line in byTop) {
            val box = line.boundingBox!!
            val row = rows.lastOrNull()
            val ref = row?.first()?.boundingBox
            if (ref != null && abs(box.centerY() - ref.centerY()) <= minOf(ref.height(), box.height()) / 2) {
              row!!.add(line)
            } else {
              rows.add(mutableListOf(line))
            }
          }
          val sorted = rows.flatMap { row -> row.sortedBy { it.boundingBox!!.left } }
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
