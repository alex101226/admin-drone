//  knex语法，表名添加前缀
function formatTable(table) {
  return 'dr_' + table;
}

export function createKnexQuery(fastify, table, alias = null, trx = null) {
  const tableName = formatTable(table); // 自动加前缀
  const fromClause = alias ? `${tableName} as ${alias}` : tableName;

  // 返回一个链式 QueryBuilder，并附加一些常用方法
  // const query = fastify.knexTable(fromClause);
  // 使用事务对象或者默认 knex
  const query = trx ? trx(fromClause) : fastify.knexTable(fromClause);
  // 附加辅助方法
  query.addJoin = function(joinTable, joinAlias, onCallback, type = 'left') {
    const joinTableName = formatTable(joinTable);
    const joinClause = joinAlias ? `${joinTableName} as ${joinAlias}` : joinTableName;

    switch(type) {
      case 'left':
        query.leftJoin(joinClause, onCallback);
        break;
      case 'inner':
        query.innerJoin(joinClause, onCallback);
        break;
      default:
        query.join(joinClause, onCallback);
    }
    return query; // 链式
  };

  query.addCondition = function(column, value, operator = '=') {
    if (value !== null && value !== undefined && value !== '') {
      query.andWhere(column, operator, value);
    }
    return query; // 链式
  };

  query.addPagination = function(page = 1, pageSize = 10) {
    const offset = (page - 1) * pageSize;
    query.limit(pageSize).offset(offset);
    return query; // 链式
  };

  query.addOrder = function(column = 'id', direction = 'desc') {
    query.orderBy(column, direction);
    return query; // 链式
  };

  return query;
}
