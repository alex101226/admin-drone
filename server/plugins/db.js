import fastifyPlugin from 'fastify-plugin'
import mysql from 'mysql2/promise'
import config from '../config/index.js'; // 引入环境配置

function formatSQL(sql) {
  // 约定: 用 {{table}} 表示逻辑表名
  return sql.replace(/\{\{(\w+)\}\}/g, (_, table) => {
    return 'dr_' + table;
  });
}

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

  // fastify.decorate('db', pool)
  fastify.decorate('db', {
    query: async (sql, params) => {
      const finalSQL = formatSQL(sql);
      return pool.query(finalSQL, params);
    },
    execute: async (sql, params) => {
      const finalSQL = formatSQL(sql);
      return pool.execute(finalSQL, params);
    },
  });
}

export default fastifyPlugin(dbPlugin);