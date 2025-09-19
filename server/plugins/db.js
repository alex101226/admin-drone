import fastifyPlugin from 'fastify-plugin'
import mysql from 'mysql2/promise'
import knex from 'knex';
import config from '../config/index.js'; // 引入环境配置

//  sql添加表名前缀
function formatSQL(sql) {
  // 约定: 用 {{table}} 表示逻辑表名
  return sql.replace(/\{\{(\w+)\}\}/g, (_, table) => {
    return 'dr_' + table;
  });
}


const connectionLimit = 10
const queueLimit = 0

const dbConfig = {
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
}
async function dbPlugin(fastify, options) {
  const poolInstance = mysql.createPool({
    ...dbConfig,
    connectionLimit,
    queueLimit,
    waitForConnections: true,
  })

  // fastify.decorate('db', pool)
  fastify.decorate('db', {
    query: async (sql, params) => {
      const finalSQL = formatSQL(sql);
      return poolInstance.query(finalSQL, params);
    },
    execute: async (sql, params) => {
      const finalSQL = formatSQL(sql);
      return poolInstance.execute(finalSQL, params);
    },
  });

  fastify.knex = knex({
    client: 'mysql2',
    connection: dbConfig,
    pool: { min: queueLimit, max: connectionLimit },
  })

  fastify.decorate('knexTable', fastify.knex);

}

export default fastifyPlugin(dbPlugin);