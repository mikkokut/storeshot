export const DEVICE_PRESETS = [
  { device: "iPhone", width: 1320, height: 2868 },
  { device: "iPad", width: 2064, height: 2752 },
  { device: "Apple Watch", width: 422, height: 514 },
  { device: "Mac", width: 2880, height: 1800 },
] as const

export type DeviceName = (typeof DEVICE_PRESETS)[number]["device"]

export function deviceName(value: string): DeviceName {
  return DEVICE_PRESETS.find((preset) => preset.device === value)?.device ?? "iPhone"
}
