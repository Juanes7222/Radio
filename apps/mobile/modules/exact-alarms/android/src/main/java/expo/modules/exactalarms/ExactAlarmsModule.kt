package expo.modules.exactalarms

import android.app.AlarmManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ExactAlarmsModule : Module() {
  private val alarmManager: AlarmManager by lazy {
    requireReactContext().getSystemService(Context.ALARM_SERVICE) as AlarmManager
  }

  override fun definition() = ModuleDefinition {
    Name("ExactAlarms")

    // Android 12+ gates exact alarms behind a special-access permission that is
    // denied by default for apps targeting Android 14+. Older versions grant it implicitly.
    AsyncFunction("canScheduleExactAlarms") {
      Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarmManager.canScheduleExactAlarms()
    }

    AsyncFunction("openExactAlarmSettings") {
      val context = requireReactContext()
      val intent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).apply {
        data = Uri.parse("package:${context.packageName}")
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      context.startActivity(intent)
    }
  }

  private fun requireReactContext(): Context =
    appContext.reactContext
      ?: throw CodedException(
        code = "ERR_MISSING_CONTEXT",
        message = "React context is not available.",
        cause = null
      )
}
