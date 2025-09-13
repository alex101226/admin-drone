import fastifyPlugin from 'fastify-plugin'
import mysql from 'mysql2/promise'
import config from '../config/index.js'; // 引入环境配置

async function dbPlugin(fastify, options) {
  const pool = mysql.createPool({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  })
  fastify.decorate('db', pool)
}

export default fastifyPlugin(dbPlugin);