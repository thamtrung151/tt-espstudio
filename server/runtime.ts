import path from 'node:path';

/** Build a private compiler environment without mutating the caller's environment. */
export function isolatedToolchain(runtime: string, data: string, inherited: NodeJS.ProcessEnv = process.env) {
  if (!path.isAbsolute(runtime) || !path.isAbsolute(data)) throw new Error('Đường dẫn runtime và dữ liệu Agent phải tuyệt đối.');
  const env: NodeJS.ProcessEnv = { ...inherited };
  for (const key of Object.keys(env)) {
    if (/^(PLATFORMIO_|PYTHON|PIP_|VIRTUAL_ENV$|CONDA_)/i.test(key)) delete env[key];
  }
  const core = path.join(data, 'platformio');
  Object.assign(env, {
    PLATFORMIO_CORE_DIR: core,
    PLATFORMIO_PACKAGES_DIR: path.join(core, 'packages'),
    PLATFORMIO_PLATFORMS_DIR: path.join(core, 'platforms'),
    PLATFORMIO_GLOBALLIB_DIR: path.join(core, 'lib'),
    PLATFORMIO_CACHE_DIR: path.join(core, '.cache'),
    PLATFORMIO_SETTING_ENABLE_TELEMETRY: 'No',
    PLATFORMIO_DISABLE_UPGRADE_CHECK: 'true',
    PYTHONIOENCODING: 'utf-8', PYTHONNOUSERSITE: '1',
  });
  return { executable: path.join(runtime, 'python', 'python.exe'), prefix: ['-I', '-X', 'utf8', '-m', 'platformio'], env };
}
