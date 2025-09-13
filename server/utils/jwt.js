import jwt from 'jsonwebtoken';
import config from '../config/index.js';

/**
 * token生成，根据用户id和用户账户生成
 * @returns {*}
 * @param user
 */
export function generateToken(user) {
  return jwt.sign(
      { userId: user.id, username: user.username },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
  );
}

/**
 * token验证
 * @param request
 * @param reply
 * @returns {*}
 */
export function verifyToken(request, reply) {
  try {
    const authToken = request.headers['authorization'] || request.headers['token'];
    if (!authToken) {
      return reply.send({ code: 401, message: 'token 不存在' });
    }
    const token = authToken.startsWith('Bearer ') ? authToken.slice(7) : authToken;
    request.user = jwt.verify(token, config.jwt.secret);
  } catch(err) {
    return reply.send({ code: 401, message: 'token 无效或已过期' });
  }
}
