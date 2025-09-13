import { generateToken } from '../utils/jwt.js';

async function userRoutes(fastify) {

  // fastify.get('/', function (request, reply) {
  //   reply.send({ info: 'world' })
  // })

  //  获取所有的用户信息列表
  fastify.get('/getUser', async function (request, reply) {
    try {
      const { page = 1, pageSize = 10, role_id = 2 } = request.query;
      const offset = (page - 1) * pageSize;

      // 查询总数
      const [countRows] = await fastify.db.execute(`SELECT COUNT(*) as total FROM zn_users u
      INNER JOIN zn_user_roles ur ON u.id = ur.user_id WHERE ur.role_id = ?`, [Number(role_id)]);
      const total = countRows[0].total;
      // 查询分页数据
      const [rows] = await fastify.db.execute(`
        SELECT
            u.id,
            u.username,
            u.nickname,
            u.status,
            u.position,
            u.department,
            u.created_at,
            r.role_name,
            r.role_description,
            u.office_location
        FROM zn_users u
                 INNER JOIN zn_user_roles ur ON u.id = ur.user_id
                 INNER JOIN zn_roles r ON ur.role_id = r.id
        WHERE ur.role_id = ?
        ORDER BY u.id DESC
            LIMIT ${pageSize} OFFSET ${offset}
    `, [Number(role_id)]);
      reply.send({
        data: {
          data: rows,
          page: Number(page),
          pageSize: Number(pageSize),
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      })
    } catch (err) {
      fastify.log.error(`获取所有的用户信息列表的catch捕捉错误 >>> ${err}`);
      throw err;
    }
  })

  //  创建用户
  fastify.post('/addUser', async function (request, reply) {
    try {
      const { username, nickname, password, status, position, department, office_location, role_id } = request.body;
      // console.log('查看添加人员的报错============', request.body)

      // 简单校验
      if (!username || !nickname || !password) {
        return reply.send({ code: 400, message: '用户名/昵称/密码不能为空', data: null })
      }

      const rows = await fastify.db.execute(`SELECT username FROM zn_users WHERE username = ?`, [username]);
      if (rows.username === username) {
        return reply.send({ code: 400, message: '用户已存在', data: null })
      }

      // 1. 加密密码
      const hashedPassword = await fastify.hashPassword(password);

      const sql = `INSERT INTO zn_users (nickname, username, password, status, position, department, office_location, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`;
      const [result] = await fastify.db.execute(sql, [nickname, username, hashedPassword, status, position, department, office_location]);
      const userId = result.insertId;
      // 2. 插入用户-角色表（写死超级管理员 role_id=1）
      await fastify.db.execute('INSERT INTO zn_user_roles (user_id, role_id) VALUES (?, ?)', [userId, role_id]);

      // 3. 插入用户-权限表（写死权限 id=[1,2,3,4]）
      const permissionIds = [1, 2, 3, 4];
      const values = permissionIds.map(pid => `(${userId}, ${pid})`).join(',');
      await fastify.db.execute(`INSERT INTO zn_user_permissions (user_id, permission_id) VALUES ${values}`);
      // 假设写数据库成功，返回结果
      return reply.send({
        message: '用户创建成功',
        data: {
          userId,
          username,
          nickname,
        },
      });

    } catch(err) {
      fastify.log.error(`创建用户的catch捕捉错误 >>>>>>>>>>>>>>>>>>>>>${err}`);
      throw err;
    }
  })

  //  修改用户信息
  fastify.post('/updateUser', async function (request, reply) {
    try {
      const { id, nickname, position, status, department, office_location } = request.body;
      if (!id) {
        return reply.send({ code: 400, message: '参数错误' })
      }
      const [result] = await fastify.db.execute(
          `UPDATE zn_users
           SET nickname = ?, \`position\` = ?, \`status\` = ?, department = ?, office_location = ?, updated_at = NOW()
           WHERE id = ?`,
          [nickname, position, status, department, office_location, id]
      );
      if (result.affectedRows > 0) {
        return reply.send({
          message: '用户修改成功',
          data: null,
        });
      } else {
        return reply.send({
          code: 400,
          message: '用户修改失败',
          data: null,
        });
      }
    } catch(err) {
      fastify.log.error(`修改用户的catch捕捉错误 >>>>>>>>>>>>>>>>>>>>>${err}`);
      throw err
    }
  })

  //  用户登录
  fastify.post('/login', async function (request, reply) {
    try {
      const { username, password } = request.body;
      if (!username || !password) {
        // const err = new Error('用户名或者密码不能为空');
        // err.statusCode = 400;
        // throw err;
        return reply.send({ code: 400, message: '用户名或者密码不能为空'})
      }

      // 去 user 表查
      const [rows] = await fastify.db.execute(`SELECT id, username, password, nickname FROM zn_users WHERE username = ?`, [username]);
      if (rows.length === 0) {
        return reply.send({ code: 400, message: '用户不存在' })
      }

      const user = rows[0];
      //  验证密码
      const isValid = await fastify.verifyPassword(password, user.password);
      if (!isValid) {
        // const err = new Error('密码错误');
        // err.statusCode = 400;
        // throw err;
        return reply.send({ code: 400, message: '密码错误' })
      }

      //  生成token
      const token = generateToken({ userId: user.id, username: username });

      return reply.send({
        message: "登录成功",
        data: {
          token,
          username: user.username,
          nickname: user.nickname,
          id: user.id,
        }
      });
    } catch(err) {
      fastify.log.error(`用户登录catch捕捉错误-------${err}`);
      throw err;
    }
  })

  //  获取登录用户信息
  fastify.get('/getUserInfo', async function (request, reply) {
    try {
      const { userId } = request.query;
      if (!userId) {
        return reply.send({ code: 400, message: '参数错误' })
      }
      const [rows] = await fastify.db.execute(`
          SELECT
              u.id,
              u.username,
              u.nickname,
              u.department,
              u.office_location,
              u.position,
              u.status,
              r.id AS role_id,
              r.role_name,
              r.role_description
          FROM zn_users u
                   INNER JOIN zn_user_roles ur ON u.id = ur.user_id
                   INNER JOIN zn_roles r ON ur.role_id = r.id
          WHERE u.id = ?
`, [userId]);
      const user = rows[0];
      if (!user) {
        return reply.send({ code: 400, message: '用户不存在' })
      }
      return reply.send({
        message: "success",
        data: {
          position: user.position,
          department: user.department,
          office_location: user.office_location,
          status: user.status,
          role_id: user.role_id,
          role_name: user.role_name,
          role_description: user.role_description,
        }
      })
    } catch(err) {
      fastify.log.error(` 获取登录用户信息catch捕捉错误-------${err}`);
      throw err;
    }
  })

  //  修改密码
  fastify.post('/savePassword', async function (request, reply) {
    try {
      const { userId, password } = request.body;

      const [rows] = await fastify.db.execute(`SELECT username FROM zn_users WHERE id = ?`, [userId]);

      if (rows.length === 0) {
        return reply.send({ message: '参数错误' })
      }

      const user = rows[0];
      if (user) {
        // 1. 加密密码
        const hashedPassword = await fastify.hashPassword(password);

        const [result] = await fastify.db.execute(
            `UPDATE zn_users SET
                    password = ?,
                    updated_at = NOW()
                WHERE id = ?`, [hashedPassword, userId]);
        if (result.affectedRows > 0) {
          //  生成token
          const token = generateToken({ userId: user.id, username: user.username });
          return reply.send({
            message: '密码修改成功',
            data: {
              token,
            }
          });
        } else {
          return reply.send({
            code: 400,
            message: '密码修改失败',
            data: null,
          });
        }
      }
    } catch(err) {
      fastify.log.error(`修改密码错误捕捉------>>>>>${err}`);
      throw err;
    }
  })

  //  获取用户定位信息
  fastify.get('/getUserTraffic', async function (request, reply) {
    try {
      const page = parseInt(request.query.page) || 1;
      const pageSize = parseInt(request.query.pageSize) || 10;
      const offset = (page - 1) * pageSize;
      const [countRows] = await fastify.db.execute(`
        SELECT COUNT(DISTINCT u.id) AS total
            FROM zn_users u
        JOIN zn_user_roles ur ON ur.user_id = u.id AND ur.role_id = 2`)
      const total = countRows[0].total;

      const sql = `
          SELECT
              u.id AS user_id,
              u.nickname,
              u.position,
              u.department,
              u.office_location,
              l.latitude,
              l.longitude,
              l.location_text,
              l.created_at AS location_time
          FROM zn_users u
                   JOIN zn_user_roles ur
                        ON ur.user_id = u.id AND ur.role_id = 2
                   LEFT JOIN (
              SELECT l1.*
              FROM zn_user_locations l1
                       JOIN (
                  SELECT user_id, MAX(created_at) AS max_created_at
                  FROM zn_user_locations
                  GROUP BY user_id
              ) lm ON l1.user_id = lm.user_id AND l1.created_at = lm.max_created_at
          ) l ON l.user_id = u.id
          ORDER BY u.id ASC
              LIMIT ${offset}, ${pageSize}`;

      const [rows] = await fastify.db.execute(sql);

      return reply.send({
        code: 0,
        data: {
          data: rows,
          page: page,
          pageSize: pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      })
    } catch(err) {
      fastify.log.error('查询用户定位信息报错', err);
      throw err;
    }
  });

  //  获取用户定位->历史轨迹数据
  fastify.get('/getUserTrafficHistory', async function (request, reply) {
    const { user_id } = request.query;
    if (!user_id) {
      return reply.send({ code: 400, message: '用户id不能为空' })
    }
    const [rows] = await fastify.db.execute(`SELECT * FROM zn_user_locations as ur WHERE ur.user_id = ?`, [user_id]);
    return reply.send({
      code: 0,
      data: rows,
    })
  })

  //  一键定位
  fastify.post('/postUsrTrafficPositon', async function (request, reply) {
    const { user_id, latitude, longitude, location_text } = request.body;

    if (!user_id) {
      return reply.send({ code: 400, message: '用户不能为空' })
    }

    const [rows] = await fastify.db.execute(
        `SELECT id FROM zn_user_locations WHERE user_id = ? ORDER BY created_at ASC`,
        [user_id]
    );
    if (rows.length >= 5) {
      const extra = rows.length - 4; // 要删掉的数量（保证插入后正好5条）
      const idsToDelete = rows.slice(0, extra).map(r => r.id);

      if (idsToDelete.length > 0) {
        await fastify.db.execute(
            `DELETE FROM zn_user_locations WHERE id IN (${idsToDelete.map(() => '?').join(',')})`,
            idsToDelete
        );
      }
    }

    const sql = `INSERT INTO zn_user_locations (user_id, latitude, longitude, location_text, created_at)
    VALUES (?, ?, ?, ?, NOW())`;

    const [result] = await fastify.db.execute(sql, [user_id, latitude, longitude, location_text]);
    if (result.affectedRows > 0) {
      return reply.send({
        code: 0,
        message: '定位成功',
        data: {
          location: location_text,
        }
      })
    } else {
      return reply.send({
        code: 400,
        message: '定位失败',
        data: null,
      });
    }
  })
}

export default userRoutes;