/**
 * 自部署网易云音乐 API（NCM）访问层
 *
 * 走浏览器直连：请求发往用户自部署的实例（默认 https://ncm.518339.xyz），
 * 该实例已把本应用的前端域名加入 CORS 白名单。
 * 会员凭证通过 ?cookie= 查询参数携带（api-enhanced server.js 支持 req.query.cookie）。
 *
 * 本文件不 import constants.js / storage.js，避免循环依赖。
 */

import {
    getNcmBaseUrl,
    getNcmCookie,
    qualityToNcmLevel,
} from "./provider.js";

function upgradeHttps(url) {
    if (typeof url !== "string" || !url) return "";
    if (window.location.protocol === "https:" && url.startsWith("http://")) {
        return "https://" + url.slice("http://".length);
    }
    return url;
}

function log(debugLogger, message) {
    if (typeof debugLogger === "function") debugLogger(message);
}

/**
 * 发起一次 NCM REST 请求
 */
export async function ncmRequest(path, params = {}, debugLogger = null) {
    const base = getNcmBaseUrl();
    const query = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
        if (value === undefined || value === null || value === "") return;
        query.set(key, String(value));
    });

    const cookie = getNcmCookie();
    if (cookie) {
        query.set("cookie", cookie);
    }

    const url = `${base}${path}${query.toString() ? `?${query.toString()}` : ""}`;

    log(debugLogger, `[NCM] 请求: ${path}`);

    const response = await fetch(url, {
        method: "GET",
        headers: {
            "Accept": "application/json",
        },
    });

    if (!response.ok) {
        throw new Error(`NCM 请求失败（HTTP ${response.status}）`);
    }

    const text = await response.text();
    try {
        return JSON.parse(text);
    } catch (error) {
        throw new Error("NCM 返回内容不是合法 JSON，请检查 API 地址是否正确");
    }
}

function mapNcmSong(song) {
    const album = song.al || song.album || {};
    const artists = Array.isArray(song.ar)
        ? song.ar
        : (Array.isArray(song.artists) ? song.artists : []);

    return {
        id: song.id,
        name: song.name,
        artist: artists.map(item => item && item.name).filter(Boolean).join(" / ") || "未知艺术家",
        album: album.name || "",
        source: "netease",
        lyric_id: song.id,
        pic: upgradeHttps(album.picUrl || ""),
        pic_id: "",
        url_id: song.id,
        fee: typeof song.fee === "number" ? song.fee : null,
        duration: song.dt || song.duration || 0,
    };
}

/**
 * 搜索（走 /cloudsearch，音质字段更完整）
 */
export async function ncmSearch(keyword, limit = 20, page = 1, debugLogger = null) {
    const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit) || 20));
    const safePage = Math.max(1, Math.trunc(page) || 1);
    const offset = (safePage - 1) * safeLimit;

    const data = await ncmRequest("/cloudsearch", {
        keywords: keyword,
        type: 1,
        limit: safeLimit,
        offset,
    }, debugLogger);

    const songs = data?.result?.songs;

    if (!Array.isArray(songs)) {
        throw new Error("搜索结果格式错误");
    }

    return songs.map(mapNcmSong);
}

/**
 * 榜单/歌单曲目（走 /playlist/track/all）
 */
export async function ncmRadarPlaylist(playlistId, limit = 20, debugLogger = null) {
    const safeLimit = Math.max(1, Math.min(200, Math.trunc(limit) || 20));

    const data = await ncmRequest("/playlist/track/all", {
        id: playlistId,
        limit: safeLimit,
        offset: 0,
    }, debugLogger);

    const songs = data?.songs;

    if (!Array.isArray(songs) || songs.length === 0) {
        throw new Error("No tracks found");
    }

    return songs.slice(0, safeLimit).map(mapNcmSong);
}

/**
 * 获取播放地址，返回 { url }（与 Meting 的 types=url 响应同形）
 */
export async function ncmSongUrl(song, quality = "320", debugLogger = null) {
    const level = qualityToNcmLevel(quality);

    const data = await ncmRequest("/song/url/v1", {
        id: song.url_id || song.id,
        level,
    }, debugLogger);

    const entry = Array.isArray(data?.data) ? data.data[0] : null;
    const url = entry && typeof entry.url === "string" ? entry.url : "";

    if (!url) {
        const fee = song.fee;
        if (fee === 1) {
            throw new Error("该歌曲需要网易云会员，请先在设置登录或更换 cookie");
        }
        throw new Error("该歌曲暂无可用播放地址");
    }

    return {
        url: upgradeHttps(url),
        br: entry.br,
        size: entry.size,
        type: entry.type,
    };
}

/**
 * 获取歌词，返回 { lyric }（与 Meting 的 types=lyric 响应同形）
 */
export async function ncmLyric(song, debugLogger = null) {
    const data = await ncmRequest("/lyric", {
        id: song.lyric_id || song.id,
    }, debugLogger);

    const lyric = data?.lrc?.lyric;

    return {
        lyric: typeof lyric === "string" ? lyric : "",
        tlyric: data?.tlyric?.lyric || "",
    };
}

/**
 * 获取封面直链，返回 { url }
 */
export async function ncmPic(song, debugLogger = null) {
    const pic = upgradeHttps(song.pic || "");
    if (pic) return { url: pic };

    const data = await ncmRequest("/song/detail", {
        ids: song.pic_id || song.id,
    }, debugLogger);

    const detail = Array.isArray(data?.songs) ? data.songs[0] : null;
    return { url: upgradeHttps(detail?.al?.picUrl || "") };
}

/* ------------------------------------------------------------------ *
 * 扫码登录
 * ------------------------------------------------------------------ */

export async function ncmQrKey(debugLogger = null) {
    const data = await ncmRequest("/login/qr/key", { timestamp: Date.now() }, debugLogger);
    const unikey = data?.data?.unikey;
    if (!unikey) throw new Error("获取登录二维码失败");
    return unikey;
}

export async function ncmQrCreate(key, debugLogger = null) {
    const data = await ncmRequest("/login/qr/create", {
        key,
        qrimg: "true",
        timestamp: Date.now(),
    }, debugLogger);

    const qrimg = data?.data?.qrimg;
    if (!qrimg) throw new Error("生成登录二维码失败");
    return qrimg;
}

/**
 * 轮询扫码状态
 * 800 二维码过期 / 801 等待扫码 / 802 已扫码待确认 / 803 登录成功（返回 cookie）
 */
export async function ncmQrCheck(key, debugLogger = null) {
    const data = await ncmRequest("/login/qr/check", {
        key,
        timestamp: Date.now(),
    }, debugLogger);

    return {
        code: data?.code,
        message: data?.message || "",
        cookie: typeof data?.cookie === "string" ? data.cookie : "",
    };
}

/**
 * 登录状态；未登录时 profile 为 null
 */
export async function ncmLoginStatus(debugLogger = null) {
    const data = await ncmRequest("/login/status", { timestamp: Date.now() }, debugLogger);
    const profile = data?.data?.profile || data?.profile || null;
    return profile;
}

export async function ncmLogout(debugLogger = null) {
    try {
        await ncmRequest("/logout", { timestamp: Date.now() }, debugLogger);
    } catch (error) {
        log(debugLogger, `[NCM] 退出登录请求失败：${error.message}`);
    }
}