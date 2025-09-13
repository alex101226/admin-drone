import fp from 'fastify-plugin'
import bcrypt from 'bcrypt'

async function hashPlugin(fastify, opts) {
  const saltRounds = opts.saltRounds || 10;

  /**
   * 密码加密
   * @password  要加密的密码
   */
  fastify.decorate('hashPassword', async (password) => {
    return bcrypt.hash(password, saltRounds)
  })

  /**
   * 密码验证
   * @params password: 输入的密码
   * @params hash: 数据库里存在的加密的密码
   */
  fastify.decorate('verifyPassword', async (password, hashPassword) => {
    return bcrypt.compare(password, hashPassword)
  })

}
export default fp(hashPlugin)