import config from '../config/index.js';
import logger from '../utils/logger.js';

/**
 * 调用微信 code2Session 接口，用 code 换取 openid 和 session_key
 * @param {string} code - 小程序 wx.login 获取的 code
 * @returns {Promise<{ openid: string, session_key: string }>}
 */
export async function code2Session(code) {
  const url = new URL('https://api.weixin.qq.com/sns/jscode2session');
  url.searchParams.set('appid', config.wx.appid);
  url.searchParams.set('secret', config.wx.secret);
  url.searchParams.set('js_code', code);
  url.searchParams.set('grant_type', 'authorization_code');

  const res = await fetch(url.toString());
  const data = await res.json();

  if (data.errcode) {
    logger.error({ errcode: data.errcode, errmsg: data.errmsg }, 'WeChat code2Session failed');
    const err = new Error(`WeChat API error: ${data.errmsg}`);
    err.status = 401;
    throw err;
  }

  return {
    openid: data.openid,
    sessionKey: data.session_key,
  };
}
