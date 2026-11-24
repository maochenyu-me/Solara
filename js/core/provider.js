/**
 * 音乐数据源（API Provider）设置层
 *
 * 这里刻意不 import 任何模块，直接读写 localStorage，
 * 避免 constants.js <-> storage.js 之间的循环依赖。
 */

export const DEFAULT_NCM_BASE_URL = "https://ncm.518339.xyz";

export const PROVIDER_METING = "meting";
export const PROVIDER_NCM = "ncm";

export const PROVIDER_STORAGE_KEYS = {
    provider: "musicApiProvider",
    ncmBaseUrl: "ncmBaseUrl",
    ncmCookie: "ncmCookie",
};

function safeGet(key) {
    try {
        return window.localStorage.getItem(key);
    } catch (error) {
        return null;
    }
}

function safeSet(key, value) {
    try {
        if (value === null || value === undefined) {
            window.localStorage.removeItem(key);
        } else {
            window.localStorage.setItem(key, value);
        }
    } catch (error) {
        // 隐私模式或配额不足时静默失败，不影响使用
    }
}

export function normalizeProvider(value) {
    return value === PROVIDER_NCM ? PROVIDER_NCM : PROVIDER_METING;
}

export function getProvider() {
    return normalizeProvider(safeGet(PROVIDER_STORAGE_KEYS.provider));
}

export function setProvider(value) {
    const normalized = normalizeProvider(value);
    safeSet(PROVIDER_STORAGE_KEYS.provider, normalized);
    return normalized;
}

export function isNcmActive() {
    return getProvider() === PROVIDER_NCM;
}

export function normalizeNcmBaseUrl(value) {
    if (typeof value !== "string") return DEFAULT_NCM_BASE_URL;
    const trimmed = value.trim().replace(/\/+$/, "");
    if (!trimmed) return DEFAULT_NCM_BASE_URL;
    if (!/^https?:\/\//i.test(trimmed)) return DEFAULT_NCM_BASE_URL;
    return trimmed;
}

export function getNcmBaseUrl() {
    return normalizeNcmBaseUrl(safeGet(PROVIDER_STORAGE_KEYS.ncmBaseUrl));
}

export function setNcmBaseUrl(value) {
    const normalized = normalizeNcmBaseUrl(value);
    safeSet(PROVIDER_STORAGE_KEYS.ncmBaseUrl, normalized);
    return normalized;
}

export function getNcmCookie() {
    const value = safeGet(PROVIDER_STORAGE_KEYS.ncmCookie);
    return typeof value === "string" ? value.trim() : "";
}

export function setNcmCookie(value) {
    const trimmed = typeof value === "string" ? value.trim() : "";
    safeSet(PROVIDER_STORAGE_KEYS.ncmCookie, trimmed || null);
    return trimmed;
}

export function clearNcmCookie() {
    safeSet(PROVIDER_STORAGE_KEYS.ncmCookie, null);
}

/**
 * 把 Solara 的四档音质映射为 NCM /song/url/v1 的 level 参数
 */
export function qualityToNcmLevel(quality) {
    switch (String(quality)) {
        case "128":
            return "standard";
        case "192":
            return "higher";
        case "999":
            return "lossless";
        case "320":
        default:
            return "exhigh";
    }
}