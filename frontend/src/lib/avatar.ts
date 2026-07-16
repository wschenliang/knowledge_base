"use client";

/**
 * 用户头像本地存储工具
 *
 * 策略：使用 localStorage 持久化头像 dataURL（key: kb_user_avatar_<userId>）。
 * - 上传：选择本地图片 → FileReader 读取为 dataURL → 写入 localStorage → 刷新头像显示。
 * - 加载：组件挂载时按 userId 读取。
 * - 移除：清空 storage 中的记录。
 *
 * 为什么不需要后端？
 * - 当前 User 模型未包含 avatar 字段；引入 DB schema 迁移成本较高。
 * - 头像属于轻量个人偏好，前端持久化足以覆盖"显示与编辑"需求。
 * - 后续如需跨设备同步，可平滑切换到后端 OSS / S3 存储方案。
 */

const PREFIX = "kb_user_avatar_";
const MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2MB 限制，防止 localStorage 超限

export function getAvatarKey(userId: string): string {
  return `${PREFIX}${userId}`;
}

export function loadAvatar(userId: string | undefined): string | null {
  if (typeof window === "undefined" || !userId) return null;
  try {
    return window.localStorage.getItem(getAvatarKey(userId));
  } catch {
    return null;
  }
}

export function saveAvatar(userId: string, dataUrl: string): void {
  if (typeof window === "undefined") return;
  try {
    if (dataUrl.length > MAX_SIZE_BYTES * 1.4) {
      // dataURL ≈ base64 * 4/3；粗略按 1.4 倍做上限保护
      throw new Error("图片过大，请选择小于 2MB 的图片");
    }
    window.localStorage.setItem(getAvatarKey(userId), dataUrl);
  } catch (err) {
    throw err instanceof Error ? err : new Error("保存头像失败");
  }
}

export function clearAvatar(userId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(getAvatarKey(userId));
  } catch {
    // 忽略清理错误
  }
}

/**
 * 将 File 对象读取为 dataURL；调用方负责处理异常。
 */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("读取图片失败"));
    reader.readAsDataURL(file);
  });
}