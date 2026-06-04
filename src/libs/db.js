import mysql from 'mysql2/promise';
import config from '../config/index.js';
import logger from '../utils/logger.js';

const pool = mysql.createPool(config.mysql);

export async function testConnection() {
  try {
    const connection = await pool.getConnection();
    await connection.ping();
    connection.release();
    logger.info('MySQL connected');
  } catch (err) {
    logger.fatal({ err }, 'MySQL connection failed');
    process.exit(1);
  }
}

export async function query(sql, params) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

export default pool;
