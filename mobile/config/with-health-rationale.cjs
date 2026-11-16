const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('node:fs/promises');
const path = require('node:path');

// Generate a local, offline privacy explanation for Health Connect's permission link.
module.exports = function withHealthRationale(config) {
  config = withAndroidManifest(config, mod => {
    const app = mod.modResults.manifest.application[0];
    const action = 'androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE';
    for (const activity of app.activity ?? []) {
      if (activity['intent-filter']) activity['intent-filter'] = activity['intent-filter'].filter(filter =>
        !(filter.action ?? []).some(item => item.$['android:name'] === action));
    }
    app.activity = (app.activity ?? []).filter(a => a.$['android:name'] !== '.HealthPrivacyActivity');
    app.activity.push({ $: { 'android:name': '.HealthPrivacyActivity', 'android:exported': 'true' },
      'intent-filter': [{ action: [{ $: { 'android:name': action } }] }] });
    app['activity-alias'] = (app['activity-alias'] ?? []).filter(a => a.$['android:name'] !== 'ViewPermissionUsageActivity');
    app['activity-alias'].push({ $: {
      'android:name': 'ViewPermissionUsageActivity', 'android:exported': 'true',
      'android:targetActivity': '.HealthPrivacyActivity',
      'android:permission': 'android.permission.START_VIEW_PERMISSION_USAGE',
    }, 'intent-filter': [{ action: [{ $: { 'android:name': 'android.intent.action.VIEW_PERMISSION_USAGE' } }],
      category: [{ $: { 'android:name': 'android.intent.category.HEALTH_PERMISSIONS' } }] }] });
    return mod;
  });
  return withDangerousMod(config, ['android', async mod => {
    const pkg = mod.android.package;
    const dir = path.join(mod.modRequest.platformProjectRoot, 'app/src/main/java', ...pkg.split('.'));
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'HealthPrivacyActivity.java'), `package ${pkg};
public class HealthPrivacyActivity extends android.app.Activity {
  @Override public void onCreate(android.os.Bundle state) {
    super.onCreate(state);
    android.widget.TextView text = new android.widget.TextView(this);
    text.setTextSize(18); text.setPadding(32, 48, 32, 32);
    text.setText("Dr.MAS 건강정보 접근 안내\\n\\n사용자 동의 후 최근 7일 Samsung Health 심박수를 읽습니다. 쓰기·백그라운드 권한은 요청하지 않습니다.\\n\\n조회값은 화면 메모리에서만 사용하며 원격 DB, 보호자, 외부 AI로 전송하지 않습니다. 자동 응급 감지에 사용하지 않습니다.\\n\\nHealth Connect → 앱 권한 → mobile(Dr.MAS)에서 읽기 권한을 해제할 수 있습니다. 원본 기록은 삭제하지 않습니다.");
    android.widget.ScrollView scroll = new android.widget.ScrollView(this);
    scroll.addView(text); setContentView(scroll);
  }
}
`, 'utf8');
    return mod;
  }]);
};
