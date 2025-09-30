//  生成用户表数据，只在迁移的时候执行
import config from '../server/config/index.js';
import knex from "knex";

const conn = knex({
  client: 'mysql2',
  useNullAsDefault: true, // 避免一些 warning
  connection: {
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
  }
});

async function generateUser() {

}
generateUser().catch(console.error);