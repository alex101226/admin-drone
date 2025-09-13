import fp from 'fastify-plugin';
import { verifyToken } from '../utils/jwt.js'

async function replyPlugin(app) {
  /**
   *  添加token验证，noAuthPaths为不需要token验证的接口
   */
  app.addHook('onRequest', async (request, reply) => {
    const noAuthPaths = [
      '/api/login',
      '/uploads'
    ];

    if (noAuthPaths.some(path => request.raw.url.startsWith(path))) return;

    // 其他接口统一验证 token
    await verifyToken(request, reply);
  });

  /**
   * 接口返回数据封装
   */
  app.addHook('onSend', async (req, reply, payload) => {
    // 如果已经是包装过的，就直接返回
    try {
      let data = payload;
      // 排除静态资源请求
      if (req.raw.url.startsWith('/uploads')) {
        return data
      }

      //  转换payload数据
      if (typeof data === 'string') {
        data = JSON.parse(data);
      }

      if (data && typeof data === 'object') {
        return JSON.stringify({
          code: data.code || 0,
          message:  data.message || 'success',
          data: data.data
        });
      }
    } catch (e) {
      // 出错时直接返回原始 payload，避免双重响应
      return payload;
    }
  });

  // 错误情况可以用 setErrorHandler 统一处理
  app.setErrorHandler((error, req, reply) => {
    console.log('应该错误到这里了吧 =====>>>>>>', error.statusCode)

    const { code, message} = reqStatus(error)
    reply.status(code).send({
      code: code,
      message,
      data: null
    });
  });
}

/**
 * 报错归类
 * @param error
 * @returns {{code: *, message: string}}
 */
function reqStatus(error) {
  // 默认错误信息
  let statusCode = error.statusCode || 500
  let message = error.message || '服务器内部错误'
  switch (statusCode) {
    case 400:
      message = message || '请求参数错误'
      break
    case 401:
      message = message || '未授权，请登录'
      break
    case 403:
      message = message || '禁止访问'
      break
    case 404:
      message = message || '资源未找到'
      break
    case 422:
      message = message || '请求参数验证失败'
      break
    case 500:
    default:
      message = message || '服务器内部错误'
      statusCode = 500
  }
  return {
    code: statusCode,
    message,
  }
}

export default fp(replyPlugin)
